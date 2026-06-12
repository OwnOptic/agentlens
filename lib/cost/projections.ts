/**
 * Cost Projection Utilities
 *
 * Helpers for calculating 7-day baseline, 30-day baseline, MTD totals,
 * and projected monthly costs from daily metrics.
 */

import type { AgentMetricDaily, CreditBreakdown } from '@/lib/types';

/**
 * Calculate baseline cost over the last N days
 */
function baselineDays(metrics: AgentMetricDaily[], days: number): number {
  if (metrics.length === 0) return 0;
  const take = Math.min(days, metrics.length);
  const slice = metrics.slice(0, take);
  return slice.reduce((sum, m) => sum + m.estimatedCost, 0);
}

/**
 * Calculate 7-day baseline cost (estimated total over 7 days)
 */
export function baseline7Day(metrics: AgentMetricDaily[]): number {
  return baselineDays(metrics, 7);
}

/**
 * Calculate 30-day baseline cost (estimated total over 30 days)
 */
export function baseline30Day(metrics: AgentMetricDaily[]): number {
  return baselineDays(metrics, 30);
}

/**
 * Calculate month-to-date cost
 * Assumes metrics are sorted newest-first; sums all provided metrics
 */
export function mtdCost(metrics: AgentMetricDaily[]): number {
  return metrics.reduce((sum, m) => sum + m.estimatedCost, 0);
}

/**
 * Calculate projected monthly cost based on daily run rate
 * Uses the average daily cost over available days, multiplied by 30
 */
export function projectedMonthly(metrics: AgentMetricDaily[]): number {
  if (metrics.length === 0) return 0;
  const avgDaily = mtdCost(metrics) / metrics.length;
  return avgDaily * 30;
}

/**
 * Aggregate feature breakdown across multiple days
 * Sums all feature categories
 */
export function aggregateFeatureBreakdown(
  metrics: AgentMetricDaily[]
): CreditBreakdown {
  const breakdown = {
    generativeAnswers: 0,
    agentActions: 0,
    agentFlows: 0,
    textTools: 0,
  };

  metrics.forEach((m) => {
    if (m.featureBreakdown) {
      breakdown.generativeAnswers += m.featureBreakdown.generativeAnswers;
      breakdown.agentActions += m.featureBreakdown.agentActions;
      breakdown.agentFlows += m.featureBreakdown.agentFlows;
      breakdown.textTools += m.featureBreakdown.textTools;
    }
  });

  return breakdown;
}

/**
 * Get per-feature percentages of total credits
 */
export function featurePercentages(
  breakdown: CreditBreakdown
): Record<string, number> {
  const total =
    breakdown.generativeAnswers +
    breakdown.agentActions +
    breakdown.agentFlows +
    breakdown.textTools;

  if (total === 0) {
    return {
      generativeAnswers: 0,
      agentActions: 0,
      agentFlows: 0,
      textTools: 0,
    };
  }

  return {
    generativeAnswers: (breakdown.generativeAnswers / total) * 100,
    agentActions: (breakdown.agentActions / total) * 100,
    agentFlows: (breakdown.agentFlows / total) * 100,
    textTools: (breakdown.textTools / total) * 100,
  };
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate cost per session
 */
export function costPerSession(
  totalCost: number,
  sessionCount: number
): number {
  if (sessionCount === 0) return 0;
  return totalCost / sessionCount;
}
