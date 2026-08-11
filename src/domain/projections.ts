/**
 * Projections over consumption already read.
 *
 * Pure arithmetic, no I/O. Every function here takes real metered rows and
 * returns a figure whose method is stated by its own name: a projection is
 * labelled a projection, and the window it was extrapolated from travels with
 * it in the tool result. Nothing here invents an input.
 */

import type { AgentConsumptionDaily, FeatureBreakdown } from '../connectors/consumption.js';
import { costOf, type Rates } from './rates.js';

/** One agent, rolled up across the window. */
export interface AgentConsumptionSummary {
  botId: string;
  envId: string;
  messages: number;
  /** Billed sessions, as reported by the meter. */
  sessions: number;
  /** Distinct days on which this agent consumed anything. */
  activeDays: number;
  meters: string[];
  featureBreakdown?: FeatureBreakdown;
  /** Derived from `messages` and the rates - see rates.basis for provenance. */
  cost: number;
  /** Cost per billed session. Null when the agent had no sessions. */
  costPerSession: number | null;
}

const EMPTY_BREAKDOWN: FeatureBreakdown = {
  generativeAnswers: 0,
  agentActions: 0,
  agentFlows: 0,
  textTools: 0,
};

function addBreakdown(a: FeatureBreakdown, b: FeatureBreakdown): FeatureBreakdown {
  return {
    generativeAnswers: a.generativeAnswers + b.generativeAnswers,
    agentActions: a.agentActions + b.agentActions,
    agentFlows: a.agentFlows + b.agentFlows,
    textTools: a.textTools + b.textTools,
  };
}

/** Roll daily rows up to one row per agent. */
export function summarisePerAgent(
  rows: AgentConsumptionDaily[],
  rates: Rates,
): AgentConsumptionSummary[] {
  const byAgent = new Map<string, AgentConsumptionDaily[]>();
  for (const row of rows) {
    const list = byAgent.get(row.botId) ?? [];
    list.push(row);
    byAgent.set(row.botId, list);
  }

  const summaries: AgentConsumptionSummary[] = [];

  for (const [botId, agentRows] of byAgent) {
    const messages = agentRows.reduce((n, r) => n + r.messageCount, 0);
    const sessions = agentRows.reduce((n, r) => n + r.sessionCount, 0);
    // A null meter is priced as standard by costOf, so it must be REPORTED as
    // standard too. Dropping nulls here would price an agent at the standard
    // rate while showing no meter at all, leaving the figure untraceable.
    const meters = [...new Set(agentRows.map((r) => r.modelMeter ?? 'standard'))];

    // Cost is summed per row, not computed on the total, because rows on the
    // premium meter price differently from rows on the standard one.
    const cost = Number(
      agentRows.reduce((sum, r) => sum + costOf(r.messageCount, r.modelMeter, rates), 0).toFixed(2),
    );

    const withBreakdown = agentRows.filter((r) => r.featureBreakdown);
    const featureBreakdown =
      withBreakdown.length > 0
        ? withBreakdown.reduce((acc, r) => addBreakdown(acc, r.featureBreakdown!), EMPTY_BREAKDOWN)
        : undefined;

    summaries.push({
      botId,
      envId: agentRows[0]!.envId,
      messages,
      sessions,
      activeDays: new Set(agentRows.map((r) => r.date)).size,
      meters,
      ...(featureBreakdown ? { featureBreakdown } : {}),
      cost,
      costPerSession: sessions > 0 ? Number((cost / sessions).toFixed(4)) : null,
    });
  }

  return summaries.sort((a, b) => b.cost - a.cost || b.messages - a.messages);
}

/** Total derived cost across the window. */
export function totalCost(summaries: AgentConsumptionSummary[]): number {
  return Number(summaries.reduce((sum, s) => sum + s.cost, 0).toFixed(2));
}

/**
 * Extrapolate the observed window to 30 days.
 *
 * Deliberately linear, and deliberately divided by the WINDOW length rather
 * than by the number of days that happened to have data: an agent idle for
 * half the window is genuinely averaging less per day, and dividing by active
 * days only would flatter it.
 */
export function projectedMonthly(cost: number, windowDays: number): number | null {
  if (windowDays <= 0) return null;
  return Number(((cost / windowDays) * 30).toFixed(2));
}

/** Sum the feature split across agents. Undefined when no row carried one. */
export function aggregateFeatureBreakdown(
  summaries: AgentConsumptionSummary[],
): FeatureBreakdown | undefined {
  const withBreakdown = summaries.filter((s) => s.featureBreakdown);
  if (withBreakdown.length === 0) return undefined;
  return withBreakdown.reduce((acc, s) => addBreakdown(acc, s.featureBreakdown!), EMPTY_BREAKDOWN);
}

/** The feature split as percentages. Null when the total is zero. */
export function featurePercentages(
  breakdown: FeatureBreakdown | undefined,
): Record<keyof FeatureBreakdown, number> | null {
  if (!breakdown) return null;

  const total =
    breakdown.generativeAnswers +
    breakdown.agentActions +
    breakdown.agentFlows +
    breakdown.textTools;

  if (total === 0) return null;

  return {
    generativeAnswers: Number(((breakdown.generativeAnswers / total) * 100).toFixed(1)),
    agentActions: Number(((breakdown.agentActions / total) * 100).toFixed(1)),
    agentFlows: Number(((breakdown.agentFlows / total) * 100).toFixed(1)),
    textTools: Number(((breakdown.textTools / total) * 100).toFixed(1)),
  };
}
