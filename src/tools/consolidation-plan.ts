/**
 * TOOL 4 of 5 - consolidation_plan
 *
 * Groups duplicate agents, names the one to keep, and drafts the merge, retire
 * and ownership actions.
 *
 * Adds no data source: it derives from the same sweep as sweep_inventory. Every
 * cluster carries the evidence that produced it, because the administrator has
 * to defend the recommendation to the agent's owner.
 *
 * The output is JSON plus a Markdown brief that can be pasted into an email.
 * There is no savings figure: Azure does not attribute cost per agent, so a
 * per-agent saving would be invented. Retiring N agents is reported as N agents,
 * which is a real number.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { buildEstate, unreadStores } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { buildSourceReports } from './sweep-inventory.js';
import { PLATFORM_LABEL } from '../domain/types.js';

export const consolidationPlanInput = {
  minClusterSize: z
    .number()
    .int()
    .min(2)
    .optional()
    .describe('Minimum number of agents for a group to count as a duplicate cluster. Defaults to 2.'),
};

export interface ClusterReport {
  stem: string;
  agentCount: number;
  evidence: string;
  canonical: { id: string; name: string; store: string; location: string | null; owner: string | null };
  mergeCandidates: { id: string; name: string; location: string | null; owner: string | null }[];
  locations: string[];
}

export interface ConsolidationPlanData {
  clusterCount: number;
  agentsInClusters: number;
  agentsToRetire: number;
  orphanCount: number;
  clusters: ClusterReport[];
  actions: string[];
  /** A brief the administrator can send to agent owners as-is. */
  markdownBrief: string;
}

function renderBrief(clusters: ClusterReport[], orphanCount: number, fetchedAt: string): string {
  const lines: string[] = [
    '# Agent consolidation plan',
    '',
    `Generated ${fetchedAt} by AgentLens. Every figure below was read from the tenant.`,
    '',
    `**${clusters.length} duplicate cluster${clusters.length === 1 ? '' : 's'}** covering ` +
      `${clusters.reduce((n, c) => n + c.agentCount, 0)} agents.`,
    '',
  ];

  for (const cluster of clusters) {
    lines.push(`## ${cluster.canonical.name} (+${cluster.mergeCandidates.length} duplicate)`);
    lines.push('');
    lines.push(`- Evidence: ${cluster.evidence}`);
    lines.push(
      `- Keep: **${cluster.canonical.name}** in ${cluster.canonical.location ?? 'unknown location'}` +
        (cluster.canonical.owner ? `, owned by ${cluster.canonical.owner}` : ', owner unresolved'),
    );
    lines.push('- Merge and retire:');
    for (const candidate of cluster.mergeCandidates) {
      lines.push(
        `  - ${candidate.name} in ${candidate.location ?? 'unknown location'}` +
          (candidate.owner ? ` (owner ${candidate.owner})` : ' (owner unresolved)'),
      );
    }
    lines.push('');
  }

  if (orphanCount > 0) {
    lines.push('## Ownership');
    lines.push('');
    lines.push(
      `${orphanCount} agent${orphanCount === 1 ? ' has' : 's have'} no resolvable owner. ` +
        'Assign one before any merge - an unowned agent cannot be migrated or safely retired.',
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'No cost saving is stated: Azure Cost Management does not attribute spend to an individual agent, ' +
      'so any per-agent saving would be an estimate rather than a figure read from the tenant.',
  );

  return lines.join('\n');
}

export async function consolidationPlan(args: {
  minClusterSize?: number;
}): Promise<ToolResult<ConsolidationPlanData>> {
  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so the agent list could not be read and no consolidation plan can be produced.',
      [
        { source: 'Azure Resource Graph', status: 'not_connected' },
        { source: 'Microsoft Graph', status: 'not_connected' },
      ],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server.',
    );
  }

  let estate: Awaited<ReturnType<typeof buildEstate>>;
  try {
    estate = await buildEstate();
  } catch (e) {
    return failed('The consolidation plan could not be produced.', e);
  }

  const sources = buildSourceReports(estate);
  const missing = unreadStores(estate);

  if (estate.agents.length === 0 && missing.length === estate.discovery.sources.length) {
    return notConnected(
      'No agent store could be read, so duplicates cannot be identified. This is not the same as finding no duplicates.',
      sources,
      `Grant the reader service principal access to at least one store. Not read: ${missing.join('; ')}`,
    );
  }

  const clusters = findDuplicateClusters(estate.agents, args.minClusterSize ?? 2).map(
    (c): ClusterReport => ({
      stem: c.stem,
      agentCount: c.agents.length,
      evidence: c.evidence,
      canonical: {
        id: c.canonical.id,
        name: c.canonical.name,
        store: PLATFORM_LABEL[c.canonical.platform],
        location: c.canonical.location,
        owner: c.canonical.owner,
      },
      mergeCandidates: c.mergeCandidates.map((m) => ({
        id: m.id,
        name: m.name,
        location: m.location,
        owner: m.owner,
      })),
      locations: c.locations,
    }),
  );

  const agentsToRetire = clusters.reduce((n, c) => n + c.mergeCandidates.length, 0);

  const actions: string[] = [];
  if (clusters.length > 0) {
    actions.push(
      `Merge ${agentsToRetire} duplicate agent${agentsToRetire === 1 ? '' : 's'} into the ${clusters.length} canonical agent${clusters.length === 1 ? '' : 's'} named below.`,
    );
    const crossEnv = clusters.filter((c) => c.locations.length > 1);
    if (crossEnv.length > 0) {
      actions.push(
        `${crossEnv.length} cluster${crossEnv.length === 1 ? ' spans' : 's span'} more than one location. Agree the owning environment before merging, or the duplicate will be rebuilt.`,
      );
    }
  }
  if (estate.orphans.length > 0) {
    actions.push(
      `Assign an owner to ${estate.orphans.length} agent${estate.orphans.length === 1 ? '' : 's'} with no resolvable owner before retiring anything.`,
    );
  }
  if (actions.length === 0) {
    actions.push('No duplicate clusters and no orphans were found in the stores that were read.');
  }

  const data: ConsolidationPlanData = {
    clusterCount: clusters.length,
    agentsInClusters: clusters.reduce((n, c) => n + c.agentCount, 0),
    agentsToRetire,
    orphanCount: estate.orphans.length,
    clusters,
    actions,
    markdownBrief: renderBrief(clusters, estate.orphans.length, estate.fetchedAt),
  };

  const summary =
    `${clusters.length} duplicate cluster${clusters.length === 1 ? '' : 's'} covering ${data.agentsInClusters} agents; ` +
    `${agentsToRetire} agent${agentsToRetire === 1 ? '' : 's'} could be merged away. ` +
    `${estate.orphans.length} agent${estate.orphans.length === 1 ? '' : 's'} have no resolvable owner.`;

  return missing.length > 0
    ? partial(
        `${summary} Based only on the stores that could be read.`,
        data,
        sources,
        `Not read: ${missing.join('; ')}`,
      )
    : ok(summary, data, sources);
}

export const consolidationPlanTool = {
  name: 'consolidation_plan',
  config: {
    title: 'Duplicates and consolidation plan',
    description:
      'Find duplicate agents, choose the canonical one to keep in each cluster, and draft the merge, retire and ownership actions as a brief that can be sent to agent owners. Read-only - it never merges or deletes anything.',
    inputSchema: consolidationPlanInput,
  },
  handler: async (args: { minClusterSize?: number }) => toMcpContent(await consolidationPlan(args)),
};
