/**
 * TOOL 3 of 5 - value_and_cost
 *
 * Joins adoption with spend and gives each agent a disposition: promote,
 * improve, consolidate or retire.
 *
 * Reads three things, and keeps them clearly apart:
 *
 *   1. ADOPTION      Dataverse conversation KPI aggregates. Sessions,
 *                    deflection, escalation. Drives the verdict.
 *   2. CONSUMPTION   Power Platform licensing API. Messages and billed sessions
 *                    PER AGENT - the data behind the Copilot Studio pages in
 *                    the admin center. Priced with a stated rate (see
 *                    domain/rates.ts) to give a per-agent cost.
 *   3. BILLED SPEND  Azure Cost Management. What Azure actually invoiced, at
 *                    the scope level.
 *
 * 2 and 3 are different kinds of number and are never added together. Metered
 * consumption priced at a rate is a derived figure; the Cost Management total
 * is a billed figure. Both are reported, each labelled, so an administrator can
 * reconcile them - and a gap between them is itself informative, usually
 * meaning prepaid capacity is absorbing consumption the invoice never shows.
 *
 * PRIVACY - THE HARD RULE
 * Adoption comes from a pre-aggregated analytics table. No message content is
 * read, logged or returned. No end user is identified. The only personal data
 * that leaves this tool is an agent OWNER's name - an accountable party, not a
 * data subject.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type SourceReport, type ToolResult } from '../lib/result.js';
import { readerConfigured, config } from '../lib/config.js';
import { getConversationKpis } from '../connectors/kpis.js';
import { getAzureCostSummary } from '../connectors/cost.js';
import { getAgentConsumption, getCapacity, type FeatureBreakdown } from '../connectors/consumption.js';
import { buildEstate } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { classify, type Verdict } from '../domain/verdicts.js';
import { resolveRates } from '../domain/rates.js';
import {
  summarisePerAgent,
  totalCost,
  projectedMonthly,
  aggregateFeatureBreakdown,
  featurePercentages,
} from '../domain/projections.js';

export const valueAndCostInput = {
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Lookback window in days for usage and consumption. Defaults to 30.'),
  environmentId: z.string().optional().describe('Optional. Restrict to a single environment ID.'),
};

export interface AgentValueRow {
  agentId: string;
  agentName: string;
  owner: string | null;
  location: string | null;
  /** Conversation sessions from Dataverse analytics. null when unreadable. */
  sessions: number | null;
  escalationRate: number | null;
  deflectionRate: number | null;
  /** Metered messages. null when this agent is not under a billing policy. */
  messages: number | null;
  /** Billed sessions as the meter counts them, which may differ from `sessions`. */
  billedSessions: number | null;
  /** Derived: messages x rate. See consumption.rateBasis for provenance. */
  cost: number | null;
  costPerSession: number | null;
  featureBreakdown?: FeatureBreakdown;
  duplicate: boolean;
  verdict: Verdict | null;
  rationale: string;
}

export interface ConsumptionSummary {
  state: 'connected' | 'not_connected';
  reason?: string;
  policyId?: string;
  totalMessages?: number;
  totalBilledSessions?: number;
  /** Derived, not billed. Always read alongside rateBasis. */
  derivedCost?: number;
  projectedMonthlyCost?: number | null;
  currency?: string;
  rateSource?: 'operator' | 'list_price';
  rateBasis?: string;
  featureBreakdown?: FeatureBreakdown;
  featurePercentages?: Record<string, number> | null;
  /** Which agents this covers, and which it structurally cannot. */
  coverage?: string;
  agentsMetered?: number;
}

export interface CapacitySummary {
  envId: string;
  creditLimit: number;
  creditUsed: number;
  pct: number;
  overage: boolean;
}

