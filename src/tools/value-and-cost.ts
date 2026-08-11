/**
 * TOOL 3 of 5 - value_and_cost
 *
 * Joins aggregate adoption with real Azure spend and gives each agent a
 * disposition: promote, improve, consolidate or retire.
 *
 * Reads: Dataverse conversation KPI aggregates, and Azure Cost Management.
 *
 * PRIVACY - THE HARD RULE
 * Usage comes from a pre-aggregated analytics table: session counts, deflection
 * and escalation rates. No message content is read, logged or returned, and no
 * end user is ever identified. The only personal data that leaves this tool is
 * an agent OWNER's name - an accountable party, not a data subject.
 *
 * COST - THE OTHER HARD RULE
 * Spend is tenant-level from Azure Cost Management. Azure does not attribute
 * cost per agent, so this tool does NOT invent a per-agent figure by dividing
 * the total. It reports the real total, the real forecast, and separately the
 * agents that are running with no usage - which is the actionable finding.
 * If usage is readable and cost is not (or vice versa), the result is `partial`
 * with the side that was read, never a blend.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type SourceReport, type ToolResult } from '../lib/result.js';
import { readerConfigured, config } from '../lib/config.js';
import { getConversationKpis } from '../connectors/kpis.js';
import { getAzureCostSummary } from '../connectors/cost.js';
import { buildEstate } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { classify, type Verdict } from '../domain/verdicts.js';

export const valueAndCostInput = {
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Lookback window in days for usage signals. Defaults to 30.'),
  environmentId: z.string().optional().describe('Optional. Restrict to a single environment ID.'),
};

export interface AgentValueRow {
  agentId: string;
  agentName: string;
  owner: string | null;
  location: string | null;
  /** null when this agent's environment had no readable usage data. */
  sessions: number | null;
  escalationRate: number | null;
  deflectionRate: number | null;
  duplicate: boolean;
  verdict: Verdict | null;
  rationale: string;
}

export interface ValueAndCostData {
  windowDays: number;
  /** Real billed spend for the scope. null when Cost Management was unreadable. */
  monthToDateCost: number | null;
  forecastMonthEnd: number | null;
  currency: string | null;
  costScope: string | null;
  /** Deliberately absent: per-agent cost. Azure does not attribute it. */
  costAttributionNote: string;
  agentsAssessed: number;
  agentsWithUsageData: number;
  zeroUsageAgents: number;
  verdictCounts: Record<string, number>;
  agents: AgentValueRow[];
}

const MAX_ROWS = 150;

