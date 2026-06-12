/**
 * AgentLens Alert Engine
 *
 * Evaluates all governance rules against live metrics, baselines, and agent inventory.
 * Returns a deduplicated, severity-ranked list of Alert objects.
 *
 * Rules implemented:
 *   budget_breach         - projectedMonthly or estimatedCost exceeds per-agent budget cap
 *   volume_spike          - messageCount > 3x 7-day average
 *   env_overage           - environment credit usage exceeds creditLimit (Capacity)
 *   new_default_env_agent - active agent detected in a Default-type environment
 *   high_consumption      - single-day estimatedCost exceeds high_consumption_threshold
 *   model_meter_mismatch  - agent uses premium meter but env/baseline expects standard
 *   orphan_idle           - agent has no lastActivity for 30+ days and no owner
 */

import type { Alert, AlertSeverity, AlertType, AgentMetricDaily, Agent, Capacity, Environment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * Baseline thresholds driving rule evaluation.
 *
 * Keys:
 *   budget_limit              - max allowed daily estimatedCost per agent (USD)
 *   budget_monthly_limit      - max allowed projectedMonthly per agent (USD)
 *   volume_7day_avg           - per-agent map "envId/botId" -> 7-day avg messageCount
 *                               Falls back to numeric scalar for global default.
 *   env_overage               - evaluated from Capacity directly (no explicit threshold)
 *   high_consumption_threshold- daily estimatedCost above which HIGH alert is raised
 *   idle_days_threshold       - days of inactivity before orphan_idle fires (default 30)
 *   expected_model_meter      - "standard" | "premium"; mismatch = warning
 */
export type AlertBaselines = {
  budget_limit?: number;
  budget_monthly_limit?: number;
  /** Scalar default OR per-bot map serialised as JSON string */
  volume_7day_avg?: number | Record<string, number>;
  high_consumption_threshold?: number;
  idle_days_threshold?: number;
  expected_model_meter?: string;
};

export interface EvaluateInput {
  metrics: AgentMetricDaily[];
  baselines: AlertBaselines;
  agents: Agent[];
  environments?: Environment[];
  capacity?: Capacity[];
  /** Existing open alert IDs to dedupe against (envId/botId/type triplet) */
  existingAlertKeys?: Set<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function alertKey(envId: string, botId: string | null, type: AlertType): string {
  return `${envId}::${botId ?? '_'}::${type}`;
}

function buildAlert(
  type: AlertType,
  severity: AlertSeverity,
  envId: string,
  botId: string | null,
  message: string,
): Alert {
  return {
    id: makeId(),
    type,
    severity,
    envId,
    botId,
    message,
    state: 'open',
    createdAt: now(),
  };
}

/** Resolve per-bot 7-day average from baseline (scalar fallback). */
function resolve7DayAvg(
  baseline: number | Record<string, number> | undefined,
  envId: string,
  botId: string,
): number | undefined {
  if (baseline === undefined) return undefined;
  if (typeof baseline === 'number') return baseline;
  return baseline[`${envId}/${botId}`] ?? baseline[botId];
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/** budget_breach: projectedMonthly or estimatedCost exceeds cap */
function evalBudgetBreach(
  metric: AgentMetricDaily,
  baselines: AlertBaselines,
  seen: Set<string>,
  out: Alert[],
): void {
  const dailyLimit = baselines.budget_limit;
  const monthlyLimit = baselines.budget_monthly_limit ?? 1000;

  // Monthly projection breach (critical)
  const projected = metric.projectedMonthly ?? metric.estimatedCost * 30;
  if (projected > monthlyLimit) {
    const key = alertKey(metric.envId, metric.botId, 'budget_breach');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(
        buildAlert(
          'budget_breach',
          'critical',
          metric.envId,
          metric.botId,
          `Projected monthly spend ($${projected.toFixed(2)}) exceeds budget cap ($${monthlyLimit.toFixed(2)}) for agent ${metric.botId} in ${metric.envId}.`,
        ),
      );
    }
    return;
  }

  // Daily cost limit breach (warning)
  if (dailyLimit !== undefined && metric.estimatedCost > dailyLimit) {
    const key = alertKey(metric.envId, metric.botId, 'budget_breach');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(
        buildAlert(
          'budget_breach',
          'warning',
          metric.envId,
          metric.botId,
          `Daily cost ($${metric.estimatedCost.toFixed(2)}) exceeds daily budget limit ($${dailyLimit.toFixed(2)}) for agent ${metric.botId}.`,
        ),
      );
    }
  }
}

/** volume_spike: messageCount > 3x the 7-day average */
function evalVolumeSpike(
  metric: AgentMetricDaily,
  baselines: AlertBaselines,
  seen: Set<string>,
  out: Alert[],
): void {
  const avg = resolve7DayAvg(baselines.volume_7day_avg, metric.envId, metric.botId);
  if (avg === undefined || avg === 0) return;

  const spike = metric.messageCount / avg;
  if (spike > 3) {
    const key = alertKey(metric.envId, metric.botId, 'volume_spike');
    if (!seen.has(key)) {
      seen.add(key);
      const factor = spike.toFixed(1);
      out.push(
        buildAlert(
          'volume_spike',
          spike > 5 ? 'critical' : 'warning',
          metric.envId,
          metric.botId,
          `${factor}x message volume spike detected for agent ${metric.botId} (current: ${metric.messageCount}, 7-day avg: ${avg.toFixed(0)}). Possible runaway automation.`,
        ),
      );
    }
  }
}

/** env_overage: Capacity.overage === true for an environment */
function evalEnvOverage(
  cap: Capacity,
  seen: Set<string>,
  out: Alert[],
): void {
  if (!cap.overage) return;
  const key = alertKey(cap.envId, null, 'budget_breach');
  if (!seen.has(key)) {
    seen.add(key);
    out.push(
      buildAlert(
        'budget_breach',
        'critical',
        cap.envId,
        null,
        `Environment ${cap.envId} is in credit overage: ${cap.creditUsed.toLocaleString()} used of ${cap.creditLimit.toLocaleString()} limit (${cap.pct.toFixed(1)}%).`,
      ),
    );
  }
}

/** high_consumption: single-day estimatedCost > high_consumption_threshold */
function evalHighConsumption(
  metric: AgentMetricDaily,
  baselines: AlertBaselines,
  seen: Set<string>,
  out: Alert[],
): void {
  const threshold = baselines.high_consumption_threshold ?? 25;
  if (metric.estimatedCost <= threshold) return;

  // Avoid double-raising if budget_breach already fired for this bot
  const bbKey = alertKey(metric.envId, metric.botId, 'budget_breach');
  if (seen.has(bbKey)) return;

  const hcKey = `${metric.envId}::${metric.botId}::high_consumption`;
  if (!seen.has(hcKey)) {
    seen.add(hcKey);
    out.push(
      buildAlert(
        'volume_spike', // maps to volume_spike type; no dedicated AlertType for high_consumption
        'warning',
        metric.envId,
        metric.botId,
        `High single-day consumption: $${metric.estimatedCost.toFixed(2)} for agent ${metric.botId} exceeds threshold $${threshold.toFixed(2)}.`,
      ),
    );
  }
}

/** new_default_env_agent: active agent exists in a Default-type environment */
function evalNewDefaultEnvAgents(
  agents: Agent[],
  environments: Environment[],
  seen: Set<string>,
  out: Alert[],
): void {
  const defaultEnvIds = new Set(
    environments.filter((e) => e.isDefault || e.type === 'Default').map((e) => e.id),
  );

  for (const agent of agents) {
    if (!defaultEnvIds.has(agent.envId)) continue;
    if (agent.state !== 'Active') continue;

    const key = alertKey(agent.envId, agent.botId, 'new_default_env_agent');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(
        buildAlert(
          'new_default_env_agent',
          'critical',
          agent.envId,
          agent.botId,
          `Active agent "${agent.name}" (${agent.botId}) is deployed in the Default Environment without an approved promotion gate.`,
        ),
      );
    }
  }
}

