/**
 * AgentLens Maturity Scoring Engine
 *
 * Rules
 * -----
 * 1. Scores are 0-4 per control.
 * 2. CRITICAL partial-cap rule: telemetry-derived scores set capped=true and
 *    NEVER return 4 (max 3) AND always carry residualBurden text explaining
 *    what human verification is still required.
 * 3. Manual controls (autoEvaluable=false) use questionnaire answers directly
 *    and may reach score 4 but only when the human explicitly confirms full
 *    maturity. capped is always false for manual controls.
 * 4. scorePillar() aggregates to a 0-4 float average for a pillar.
 *
 * Dependency: TelemetrySignals from controls.ts. Mock data is used as the
 * fallback when live connectors are unavailable.
 */

import type { MaturityControl, MaturityResult } from '@/lib/types';
import type { TelemetrySignals } from './controls';
import {
  getControlCatalogue,
  getControlsByPillar,
  type Pillar,
} from './controls';
import {
  mockAgents,
  mockHealthMetrics,
  mockGatePolicies,
  mockMaturityControls,
  mockMaturityResults,
} from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number to 0-4. */
function clamp04(n: number): 0 | 1 | 2 | 3 | 4 {
  const v = Math.max(0, Math.min(4, Math.round(n)));
  return v as 0 | 1 | 2 | 3 | 4;
}

/**
 * Produce a telemetry-derived MaturityResult.
 * score is capped at 3 regardless of what the raw signal suggests.
 */
function telemetryResult(
  control: MaturityControl,
  rawScore: number,
  residualBurden: string,
): MaturityResult {
  // CRITICAL cap: telemetry-derived results may never exceed 3
  const cappedScore = clamp04(Math.min(rawScore, 3));
  return {
    controlId: control.id,
    score: cappedScore,
    capped: true,
    residualBurden,
  };
}

/**
 * Produce a manual-questionnaire MaturityResult.
 * May reach 4 only when humanScore === 4.
 */
function manualResult(
  control: MaturityControl,
  humanScore: number,
  residualBurden: string,
): MaturityResult {
  return {
    controlId: control.id,
    score: clamp04(humanScore),
    capped: false,
    residualBurden,
  };
}

// ---------------------------------------------------------------------------
// Live signal extractor (mock-backed fallback)
// ---------------------------------------------------------------------------

/**
 * Build TelemetrySignals from real connector data or fall back to mock seed.
 * Pass null for any signal source that is unavailable; it will use mock values.
 */