export interface ValueAndCostData {
  windowDays: number;
  /** Azure Cost Management: what was actually invoiced, at scope level. */
  billed: {
    monthToDate: number | null;
    forecastMonthEnd: number | null;
    currency: string | null;
    scope: string | null;
    note: string;
  };
  /** Power Platform licensing: metered per agent, priced at a stated rate. */
  consumption: ConsumptionSummary;
  capacity: CapacitySummary[] | null;
  capacityNote?: string;
  /** Derived cost attributable to agents with zero conversation sessions. */
  costOnZeroUsageAgents: number | null;
  agentsAssessed: number;
  agentsWithUsageData: number;
  agentsWithConsumptionData: number;
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
        { source: 'Power Platform Licensing API', status: 'not_connected' },
        { source: 'Azure Cost Management', status: 'not_connected' },
      ],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server.',
    );
  }

  if (config.dataverseOrgUrls.length === 0) {
    return notConnected(
      'No Dataverse environments are configured, so agent adoption could not be read and no agent can be given a disposition.',
      [
        { source: 'Dataverse', status: 'not_connected', detail: 'DATAVERSE_ORG_URLS is empty.' },
        { source: 'Power Platform Licensing API', status: 'not_connected', detail: 'Not attempted without adoption data.' },
        { source: 'Azure Cost Management', status: 'not_connected', detail: 'Not attempted without adoption data.' },
      ],
      'Set DATAVERSE_ORG_URLS to the comma-separated org URLs to assess, and add the reader service principal as an Application User with a read role in each of those environments.',
    );
  }

  let estate: Awaited<ReturnType<typeof buildEstate>>;
  let usage: Awaited<ReturnType<typeof getConversationKpis>>;
  let billed: Awaited<ReturnType<typeof getAzureCostSummary>>;
  let metered: Awaited<ReturnType<typeof getAgentConsumption>>;
  let capacity: Awaited<ReturnType<typeof getCapacity>>;
  try {
    [estate, usage, billed, metered, capacity] = await Promise.all([
      buildEstate({ environmentId: args.environmentId }),
      getConversationKpis(config.dataverseOrgUrls, windowDays),
      getAzureCostSummary(),
      getAgentConsumption(windowDays),
      getCapacity(),
    ]);
  } catch (e) {
    return failed('The value and cost assessment could not be completed.', e);
  }

  const usageConnected = usage.reached.length > 0;

  // Report Dataverse PER ENVIRONMENT. Three distinct states, never conflated:
  // read with data, reachable-but-never-used (KPI table not provisioned), and
  // genuinely unreadable. An aggregate "could not read N environments" hides
  // which ones, and worse, lumps a readable empty environment in with a 403.
  const perEnv: string[] = [];
  for (const org of usage.reached) {
    perEnv.push(
      usage.noKpiTable.includes(org)
        ? `${org}: reachable, no Copilot Studio usage ever recorded (KPI table not provisioned)`
        : `${org}: read`,
    );
  }
  for (const f of usage.failed) perEnv.push(`${f.orgUrl}: UNREADABLE - ${f.reason}`);

  const sources: SourceReport[] = [
    {
      source: 'Dataverse',
      status: usageConnected ? (usage.failed.length > 0 ? 'partial' : 'connected') : 'not_connected',
      detail: perEnv.join('; '),
    },
    {
      source: 'Power Platform Licensing API',
      status: metered.state === 'connected' ? 'connected' : 'not_connected',
      ...(metered.state === 'not_connected' ? { detail: metered.reason } : {}),
    },
    {
      source: 'Azure Cost Management',
      status: billed.state === 'connected' ? 'connected' : 'not_connected',
      ...(billed.state === 'not_connected' ? { detail: billed.reason } : {}),
    },
  ];

  if (!usageConnected) {
    return notConnected(
      'No Dataverse environment could be read, so no agent adoption is available and no disposition can be recommended.',
      sources,
      `Add the reader service principal as an Application User with a read role in each environment. ${usage.failed
        .map((f) => `${f.orgUrl}: ${f.reason}`)
        .join(' ')}`,
    );
  }

  // ---- adoption, per agent -------------------------------------------------
  const perAgentUsage = new Map<string, { sessions: number; deflected: number; escalated: number }>();
  for (const kpi of usage.kpis) {
    const acc = perAgentUsage.get(kpi.botId) ?? { sessions: 0, deflected: 0, escalated: 0 };
    acc.sessions += kpi.sessions;
    acc.deflected += kpi.deflectionRate * kpi.sessions;
    acc.escalated += kpi.escalationRate * kpi.sessions;
    perAgentUsage.set(kpi.botId, acc);
  }

  // ---- consumption, per agent ---------------------------------------------
  const rates = resolveRates();
  const meteredSummaries = metered.state === 'connected' ? summarisePerAgent(metered.rows, rates) : [];
  const perAgentMetered = new Map(meteredSummaries.map((s) => [s.botId, s]));

  const consumption: ConsumptionSummary =
    metered.state === 'connected'
      ? {
          state: 'connected',
          policyId: metered.policyId,
          totalMessages: meteredSummaries.reduce((n, s) => n + s.messages, 0),
          totalBilledSessions: meteredSummaries.reduce((n, s) => n + s.sessions, 0),
          derivedCost: totalCost(meteredSummaries),
          projectedMonthlyCost: projectedMonthly(totalCost(meteredSummaries), windowDays),
          currency: rates.currency,
          rateSource: rates.source,
          rateBasis: rates.basis,
          agentsMetered: meteredSummaries.length,
          ...(aggregateFeatureBreakdown(meteredSummaries)
            ? {
                featureBreakdown: aggregateFeatureBreakdown(meteredSummaries),
                featurePercentages: featurePercentages(aggregateFeatureBreakdown(meteredSummaries)),
              }
            : {}),
          coverage:
            'Covers agents under the pay-as-you-go billing policy only. Agents in environments on prepaid capacity packs are not metered here and appear with no consumption - unmeasured, not free.',
        }
      : { state: 'not_connected', reason: metered.reason };

  // ---- join ----------------------------------------------------------------
  const clusterIds = new Set(
    findDuplicateClusters(estate.agents).flatMap((c) => c.agents.map((a) => a.id)),
  );

  const rows: AgentValueRow[] = estate.agents.map((agent) => {
    const usageRow = perAgentUsage.get(agent.id);
    const meteredRow = perAgentMetered.get(agent.id);

    // Copilot Studio analytics live in the environments we read, so a Copilot
    // Studio agent absent from the KPI table genuinely had zero sessions. An
    // agent from any other store is unmeasured, and stays null.
    const measurable = agent.platform === 'copilot_studio' || usageRow !== undefined;
    const sessions = usageRow ? usageRow.sessions : measurable ? 0 : null;

    const escalationRate =
      usageRow && usageRow.sessions > 0
        ? usageRow.escalated / usageRow.sessions
        : sessions === 0
          ? 0
          : null;
    const deflectionRate =
      usageRow && usageRow.sessions > 0
        ? usageRow.deflected / usageRow.sessions
        : sessions === 0
          ? 0
          : null;

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
      messages: meteredRow ? meteredRow.messages : null,
      billedSessions: meteredRow ? meteredRow.sessions : null,
      cost: meteredRow ? meteredRow.cost : null,
      costPerSession: meteredRow ? meteredRow.costPerSession : null,
      ...(meteredRow?.featureBreakdown ? { featureBreakdown: meteredRow.featureBreakdown } : {}),
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

  // The headline finding: money going to agents nobody uses. Only computable
  // for agents that are BOTH metered and have readable adoption.
  const zeroUsageRows = rows.filter((r) => r.sessions === 0 && r.cost !== null);
  const costOnZeroUsageAgents =
    metered.state === 'connected'
      ? Number(zeroUsageRows.reduce((sum, r) => sum + (r.cost ?? 0), 0).toFixed(2))
      : null;

  rows.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || (b.sessions ?? -1) - (a.sessions ?? -1));

  const data: ValueAndCostData = {
    windowDays,
    billed: {
      monthToDate: billed.state === 'connected' ? Number(billed.monthToDate.toFixed(2)) : null,
      forecastMonthEnd:
        billed.state === 'connected' && billed.forecastMonthEnd !== undefined
          ? Number(billed.forecastMonthEnd.toFixed(2))
          : null,
      currency: billed.state === 'connected' ? billed.currency : null,
      scope: billed.state === 'connected' ? billed.scope : (billed.scope ?? null),
      note: 'Invoiced by Azure for this scope. Not the same measure as the per-agent consumption figures, and not to be added to them: prepaid capacity absorbs consumption that never reaches an invoice.',
    },
    consumption,
    capacity: capacity.state === 'connected' ? capacity.capacities : null,
    ...(capacity.state === 'not_connected' ? { capacityNote: capacity.reason } : {}),
    costOnZeroUsageAgents,
    agentsAssessed: rows.length,
    agentsWithUsageData: rows.filter((r) => r.sessions !== null).length,
    agentsWithConsumptionData: rows.filter((r) => r.messages !== null).length,
    zeroUsageAgents: rows.filter((r) => r.sessions === 0).length,
    verdictCounts,
    agents: rows.slice(0, MAX_ROWS),
  };

  // ---- summary -------------------------------------------------------------
  const parts: string[] = [
    `Over ${windowDays} days: ${data.agentsWithUsageData} of ${data.agentsAssessed} agents had readable adoption, ${data.zeroUsageAgents} had zero sessions.`,
  ];

  if (usage.noKpiTable.length > 0) {
    parts.push(
      `${usage.noKpiTable.length} of ${config.dataverseOrgUrls.length} environment(s) have never recorded Copilot Studio usage (KPI table not provisioned) - reachable, genuinely zero, not a connection problem.`,
    );
  }

  if (consumption.state === 'connected') {
    parts.push(
      `${consumption.agentsMetered} agents metered ${consumption.totalMessages} messages, ` +
        `costing ${consumption.derivedCost} ${consumption.currency} at the ${
          consumption.rateSource === 'operator' ? 'configured' : 'published list'
        } rate` +
        (consumption.projectedMonthlyCost !== null
          ? ` (${consumption.projectedMonthlyCost} ${consumption.currency} projected for 30 days).`
          : '.'),
    );
    if (costOnZeroUsageAgents !== null && costOnZeroUsageAgents > 0) {
      parts.push(
        `${costOnZeroUsageAgents} ${consumption.currency} of that went to agents with zero conversation sessions.`,
      );
    }
  } else {
    parts.push('Per-agent consumption could not be read, so no per-agent cost is reported.');
  }

  parts.push(
    billed.state === 'connected'
      ? `Azure invoiced ${data.billed.monthToDate} ${data.billed.currency} month to date for ${data.billed.scope}.`
      : 'Azure billed spend could not be read.',
  );

  const summary = parts.join(' ');

  const degraded =
    billed.state === 'not_connected' ||
    metered.state === 'not_connected' ||
    usage.failed.length > 0;

  return degraded
    ? partial(
        summary,
        data,
        sources,
        [
          metered.state === 'not_connected' ? `Per-agent consumption: ${metered.reason}` : '',
          billed.state === 'not_connected' ? `Billed spend: ${billed.reason}` : '',
          usage.failed.length > 0
            ? `Adoption: ${usage.failed.map((f) => `${f.orgUrl} - ${f.reason}`).join('; ')}`
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
      'Rank agents by real adoption and real per-agent message consumption, price that consumption at a stated rate, show what Azure actually invoiced, and give each agent a verdict: promote, improve, consolidate or retire. Highlights spend on agents nobody uses. Aggregate only, no conversation content. Read-only.',
    inputSchema: valueAndCostInput,
  },
  handler: async (args: { days?: number; environmentId?: string }) =>
    toMcpContent(await valueAndCost(args)),
};
