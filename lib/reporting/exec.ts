/**
 * AgentLens Reporting - Executive Posture Aggregator
 *
 * Aggregates tenant-wide data into KPI cards and trend series suitable
 * for an executive dashboard. Accepts the raw mock/live arrays and
 * derives every metric inline - no side effects, fully pure.
 */

import type {
  Agent,
  Environment,
  AgentMetricDaily,
  Alert,
  Capacity,
  ComplianceViolation,
  MaturityResult,
  ConversationKpi,
  HealthMetric,
  LifecycleStage,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface KpiCard {
  /** Unique identifier used as React key */
  id: string;
  label: string;
  value: number | string;
  /** Optional subtitle / unit label shown below the value */
  unit?: string;
  /** Trend direction relative to previous period */
  trend?: 'up' | 'down' | 'flat';
  /** Positive / negative / neutral framing - drives colour */
  sentiment: 'positive' | 'negative' | 'neutral' | 'warning';
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendSeries {
  id: string;
  label: string;
  data: TrendPoint[];
}

export interface LifecycleDistribution {
  stage: LifecycleStage;
  count: number;
  pct: number;
}

export interface CapacitySummary {
  envId: string;
  envName: string;
  creditUsed: number;
  creditLimit: number;
  pct: number;
  overage: boolean;
}

export interface ExecPosture {
  /** KPI cards ready to render */
  kpiCards: KpiCard[];
  /** Daily cost trend (sum across all agents per day) */
  costTrend: TrendSeries;
  /** Daily session trend (sum across all agents per day) */
  sessionTrend: TrendSeries;
  /** Deflection rate trend (weighted average per day) */
  deflectionTrend: TrendSeries;
  /** Error rate trend (simple average per day) */
  errorRateTrend: TrendSeries;
  /** Lifecycle distribution for stacked/pie chart */
  lifecycleDist: LifecycleDistribution[];
  /** Per-env capacity rows */
  capacityRows: CapacitySummary[];
  /** Overall maturity score 0-4 (simple average of all result scores) */
  maturityScore: number;
  /** Timestamp the snapshot was computed */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Input bag - everything the aggregator needs, passed as a plain object
// ---------------------------------------------------------------------------

export interface ExecPostureInput {
  agents: Agent[];
  environments: Environment[];
  metrics: AgentMetricDaily[];
  alerts: Alert[];
  capacity: Capacity[];
  violations: ComplianceViolation[];
  maturityResults: MaturityResult[];
  conversationKpis: ConversationKpi[];
  healthMetrics: HealthMetric[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function trendDir(current: number, previous: number): 'up' | 'down' | 'flat' {
  if (current > previous * 1.02) return 'up';
  if (current < previous * 0.98) return 'down';
  return 'flat';
}

/** Group metrics by date, sum a numeric field */
function metricsByDate<K extends keyof AgentMetricDaily>(
  metrics: AgentMetricDaily[],
  field: K,
): TrendPoint[] {
  const map = new Map<string, number>();
  for (const m of metrics) {
    const val = m[field];
    if (typeof val === 'number') {
      map.set(m.date, (map.get(m.date) ?? 0) + val);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: round2(value) }));
}

/** Group KPIs by date, compute weighted average deflection rate */
function deflectionByDate(kpis: ConversationKpi[]): TrendPoint[] {
  const map = new Map<string, { totalDeflected: number; totalSessions: number }>();
  for (const k of kpis) {
    const cur = map.get(k.date) ?? { totalDeflected: 0, totalSessions: 0 };
    cur.totalDeflected += k.deflectionRate * k.sessions;
    cur.totalSessions += k.sessions;
    map.set(k.date, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { totalDeflected, totalSessions }]) => ({
      date,
      value: round2(totalSessions > 0 ? totalDeflected / totalSessions : 0),
    }));
}

/** Group health metrics by date, average error rate */
function errorRateByDate(health: HealthMetric[]): TrendPoint[] {
  const map = new Map<string, number[]>();
  for (const h of health) {
    const arr = map.get(h.date) ?? [];
    arr.push(h.errorRate);
    map.set(h.date, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rates]) => ({ date, value: round2(avg(rates)) }));
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

export function computeExecPosture(input: ExecPostureInput): ExecPosture {
  const {
    agents,
    environments,
    metrics,
    alerts,
    capacity,
    violations,
    maturityResults,
    conversationKpis,
    healthMetrics,
  } = input;

  // -- Agent counts ----------------------------------------------------------
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.state === 'Active').length;
  const orphanAgents = agents.filter(
    (a) => a.state === 'Active' && a.ownerEmail === null,
  ).length;
  const prodAgents = agents.filter((a) => a.lifecycle === 'prod').length;
  const pilotAgents = agents.filter((a) => a.lifecycle === 'pilot').length;
  const pocAgents = agents.filter((a) => a.lifecycle === 'poc').length;
  const untagged = agents.filter((a) => !a.lifecycle).length;

  // -- Cost ------------------------------------------------------------------
  const latestDate = metrics
    .map((m) => m.date)
    .sort()
    .at(-1);
  const prevDate = metrics
    .map((m) => m.date)
    .filter((d) => d !== latestDate)
    .sort()
    .at(-1);

  const latestDayCost = metrics
    .filter((m) => m.date === latestDate)
    .reduce((s, m) => s + m.estimatedCost, 0);
  const prevDayCost = metrics
    .filter((m) => m.date === prevDate)
    .reduce((s, m) => s + m.estimatedCost, 0);

  const totalProjectedMonthly = metrics
    .filter((m) => m.date === latestDate)
    .reduce((s, m) => s + (m.projectedMonthly ?? 0), 0);

  // -- Alerts ----------------------------------------------------------------
  const openAlerts = alerts.filter((a) => a.state === 'open').length;
  const criticalOpenAlerts = alerts.filter(
    (a) => a.state === 'open' && a.severity === 'critical',
  ).length;

  // -- Compliance ------------------------------------------------------------
  const openViolations = violations.filter((v) => v.state === 'open').length;
  const criticalOpenViolations = violations.filter(
    (v) => v.state === 'open' && v.severity === 'critical',
  ).length;

  // Simple compliance score: 100 - (critical * 10 + warning * 3), floor 0
  const warnOpenViolations = openViolations - criticalOpenViolations;
  const rawComplianceScore = 100 - criticalOpenViolations * 10 - warnOpenViolations * 3;
  const complianceScore = Math.max(0, rawComplianceScore);

  // -- Capacity --------------------------------------------------------------
  const overageEnvs = capacity.filter((c) => c.overage).length;
  const nearCapacityEnvs = capacity.filter((c) => !c.overage && c.pct >= 80).length;

  const envMap = new Map(environments.map((e) => [e.id, e]));
  const capacityRows: CapacitySummary[] = capacity.map((c) => ({
    envId: c.envId,
    envName: envMap.get(c.envId)?.name ?? c.envId,
    creditUsed: c.creditUsed,
    creditLimit: c.creditLimit,
    pct: c.pct,
    overage: c.overage,
  }));

  // -- Maturity --------------------------------------------------------------
  const maturityScore =
    maturityResults.length > 0
      ? round2(avg(maturityResults.map((r) => r.score)))
      : 0;

  // -- Conversation KPIs -----------------------------------------------------
  const latestKpiDate = conversationKpis
    .map((k) => k.date)
    .sort()
    .at(-1);
  const latestKpis = conversationKpis.filter((k) => k.date === latestKpiDate);
  const totalSessionsToday = latestKpis.reduce((s, k) => s + k.sessions, 0);
  const weightedDeflection =
    totalSessionsToday > 0
      ? latestKpis.reduce((s, k) => s + k.deflectionRate * k.sessions, 0) /
        totalSessionsToday
      : 0;

  // -- Health ----------------------------------------------------------------
  const latestHealthDate = healthMetrics
    .map((h) => h.date)
    .sort()
    .at(-1);
  const latestHealth = healthMetrics.filter((h) => h.date === latestHealthDate);
  const avgErrorRate = avg(latestHealth.map((h) => h.errorRate));
  const avgLatencyMs = avg(latestHealth.map((h) => h.avgLatencyMs));

  // -- Lifecycle distribution ------------------------------------------------
  const lifecycleCounts: Record<LifecycleStage, number> = {
    poc: pocAgents,
    pilot: pilotAgents,
    prod: prodAgents,
  };
  const taggedCount = totalAgents - untagged;
  const lifecycleDist: LifecycleDistribution[] = (
    ['poc', 'pilot', 'prod'] as LifecycleStage[]
  ).map((stage) => ({
    stage,
    count: lifecycleCounts[stage],
    pct: taggedCount > 0 ? round2((lifecycleCounts[stage] / taggedCount) * 100) : 0,
  }));

  // -- Trend series ----------------------------------------------------------
  const costTrend: TrendSeries = {
    id: 'cost',
    label: 'Daily Cost ($)',
    data: metricsByDate(metrics, 'estimatedCost'),
  };

  const sessionTrend: TrendSeries = {
    id: 'sessions',
    label: 'Daily Sessions',
    data: metricsByDate(metrics, 'sessionCount'),
  };

  const deflectionTrend: TrendSeries = {
    id: 'deflection',
    label: 'Deflection Rate',
    data: deflectionByDate(conversationKpis),
  };

  const errorRateTrend: TrendSeries = {
    id: 'errorRate',
    label: 'Error Rate',
    data: errorRateByDate(healthMetrics),
  };

  // -- KPI cards -------------------------------------------------------------
  const kpiCards: KpiCard[] = [
    {
      id: 'total-agents',
      label: 'Total Agents',
      value: totalAgents,
      unit: `${activeAgents} active`,
      trend: 'flat',
      sentiment: 'neutral',
    },
    {
      id: 'daily-cost',
      label: 'Daily Cost',
      value: `$${round2(latestDayCost).toFixed(2)}`,
      unit: `proj. $${round2(totalProjectedMonthly).toFixed(0)}/mo`,
      trend: trendDir(latestDayCost, prevDayCost),
      sentiment: latestDayCost > prevDayCost * 1.1 ? 'warning' : 'neutral',
    },
    {
      id: 'compliance-score',
      label: 'Compliance Score',
      value: complianceScore,
      unit: `${openViolations} open violations`,
      trend: criticalOpenViolations > 0 ? 'down' : 'flat',
      sentiment:
        complianceScore >= 80
          ? 'positive'
          : complianceScore >= 60
            ? 'warning'
            : 'negative',
    },
    {
      id: 'open-alerts',
      label: 'Open Alerts',
      value: openAlerts,
      unit: `${criticalOpenAlerts} critical`,
      trend: criticalOpenAlerts > 0 ? 'up' : 'flat',
      sentiment: criticalOpenAlerts > 0 ? 'negative' : openAlerts > 0 ? 'warning' : 'positive',
    },
    {
      id: 'capacity-overage',
      label: 'Capacity Overage',
      value: overageEnvs,
      unit: `${nearCapacityEnvs} near limit (>=80%)`,
      trend: overageEnvs > 0 ? 'up' : 'flat',
      sentiment: overageEnvs > 0 ? 'negative' : nearCapacityEnvs > 0 ? 'warning' : 'positive',
    },
    {
      id: 'maturity-score',
      label: 'Maturity Score',
      value: maturityScore.toFixed(1),
      unit: 'out of 4.0',
      trend: 'flat',
      sentiment:
        maturityScore >= 3
          ? 'positive'
          : maturityScore >= 2
            ? 'warning'
            : 'negative',
    },
    {
      id: 'deflection-rate',
      label: 'Deflection Rate',
      value: `${(weightedDeflection * 100).toFixed(1)}%`,
      unit: `${totalSessionsToday} sessions today`,
      trend: 'flat',
      sentiment: weightedDeflection >= 0.7 ? 'positive' : weightedDeflection >= 0.5 ? 'warning' : 'negative',
    },
    {
      id: 'avg-error-rate',
      label: 'Avg Error Rate',
      value: `${(avgErrorRate * 100).toFixed(2)}%`,
      unit: `avg ${Math.round(avgLatencyMs)}ms latency`,
      trend: avgErrorRate > 0.02 ? 'up' : 'flat',
      sentiment: avgErrorRate <= 0.01 ? 'positive' : avgErrorRate <= 0.03 ? 'warning' : 'negative',
    },
    {
      id: 'orphan-agents',
      label: 'Orphan Agents',
      value: orphanAgents,
      unit: 'no registered owner',
      trend: orphanAgents > 0 ? 'up' : 'flat',
      sentiment: orphanAgents === 0 ? 'positive' : orphanAgents <= 2 ? 'warning' : 'negative',
    },
  ];

  return {
    kpiCards,
    costTrend,
    sessionTrend,
    deflectionTrend,
    errorRateTrend,
    lifecycleDist,
    capacityRows,
    maturityScore,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Convenience: build ExecPosture directly from mock seed (offline fallback)
// ---------------------------------------------------------------------------
export function computeExecPostureFromMock(): ExecPosture {
  const {
    mockAgents,
    mockEnvironments,
    mockMetrics,
    mockAlerts,
    mockCapacity,
    mockViolations,
    mockMaturityResults,
    mockConversationKpis,
    mockHealthMetrics,
  } = require('@/lib/mock/seed');

  return computeExecPosture({
    agents: mockAgents,
    environments: mockEnvironments,
    metrics: mockMetrics,
    alerts: mockAlerts,
    capacity: mockCapacity,
    violations: mockViolations,
    maturityResults: mockMaturityResults,
    conversationKpis: mockConversationKpis,
    healthMetrics: mockHealthMetrics,
  });
}