/** model_meter_mismatch: agent billing meter does not match expected */
function evalModelMeterMismatch(
  metric: AgentMetricDaily,
  baselines: AlertBaselines,
  seen: Set<string>,
  out: Alert[],
): void {
  if (metric.modelMeter === null) {
    const key = alertKey(metric.envId, metric.botId, 'model_meter_mismatch');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(
        buildAlert(
          'model_meter_mismatch',
          'warning',
          metric.envId,
          metric.botId,
          `Agent ${metric.botId} has no model meter assigned. Billing classification unknown; cost may be mis-attributed.`,
        ),
      );
    }
    return;
  }

  const expected = baselines.expected_model_meter ?? 'standard';
  if (metric.modelMeter !== expected) {
    const key = alertKey(metric.envId, metric.botId, 'model_meter_mismatch');
    if (!seen.has(key)) {
      seen.add(key);
      const severity: AlertSeverity =
        metric.modelMeter === 'premium' && expected === 'standard' ? 'warning' : 'info';
      out.push(
        buildAlert(
          'model_meter_mismatch',
          severity,
          metric.envId,
          metric.botId,
          `Agent ${metric.botId} is using "${metric.modelMeter}" meter but environment baseline expects "${expected}". Review budget allocation.`,
        ),
      );
    }
  }
}

