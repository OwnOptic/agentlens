/**
 * TOOL 1 of 5 - sweep_inventory
 *
 * Every AI agent in the tenant, across all four stores, with owner, location,
 * orphans and duplicate clusters.
 *
 * Reads: Azure Resource Graph, Microsoft Graph, Power Platform admin API,
 * and - when configured - Azure AI Foundry and Microsoft Fabric.
 *
 * Every other tool builds on this one.
 *
 * HONESTY: a store that could not be read reports agentCount: null, never 0.
 * The summary states how many stores were read out of how many exist, so the
 * agent can never present a partial sweep as a complete one.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type SourceReport, type ToolResult, type DataSource } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { buildEstate, anyStoreRead, type Estate } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { PLATFORM_LABEL } from '../domain/types.js';

/** Cap the rows returned to Copilot; counts always reflect the full sweep. */
const MAX_AGENT_ROWS = 200;

export const sweepInventoryInput = {
  environmentId: z
    .string()
    .optional()
    .describe('Optional. Restrict the sweep to a single Power Platform environment ID.'),
  includeOrphansOnly: z
    .boolean()
    .optional()
    .describe('Optional. When true, return only agents with no resolvable owner.'),
};

export interface StoreReport {
  store: string;
  api: string;
  status: 'connected' | 'not_connected' | 'error';
  /** null means the store was not read. It never means zero agents. */
  agentCount: number | null;
  detail?: string;
}

export interface AgentRow {
  id: string;
  name: string;
  store: string;
  location: string | null;
  owner: string | null;
}

export interface SweepInventoryData {
  fetchedAt: string;
  storesRead: number;
  storesTotal: number;
  /** Total across the stores that were read. */
  totalAgents: number;
  orphanCount: number;
  duplicateClusterCount: number;
  environmentCount: number | null;
  stores: StoreReport[];
  agents: AgentRow[];
  agentRowsTruncated: boolean;
}

const STORE_SOURCE: Record<string, DataSource> = {
  power_platform: 'Azure Resource Graph',
  m365: 'Microsoft Graph',
  foundry: 'Azure AI Foundry',
  fabric: 'Microsoft Fabric',
};

export function buildSourceReports(estate: Estate): SourceReport[] {
  const reports: SourceReport[] = estate.discovery.sources.map((s) => ({
    source: STORE_SOURCE[s.key] ?? 'Azure Resource Graph',
    status: s.status === 'ok' ? ('connected' as const) : ('not_connected' as const),
    ...(s.status === 'ok'
      ? {}
      : {
          detail:
            s.status === 'error'
              ? s.error
              : `Not configured. Requires: ${s.requiredRole}.`,
        }),
  }));

  reports.push({
    source: 'Power Platform Admin API',
    status: estate.environments ? 'connected' : 'not_connected',
    ...(estate.environments ? {} : { detail: estate.environmentsError }),
  });

  return reports;
}

export async function sweepInventory(args: {
  environmentId?: string;
  includeOrphansOnly?: boolean;
}): Promise<ToolResult<SweepInventoryData>> {
  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so no store could be read. No agent counts can be reported.',
      [
        { source: 'Azure Resource Graph', status: 'not_connected' },
        { source: 'Microsoft Graph', status: 'not_connected' },
        { source: 'Power Platform Admin API', status: 'not_connected' },
      ],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server, then grant the service principal Reader on the subscription, the Power Platform Administrator role, and admin consent for User.Read.All.',
    );
  }

  let estate: Estate;
  try {
    estate = await buildEstate({ environmentId: args.environmentId });
  } catch (e) {
    return failed('The sweep could not be completed.', e);
  }

  const sources = buildSourceReports(estate);

  const stores: StoreReport[] = estate.discovery.sources.map((s) => ({
    store: s.label,
    api: s.api,
    status: s.status === 'ok' ? 'connected' : s.status === 'error' ? 'error' : 'not_connected',
    agentCount: s.status === 'ok' ? s.count : null,
    ...(s.status === 'ok'
      ? s.truncated
        ? { detail: 'Result set was truncated; the count is a lower bound.' }
        : {}
      : { detail: s.status === 'error' ? s.error : `Requires: ${s.requiredRole}.` }),
  }));

  const storesRead = stores.filter((s) => s.status === 'connected').length;

  if (storesRead === 0 || !anyStoreRead(estate)) {
    return notConnected(
      'No agent store could be read, so no agent counts can be reported. This is not the same as finding zero agents.',
      sources,
      `Grant the reader service principal access to at least one store. ${stores
        .map((s) => `${s.store}: ${s.detail ?? 'unavailable'}`)
        .join(' ')}`,
    );
  }

  const clusters = findDuplicateClusters(estate.agents);
  const shown = args.includeOrphansOnly ? estate.orphans : estate.agents;

  const data: SweepInventoryData = {
    fetchedAt: estate.fetchedAt,
    storesRead,
    storesTotal: stores.length,
    totalAgents: estate.agents.length,
    orphanCount: estate.orphans.length,
    duplicateClusterCount: clusters.length,
    environmentCount: estate.environments ? estate.environments.length : null,
    stores,
    agents: shown.slice(0, MAX_AGENT_ROWS).map((a) => ({
      id: a.id,
      name: a.name,
      store: PLATFORM_LABEL[a.platform],
      location: a.location,
      owner: a.owner,
    })),
    agentRowsTruncated: shown.length > MAX_AGENT_ROWS,
  };

  const scope = args.environmentId ? ` in environment ${args.environmentId}` : '';
  const complete = storesRead === stores.length;

  const summary =
    `Read ${storesRead} of ${stores.length} agent stores${scope} and found ${data.totalAgents} agents: ` +
    `${data.orphanCount} with no resolvable owner and ${data.duplicateClusterCount} duplicate clusters.` +
    (complete ? '' : ' The remaining stores could not be read, so the true total may be higher.');

  return complete
    ? ok(summary, data, sources)
    : partial(
        summary,
        data,
        sources,
        `Stores not read: ${stores
          .filter((s) => s.status !== 'connected')
          .map((s) => `${s.store} - ${s.detail ?? 'unavailable'}`)
          .join('; ')}`,
      );
}

export const sweepInventoryTool = {
  name: 'sweep_inventory',
  config: {
    title: 'Sweep every agent store',
    description:
      'List every AI agent in the tenant across Copilot Studio, M365 Agent Builder, Azure AI Foundry and Microsoft Fabric, with owners, locations, orphans and duplicate clusters. Read-only.',
    inputSchema: sweepInventoryInput,
  },
  handler: async (args: { environmentId?: string; includeOrphansOnly?: boolean }) =>
    toMcpContent(await sweepInventory(args)),
};
