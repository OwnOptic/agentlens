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
 *
 * The saving is the metered consumption of the agents that would be retired,
 * priced at a stated rate and projected to 30 days. When per-agent consumption
 * cannot be read, the saving is omitted ENTIRELY rather than estimated - the
 * brief simply has no savings line. A merge is worth doing on the maintenance
 * argument alone; it does not need a made-up number to justify it.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type SourceReport, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { buildEstate, unreadStores } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { getAgentConsumption } from '../connectors/consumption.js';
import { resolveRates } from '../domain/rates.js';
import { summarisePerAgent, projectedMonthly } from '../domain/projections.js';
import { buildSourceReports } from './sweep-inventory.js';
import { PLATFORM_LABEL } from '../domain/types.js';

export const consolidationPlanInput = {
  minClusterSize: z
    .number()
    .int()
    .min(2)
    .optional()
    .describe('Minimum number of agents for a group to count as a duplicate cluster. Defaults to 2.'),
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Lookback window in days for the consumption behind the saving. Defaults to 30.'),
};

export interface ClusterReport {
  stem: string;
  agentCount: number;
  evidence: string;
  canonical: { id: string; name: string; store: string; location: string | null; owner: string | null };
  mergeCandidates: {
    id: string;
    name: string;
    location: string | null;
    owner: string | null;
    /** Metered messages over the window. null when this agent is not metered. */
    messages: number | null;
    /** Derived cost of those messages. null when not metered. */
    cost: number | null;
  }[];
  locations: string[];
}

export interface SavingEstimate {
  /** Derived cost of the merge candidates over the window. */
  windowCost: number;
  /** That cost projected to 30 days. */
  projectedMonthly: number | null;
  currency: string;
  windowDays: number;
  /** How many of the retirable agents this figure actually covers. */
  agentsCovered: number;
  agentsNotMetered: number;
  /** Rate provenance. Always stated alongside the figure. */
  basis: string;
}

export interface ConsolidationPlanData {
  clusterCount: number;
  agentsInClusters: number;
  agentsToRetire: number;
  orphanCount: number;
  clusters: ClusterReport[];
  /** Absent entirely when per-agent consumption could not be read. */
  saving?: SavingEstimate;
  savingUnavailableReason?: string;
  actions: string[];
  /** A brief the administrator can send to agent owners as-is. */
  markdownBrief: string;
}

