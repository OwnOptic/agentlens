/**
 * AgentLens Compliance - Scoring
 *
 * Computes weighted compliance scores at two granularities:
 *   1. Per-agent score (0-100): fraction of applicable rules not violated.
 *   2. Tenant score (0-100): weighted average across all agents, factoring
 *      in environment type (prod agents carry more weight) and rule severity.
 *
 * Severity weights: critical=3, warning=2, info=1
 * Environment multiplier: Production=3, Sandbox=2, Default=1
 */

import type { Agent, Environment, ComplianceRule, ComplianceViolation } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentComplianceScore {
  agentRef: string;
  agentName: string;
  envId: string;
  envType: string;
  /** 0-100, 100 = fully compliant */
  score: number;
  /** Total violation weight accumulated (lower is better) */
  violationWeight: number;
  /** Maximum possible violation weight (all rules fire) */
  maxWeight: number;
  openViolations: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export interface TenantComplianceScore {
  /** 0-100 */
  score: number;
  agentScores: AgentComplianceScore[];
  totalOpenViolations: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** Percentage of agents that are fully compliant (score === 100) */
  compliantAgentPct: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<ComplianceViolation['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const ENV_TYPE_MULTIPLIER: Record<string, number> = {
  Production: 3,
  Sandbox: 2,
  Default: 1,
};

function envMultiplier(envType: string): number {
  return ENV_TYPE_MULTIPLIER[envType] ?? 1;
}

// ---------------------------------------------------------------------------
// Per-agent score
// ---------------------------------------------------------------------------

/**
 * Compute the compliance score for a single agent.
 *
 * Score = 100 * (1 - (actualViolationWeight / maxWeight))
 * where maxWeight = sum of SEVERITY_WEIGHT for all enabled rules.
 * A score of 100 means no open violations.
 */
export function scoreAgent(
  agent: Agent,
  env: Environment,
  rules: ComplianceRule[],
  violations: ComplianceViolation[],
): AgentComplianceScore {
  const agentRef = `${agent.envId}/${agent.botId}`;
  const enabledRules = rules.filter((r) => r.enabled);

  const agentViolations = violations.filter(
    (v) => v.agentRef === agentRef && (v.state === 'open' || v.state === 'acknowledged'),
  );

  const ruleIndex = new Map<string, ComplianceRule>(enabledRules.map((r) => [r.id, r]));

  let violationWeight = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const v of agentViolations) {
    const rule = ruleIndex.get(v.ruleId);
    const severity = rule?.severity ?? v.severity;
    violationWeight += SEVERITY_WEIGHT[severity];
    if (severity === 'critical') criticalCount++;
    else if (severity === 'warning') warningCount++;
    else infoCount++;
  }

  const maxWeight = enabledRules.reduce((acc, r) => acc + SEVERITY_WEIGHT[r.severity], 0);
  const clampedWeight = Math.min(violationWeight, maxWeight);
  const score = maxWeight === 0 ? 100 : Math.round(100 * (1 - clampedWeight / maxWeight));

  return {
    agentRef,
    agentName: agent.name,
    envId: agent.envId,
    envType: env.type,
    score: Math.max(0, score),
    violationWeight,
    maxWeight,
    openViolations: agentViolations.length,
    criticalCount,
    warningCount,
    infoCount,
  };
}

// ---------------------------------------------------------------------------
// Tenant score
// ---------------------------------------------------------------------------

/**
 * Compute a weighted tenant-level compliance score across all agents.
 *
 * Each agent's score is weighted by its environment multiplier so that
 * violations in prod environments pull the tenant score down harder.
 *
 * Tenant score = sum(agentScore * envMultiplier) / sum(100 * envMultiplier)
 */
export function scoreTenant(
  agents: Agent[],
  environments: Environment[],
  rules: ComplianceRule[],
  violations: ComplianceViolation[],
): TenantComplianceScore {
  const envMap = new Map<string, Environment>(environments.map((e) => [e.id, e]));

  let weightedScoreSum = 0;
  let totalWeight = 0;
  let totalOpenViolations = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let fullyCompliantCount = 0;

  const agentScores: AgentComplianceScore[] = [];

  for (const agent of agents) {
    const env = envMap.get(agent.envId);
    if (!env) continue;

    const as = scoreAgent(agent, env, rules, violations);
    agentScores.push(as);

    const mult = envMultiplier(env.type);
    weightedScoreSum += as.score * mult;
    totalWeight += 100 * mult;

    totalOpenViolations += as.openViolations;
    criticalCount += as.criticalCount;
    warningCount += as.warningCount;
    infoCount += as.infoCount;
    if (as.score === 100) fullyCompliantCount++;
  }

  const tenantScore =
    totalWeight === 0 ? 100 : Math.round((weightedScoreSum / totalWeight) * 100);

  const compliantAgentPct =
    agents.length === 0 ? 100 : Math.round((fullyCompliantCount / agents.length) * 100);

  return {
    score: Math.max(0, Math.min(100, tenantScore)),
    agentScores,
    totalOpenViolations,
    criticalCount,
    warningCount,
    infoCount,
    compliantAgentPct,
  };
}

// ---------------------------------------------------------------------------
// Score badge helper (for UI consumption)
// ---------------------------------------------------------------------------

export type ScoreBand = 'critical' | 'warning' | 'good' | 'excellent';

/**
 * Map a 0-100 score to a named band for badge/color rendering.
 * < 50 = critical, 50-74 = warning, 75-89 = good, >= 90 = excellent
 */
export function scoreBand(score: number): ScoreBand {
  if (score < 50) return 'critical';
  if (score < 75) return 'warning';
  if (score < 90) return 'good';
  return 'excellent';
}