export function buildTelemetrySignals(options?: {
  agents?: typeof mockAgents;
  healthMetrics?: typeof mockHealthMetrics;
  gatePolicies?: typeof mockGatePolicies;
  /** Whether weekly digest is circulated (null = not yet answered). */
  weeklyDigestCirculated?: boolean | null;
}): TelemetrySignals {
  const agents      = options?.agents        ?? mockAgents;
  const health      = options?.healthMetrics ?? mockHealthMetrics;
  const policies    = options?.gatePolicies  ?? mockGatePolicies;
  const digestFlag  = options?.weeklyDigestCirculated ?? null;

  // -- Security signals --
  const activeAgents = agents.filter((a) => a.state === 'Active');
  // Proxy: agents in the default env with null ownerEmail are likely anonymous
  const anonCount = activeAgents.filter(
    (a) => a.envId === 'env-default-00000000' && a.ownerEmail === null,
  ).length;
  const authCoverageRatio =
    activeAgents.length > 0
      ? Math.max(0, (activeAgents.length - anonCount) / activeAgents.length)
      : 1;

  // DLP proxy: all prod agents have an ownerEmail (real DLP check needs deep scan)
  const prodAgents = activeAgents.filter(
    (a) => a.envId === 'env-prod-33333333',
  );
  const allProdEnvsHaveDlp =
    prodAgents.length > 0 && prodAgents.every((a) => a.ownerEmail !== null);

  // HTTP connector unapproved: proxy from dev env agents with http in name
  const unapprovedHttpConnectorCount = agents.filter(
    (a) =>
      a.state === 'Active' &&
      a.name.toLowerCase().includes('http'),
  ).length;

  // -- Management signals --
  const withOwner = activeAgents.filter((a) => a.ownerEmail !== null).length;
  const ownerCoverageRatio =
    activeAgents.length > 0 ? withOwner / activeAgents.length : 1;

  const hasProdGatePolicy = policies.some((p) => p.enabled && p.id.includes('prod'));

  const withLifecycle = agents.filter((a) => a.lifecycle !== undefined).length;
  const lifecycleTagCoverageRatio =
    agents.length > 0 ? withLifecycle / agents.length : 1;

  // -- Reporting signals --
  const appInsightsConnected = health.length > 0;

  return {
    security: {
      authCoverageRatio,
      allProdEnvsHaveDlp,
      unapprovedHttpConnectorCount,
    },
    management: {
      ownerCoverageRatio,
      hasProdGatePolicy,
      lifecycleTagCoverageRatio,
    },
    reporting: {
      appInsightsConnected,
      weeklyDigestCirculated: digestFlag,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-control scoring functions
// ---------------------------------------------------------------------------

function scoreCtrlSec001(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-sec-001')!;
  const r = signals.security.authCoverageRatio;
  // 0 -> 0, <0.5 -> 1, <0.8 -> 2, <1 -> 3
  const raw = r >= 1 ? 3 : r >= 0.8 ? 2 : r >= 0.5 ? 1 : 0;
  return telemetryResult(
    ctrl,
    raw,
    r < 1
      ? `${Math.round((1 - r) * 100)}% of active agents still lack verified authentication enforcement. Manual channel-by-channel review required.`
      : 'All active agents have owners (auth proxy). Manual channel audit still required to confirm enforcement.',
  );
}

function scoreCtrlSec002(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-sec-002')!;
  const hasDlp = signals.security.allProdEnvsHaveDlp;
  return telemetryResult(
    ctrl,
    hasDlp ? 3 : 1,
    hasDlp
      ? 'DLP ownership proxy satisfied for prod. Dev/UAT DLP coverage not verifiable via inventory API alone.'
      : 'DLP coverage in prod environment unconfirmed. Deep scan or admin confirmation required.',
  );
}

function scoreCtrlSec003(signals: TelemetrySignals): MaturityResult {
  // Manual control - but we still consume signals to surface a starting point
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-sec-003')!;
  // No telemetry for rotation policy; default to 1 (ad-hoc/no documented policy)
  void signals; // signal param kept for interface consistency
  return manualResult(
    ctrl,
    1,
    'Service principal rotation policy cannot be detected from telemetry. Human IT confirmation required.',
  );
}

function scoreCtrlMgmt001(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-mgmt-001')!;
  const r = signals.management.ownerCoverageRatio;
  const raw = r >= 1 ? 3 : r >= 0.9 ? 2 : r >= 0.7 ? 1 : 0;
  return telemetryResult(
    ctrl,
    raw,
    r < 1
      ? `${Math.round((1 - r) * 100)}% of active agents have no registered owner. Remediation in progress.`
      : 'All agents have ownerEmail set. Manual verification of owner accuracy (not just existence) still required.',
  );
}

function scoreCtrlMgmt002(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-mgmt-002')!;
  const hasGate = signals.management.hasProdGatePolicy;
  return telemetryResult(
    ctrl,
    hasGate ? 3 : 0,
    hasGate
      ? 'Prod gate policy active in registry. Manual verification: confirm Global Admin bypass path is blocked.'
      : 'No prod gate policy detected. Immediate action required.',
  );
}

function scoreCtrlMgmt003(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-mgmt-003')!;
  const r = signals.management.lifecycleTagCoverageRatio;
  const raw = r >= 1 ? 3 : r >= 0.9 ? 2 : r >= 0.7 ? 1 : 0;
  return telemetryResult(
    ctrl,
    raw,
    r < 1
      ? `${Math.round((1 - r) * 100)}% of agents are missing lifecycle tags. Tag all agents including legacy bots.`
      : 'All agents tagged. Manual review of tag accuracy (poc/pilot/prod correctness) still required.',
  );
}

function scoreCtrlRep001(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-rep-001')!;
  const connected = signals.reporting.appInsightsConnected;
  return telemetryResult(
    ctrl,
    connected ? 3 : 0,
    connected
      ? 'App Insights returning health data for monitored envs. Manual check: confirm all prod bots are instrumented.'
      : 'No App Insights data available. Connect Application Insights workspace to all production environments.',
  );
}

function scoreCtrlRep002(signals: TelemetrySignals): MaturityResult {
  const ctrl = mockMaturityControls.find((c) => c.id === 'ctrl-rep-002')!;
  const digest = signals.reporting.weeklyDigestCirculated;
  if (digest === null) {
    // Not yet answered - default 0
    return manualResult(
      ctrl,
      0,
      'Weekly digest status unknown. Complete governance questionnaire to score this control.',
    );
  }
  if (digest) {
    return manualResult(ctrl, 3, 'Digest circulated regularly. Score 4 requires evidence of automated scheduling.');
  }
  return manualResult(ctrl, 1, 'Digest sent ad-hoc only. Implement automated weekly scheduling to improve score.');
}

// ---------------------------------------------------------------------------
// Map: controlId -> scoring function
// ---------------------------------------------------------------------------

type ScoringFn = (signals: TelemetrySignals) => MaturityResult;

const SCORING_MAP: Record<string, ScoringFn> = {
  'ctrl-sec-001':  scoreCtrlSec001,
  'ctrl-sec-002':  scoreCtrlSec002,
  'ctrl-sec-003':  scoreCtrlSec003,
  'ctrl-mgmt-001': scoreCtrlMgmt001,
  'ctrl-mgmt-002': scoreCtrlMgmt002,
  'ctrl-mgmt-003': scoreCtrlMgmt003,
  'ctrl-rep-001':  scoreCtrlRep001,
  'ctrl-rep-002':  scoreCtrlRep002,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a single control given telemetry signals.
 * Falls back to the mock seed result if no scoring function is registered
 * for the control ID (forward-compatibility for future controls).
 */
export function scoreControl(
  controlId: string,
  signals: TelemetrySignals,
): MaturityResult {
  const fn = SCORING_MAP[controlId];
  if (fn) {
    return fn(signals);
  }
  // Fallback: return mock seed result as-is (safe read-only reference)
  const seedResult = mockMaturityResults.find((r) => r.controlId === controlId);
  if (seedResult) {
    return { ...seedResult };
  }
  // Ultimate fallback: unknown control scores 0
  return {
    controlId,
    score: 0,
    capped: false,
    residualBurden: 'No scoring function registered for this control.',
  };
}

/**
 * Score all controls in the catalogue against the provided telemetry signals.
 */
export function scoreAllControls(signals: TelemetrySignals): MaturityResult[] {
  return getControlCatalogue().map((ctrl) => scoreControl(ctrl.id, signals));
}

/**
 * Compute the average score for a pillar (0-4 float).
 * Returns 0 if no controls exist for the pillar.
 */
export function scorePillar(
  pillar: Pillar,
  results: MaturityResult[],
): number {
  const controls = getControlsByPillar(pillar);
  if (controls.length === 0) return 0;
  const ids = new Set(controls.map((c) => c.id));
  const relevant = results.filter((r) => ids.has(r.controlId));
  if (relevant.length === 0) return 0;
  const total = relevant.reduce((sum, r) => sum + r.score, 0);
  return total / relevant.length;
}

/**
 * Compute a numeric overall maturity score (0-4 float) across all pillars,
 * weighted equally.
 */
export function scoreOverall(results: MaturityResult[]): number {
  const pillars: Pillar[] = ['security', 'management', 'reporting'];
  const pillarScores = pillars.map((p) => scorePillar(p, results));
  return pillarScores.reduce((s, v) => s + v, 0) / pillars.length;
}

/**
 * Categorise a 0-4 float score into a display band.
 */
export type ScoreBand = 'critical' | 'low' | 'developing' | 'managed' | 'optimised';

export function scoreBand(score: number): ScoreBand {
  if (score < 1)   return 'critical';
  if (score < 2)   return 'low';
  if (score < 3)   return 'developing';
  if (score < 3.5) return 'managed';
  return 'optimised';
}

export const SCORE_BAND_COLORS: Record<ScoreBand, string> = {
  critical:   '#ef4444', // red-500
  low:        '#f97316', // orange-500
  developing: '#eab308', // yellow-500
  managed:    '#22c55e', // green-500
  optimised:  '#10b981', // emerald-500
};