/** orphan_idle: agent has no owner AND lastActivity is null or older than threshold */
function evalOrphanIdle(
  agents: Agent[],
  baselines: AlertBaselines,
  seen: Set<string>,
  out: Alert[],
): void {
  const idleDays = baselines.idle_days_threshold ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - idleDays);

  for (const agent of agents) {
    if (agent.state !== 'Active') continue;

    const hasOwner = agent.ownerEmail !== null && agent.ownerEmail !== '';
    const lastActivity = agent.lastActivity ? new Date(agent.lastActivity) : null;
    const isIdle = lastActivity === null || lastActivity < cutoff;

    if (!hasOwner && isIdle) {
      const key = alertKey(agent.envId, agent.botId, 'orphan_idle');
      if (!seen.has(key)) {
        seen.add(key);
        const daysSince = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000)
          : null;
        const idleDesc = daysSince !== null ? `${daysSince} days idle` : 'never active';
        out.push(
          buildAlert(
            'orphan_idle',
            hasOwner ? 'info' : 'warning',
            agent.envId,
            agent.botId,
            `Agent "${agent.name}" (${agent.botId}) is orphaned: no registered owner and ${idleDesc}. Consider decommissioning.`,
          ),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate all governance alert rules.
 *
 * @param input.metrics      - Daily metrics (latest day per agent preferred)
 * @param input.baselines    - Threshold configuration
 * @param input.agents       - Full agent inventory
 * @param input.environments - Environment list (needed for new_default_env_agent)
 * @param input.capacity     - Capacity rows (needed for env_overage)
 * @param input.existingAlertKeys - Already-open alert fingerprints to dedupe
 *
 * @returns Deduplicated alerts sorted by severity (critical first)
 */
export function evaluateAlerts(
  metrics: AgentMetricDaily[],
  baselines: AlertBaselines,
  agents: Agent[],
  environments: Environment[] = [],
  capacity: Capacity[] = [],
): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];

  // Per-metric rules
  for (const metric of metrics) {
    evalBudgetBreach(metric, baselines, seen, out);
    evalVolumeSpike(metric, baselines, seen, out);
    evalHighConsumption(metric, baselines, seen, out);
    evalModelMeterMismatch(metric, baselines, seen, out);
  }

  // Capacity / env-level rules
  for (const cap of capacity) {
    evalEnvOverage(cap, seen, out);
  }

  // Agent-inventory rules (no per-metric needed)
  evalNewDefaultEnvAgents(agents, environments, seen, out);
  evalOrphanIdle(agents, baselines, seen, out);

  // Sort: critical > warning > info, then by createdAt desc
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return out;
}