function renderBrief(
  clusters: ClusterReport[],
  orphanCount: number,
  fetchedAt: string,
  saving: SavingEstimate | undefined,
): string {
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
          (candidate.owner ? ` (owner ${candidate.owner})` : ' (owner unresolved)') +
          (candidate.messages !== null ? ` - ${candidate.messages} messages` : ''),
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

  // No saving section at all when consumption was unreadable. An absent line
  // is honest; a hedged one invites the reader to fill in a number themselves.
  if (saving) {
    lines.push('## What retiring them saves');
    lines.push('');
    lines.push(
      `The agents marked for retirement consumed **${saving.windowCost} ${saving.currency}** ` +
        `over the last ${saving.windowDays} days` +
        (saving.projectedMonthly !== null
          ? `, or about **${saving.projectedMonthly} ${saving.currency} per 30 days**.`
          : '.'),
    );
    lines.push('');
    if (saving.agentsNotMetered > 0) {
      lines.push(
        `That covers ${saving.agentsCovered} of the retirable agents. ` +
          `${saving.agentsNotMetered} are not under a pay-as-you-go billing policy, so their ` +
          'consumption is not metered and is excluded - the real saving is higher by an unknown amount.',
      );
      lines.push('');
    }
    lines.push(`_${saving.basis}_`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'Generated by AgentLens. Consumption figures are metered per agent by the Power Platform ' +
      'licensing API; any currency figure is that consumption priced at the rate stated above.',
  );

  return lines.join('\n');
}

export async function consolidationPlan(args: {
  minClusterSize?: number;
  days?: number;
}): Promise<ToolResult<ConsolidationPlanData>> {
  const windowDays = args.days ?? 30;

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
  let metered: Awaited<ReturnType<typeof getAgentConsumption>>;
  try {
    [estate, metered] = await Promise.all([buildEstate(), getAgentConsumption(windowDays)]);
  } catch (e) {
    return failed('The consolidation plan could not be produced.', e);
  }

  const sources: SourceReport[] = [
    ...buildSourceReports(estate),
    {
      source: 'Power Platform Licensing API',
      status: metered.state === 'connected' ? 'connected' : 'not_connected',
      ...(metered.state === 'not_connected' ? { detail: metered.reason } : {}),
    },
  ];
  const missing = unreadStores(estate);

  if (estate.agents.length === 0 && missing.length === estate.discovery.sources.length) {
    return notConnected(
      'No agent store could be read, so duplicates cannot be identified. This is not the same as finding no duplicates.',
      sources,
      `Grant the reader service principal access to at least one store. Not read: ${missing.join('; ')}`,
    );
  }

  // Per-agent consumption, so the saving can be the metered cost of exactly the
  // agents being retired rather than a share of a tenant total.
  const rates = resolveRates();
  const meteredByAgent = new Map(
    (metered.state === 'connected' ? summarisePerAgent(metered.rows, rates) : []).map((s) => [
      s.botId,
      s,
    ]),
  );

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
      mergeCandidates: c.mergeCandidates.map((m) => {
        const consumption = meteredByAgent.get(m.id);
        return {
          id: m.id,
          name: m.name,
          location: m.location,
          owner: m.owner,
          messages: consumption ? consumption.messages : null,
          cost: consumption ? consumption.cost : null,
        };
      }),
      locations: c.locations,
    }),
  );

  const agentsToRetire = clusters.reduce((n, c) => n + c.mergeCandidates.length, 0);

  const retirable = clusters.flatMap((c) => c.mergeCandidates);
  const meteredRetirable = retirable.filter((m) => m.cost !== null);

  const saving: SavingEstimate | undefined =
    metered.state === 'connected' && meteredRetirable.length > 0
      ? {
          windowCost: Number(meteredRetirable.reduce((sum, m) => sum + (m.cost ?? 0), 0).toFixed(2)),
          projectedMonthly: projectedMonthly(
            meteredRetirable.reduce((sum, m) => sum + (m.cost ?? 0), 0),
            windowDays,
          ),
          currency: rates.currency,
          windowDays,
          agentsCovered: meteredRetirable.length,
          agentsNotMetered: retirable.length - meteredRetirable.length,
          basis: rates.basis,
        }
      : undefined;

  const savingUnavailableReason =
    saving === undefined
      ? metered.state === 'not_connected'
        ? metered.reason
        : 'None of the agents marked for retirement are under a pay-as-you-go billing policy, so their consumption is not metered and no saving can be stated.'
      : undefined;

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

  if (saving) {
    actions.push(
      `Retiring them recovers ${saving.windowCost} ${saving.currency} of metered consumption over ${saving.windowDays} days` +
        (saving.projectedMonthly !== null
          ? `, about ${saving.projectedMonthly} ${saving.currency} per 30 days.`
          : '.'),
    );
  }

  const data: ConsolidationPlanData = {
    clusterCount: clusters.length,
    agentsInClusters: clusters.reduce((n, c) => n + c.agentCount, 0),
    agentsToRetire,
    orphanCount: estate.orphans.length,
    clusters,
    ...(saving ? { saving } : {}),
    ...(savingUnavailableReason ? { savingUnavailableReason } : {}),
    actions,
    markdownBrief: renderBrief(clusters, estate.orphans.length, estate.fetchedAt, saving),
  };

  const summary =
    `${clusters.length} duplicate cluster${clusters.length === 1 ? '' : 's'} covering ${data.agentsInClusters} agents; ` +
    `${agentsToRetire} agent${agentsToRetire === 1 ? '' : 's'} could be merged away. ` +
    `${estate.orphans.length} agent${estate.orphans.length === 1 ? '' : 's'} have no resolvable owner.` +
    (saving
      ? ` Those agents consumed ${saving.windowCost} ${saving.currency} over ${saving.windowDays} days.`
      : ' No saving figure is available, so none is stated.');

  const degraded = missing.length > 0 || metered.state === 'not_connected';

  return degraded
    ? partial(
        `${summary}${missing.length > 0 ? ' Based only on the stores that could be read.' : ''}`,
        data,
        sources,
        [
          missing.length > 0 ? `Not read: ${missing.join('; ')}` : '',
          savingUnavailableReason ? `Saving: ${savingUnavailableReason}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
    : ok(summary, data, sources);
}

export const consolidationPlanTool = {
  name: 'consolidation_plan',
  config: {
    title: 'Duplicates and consolidation plan',
    description:
      'Find duplicate agents, choose the canonical one to keep in each cluster, and draft the merge, retire and ownership actions as a brief that can be sent to agent owners, including what the retired agents actually consume. Read-only - it never merges or deletes anything.',
    inputSchema: consolidationPlanInput,
  },
  handler: async (args: { minClusterSize?: number; days?: number }) =>
    toMcpContent(await consolidationPlan(args)),
};