export async function valueAndCost(args: {
  days?: number;
  environmentId?: string;
}): Promise<ToolResult<ValueAndCostData>> {
  const windowDays = args.days ?? 30;

  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so neither usage nor spend could be read. No figures can be reported.',
      [
        { source: 'Dataverse', status: 'not_connected' },
        { source: 'Azure Cost Management', status: 'not_connected' },
      ],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server.',
    );
  }

  if (config.dataverseOrgUrls.length === 0) {
    return notConnected(
      'No Dataverse environments are configured, so agent usage could not be read and no agent can be given a disposition.',
      [
        { source: 'Dataverse', status: 'not_connected', detail: 'DATAVERSE_ORG_URLS is empty.' },
        { source: 'Azure Cost Management', status: 'not_connected', detail: 'Not attempted without usage data.' },
      ],
      'Set DATAVERSE_ORG_URLS to the comma-separated org URLs to assess, and add the reader service principal as an Application User with a read role in each of those environments.',
    );
  }

  let estate: Awaited<ReturnType<typeof buildEstate>>;
  let usage: Awaited<ReturnType<typeof getConversationKpis>>;
  let cost: Awaited<ReturnType<typeof getAzureCostSummary>>;
  try {
    [estate, usage, cost] = await Promise.all([
      buildEstate({ environmentId: args.environmentId }),
      getConversationKpis(config.dataverseOrgUrls, windowDays),
      getAzureCostSummary(),
    ]);
  } catch (e) {
    return failed('The value and cost assessment could not be completed.', e);
  }

  const usageConnected = usage.reached.length > 0;
  const costConnected = cost.state === 'connected';

  const sources: SourceReport[] = [
    {
      source: 'Dataverse',
      status: usageConnected
        ? usage.failed.length > 0
          ? 'partial'
          : 'connected'
        : 'not_connected',
      ...(usage.failed.length > 0
        ? {
            detail: `Could not read ${usage.failed.length} environment(s): ${usage.failed
              .map((f) => `${f.orgUrl} - ${f.reason}`)
              .join('; ')}`,
          }
        : {}),
    },
    {
      source: 'Azure Cost Management',
      status: costConnected ? 'connected' : 'not_connected',
      ...(cost.state === 'not_connected' ? { detail: cost.reason } : {}),
    },
  ];

  if (!usageConnected) {
    return notConnected(
      'No Dataverse environment could be read, so no agent usage is available and no disposition can be recommended.',
      sources,
      `Add the reader service principal as an Application User with a read role in each environment. ${usage.failed
        .map((f) => `${f.orgUrl}: ${f.reason}`)
        .join(' ')}`,
    );
  }

  // Aggregate KPI rows per agent over the window.
  const perAgent = new Map<string, { sessions: number; deflected: number; escalated: number }>();
  for (const kpi of usage.kpis) {
    const acc = perAgent.get(kpi.botId) ?? { sessions: 0, deflected: 0, escalated: 0 };
    acc.sessions += kpi.sessions;
    acc.deflected += kpi.deflectionRate * kpi.sessions;
    acc.escalated += kpi.escalationRate * kpi.sessions;
    perAgent.set(kpi.botId, acc);
  }

  // Only agents living in a environment we actually read can be given a
  // usage figure. For the rest, sessions stays null and so does the verdict.
  const clusterIds = new Set(
    findDuplicateClusters(estate.agents).flatMap((c) => c.agents.map((a) => a.id)),
  );

  const rows: AgentValueRow[] = estate.agents.map((agent) => {
    const usageRow = perAgent.get(agent.id);
    // An agent from a store we can read but an environment we cannot has no
    // usage row AND no way to prove it had zero sessions. Treat Copilot Studio
    // agents as measurable (their analytics live in the envs we read) and any
    // other store as unmeasured.
    const measurable = agent.platform === 'copilot_studio' || usageRow !== undefined;

    const sessions = usageRow ? usageRow.sessions : measurable ? 0 : null;
    const escalationRate =
      usageRow && usageRow.sessions > 0 ? usageRow.escalated / usageRow.sessions : sessions === 0 ? 0 : null;
    const deflectionRate =
      usageRow && usageRow.sessions > 0 ? usageRow.deflected / usageRow.sessions : sessions === 0 ? 0 : null;

    const duplicate = clusterIds.has(agent.id);
    const { verdict, rationale } = classify({
      sessions,
      escalationRate,
      duplicate,
      orphan: !agent.owner,
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      owner: agent.owner,
      location: agent.location,
      sessions,
      escalationRate: escalationRate === null ? null : Number(escalationRate.toFixed(4)),
      deflectionRate: deflectionRate === null ? null : Number(deflectionRate.toFixed(4)),
      duplicate,
      verdict,
      rationale,
    };
  });

  const verdictCounts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.verdict ?? 'unclassified';
    verdictCounts[key] = (verdictCounts[key] ?? 0) + 1;
  }

  rows.sort((a, b) => (b.sessions ?? -1) - (a.sessions ?? -1));

  const data: ValueAndCostData = {
    windowDays,
    monthToDateCost: cost.state === 'connected' ? Number(cost.monthToDate.toFixed(2)) : null,
    forecastMonthEnd:
      cost.state === 'connected' && cost.forecastMonthEnd !== undefined
        ? Number(cost.forecastMonthEnd.toFixed(2))
        : null,
    currency: cost.state === 'connected' ? cost.currency : null,
    costScope: cost.state === 'connected' ? cost.scope : (cost.scope ?? null),
    costAttributionNote:
      'Azure Cost Management does not attribute spend to an individual agent, so no per-agent cost is reported. The figures above are the real billed total for the scope.',
    agentsAssessed: rows.length,
    agentsWithUsageData: rows.filter((r) => r.sessions !== null).length,
    zeroUsageAgents: rows.filter((r) => r.sessions === 0).length,
    verdictCounts,
    agents: rows.slice(0, MAX_ROWS),
  };

  const costPhrase = costConnected
    ? `Real spend for ${data.costScope} is ${data.monthToDateCost} ${data.currency} month to date` +
      (data.forecastMonthEnd !== null ? `, forecast ${data.forecastMonthEnd} ${data.currency} at month end.` : '.')
    : 'Azure spend could not be read, so no cost figure is reported.';

  const summary =
    `Over ${windowDays} days: ${data.agentsWithUsageData} of ${data.agentsAssessed} agents had readable usage, ` +
    `${data.zeroUsageAgents} had zero sessions. ${costPhrase}`;

  const degraded = !costConnected || usage.failed.length > 0;

  return degraded
    ? partial(
        summary,
        data,
        sources,
        [
          cost.state === 'not_connected' ? `Cost: ${cost.reason}` : '',
          usage.failed.length > 0
            ? `Usage: ${usage.failed.map((f) => `${f.orgUrl} - ${f.reason}`).join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
    : ok(summary, data, sources);
}

export const valueAndCostTool = {
  name: 'value_and_cost',
  config: {
    title: 'Value and cost',
    description:
      'Rank agents by real adoption and report the real Azure spend for the scope, giving each agent a disposition: promote, improve, consolidate or retire. Usage is aggregate only, with no conversation content. Read-only.',
    inputSchema: valueAndCostInput,
  },
  handler: async (args: { days?: number; environmentId?: string }) =>
    toMcpContent(await valueAndCost(args)),
};
