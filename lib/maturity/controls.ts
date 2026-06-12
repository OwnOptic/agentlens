/**
 * AgentLens Maturity Controls Library
 *
 * Defines the full catalogue of maturity controls across three pillars:
 *   - Security
 *   - Management
 *   - Reporting
 *
 * autoEvaluable = true  -> score can be inferred from live telemetry/inventory signals
 * autoEvaluable = false -> score requires a human questionnaire response
 *
 * This module re-exports the mock seed catalogue and adds typed helpers.
 * When a live Dataverse/telemetry source is available, swap getControlCatalogue()
 * to call the real API; all callers stay unchanged.
 */

import type { MaturityControl } from '@/lib/types';
import { mockMaturityControls } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Pillar grouping helpers
// ---------------------------------------------------------------------------

export type Pillar = MaturityControl['pillar'];

export const PILLARS: Pillar[] = ['security', 'management', 'reporting'];

export const PILLAR_LABELS: Record<Pillar, string> = {
  security:   'Security',
  management: 'Management',
  reporting:  'Reporting',
};

/** Human-readable description of each pillar's intent. */
export const PILLAR_DESCRIPTIONS: Record<Pillar, string> = {
  security:
    'Authentication enforcement, DLP coverage, connector approvals, and secret-rotation policy.',
  management:
    'Owner registration, lifecycle tagging, release gate enforcement, and agent inventory hygiene.',
  reporting:
    'Telemetry connectivity, operational dashboards, and governance digest cadence.',
};

// ---------------------------------------------------------------------------
// Control catalogue access
// ---------------------------------------------------------------------------

/**
 * Return the full control catalogue.
 * Currently backed by the mock seed; swap for a live fetch when ready.
 */
export function getControlCatalogue(): MaturityControl[] {
  return mockMaturityControls;
}

/**
 * Return controls for a specific pillar.
 */
export function getControlsByPillar(pillar: Pillar): MaturityControl[] {
  return getControlCatalogue().filter((c) => c.pillar === pillar);
}

/**
 * Return only auto-evaluable controls (score can be derived from telemetry).
 */
export function getAutoEvaluableControls(): MaturityControl[] {
  return getControlCatalogue().filter((c) => c.autoEvaluable);
}

/**
 * Return only manual controls (require questionnaire input).
 */
export function getManualControls(): MaturityControl[] {
  return getControlCatalogue().filter((c) => !c.autoEvaluable);
}

/**
 * Look up a single control by ID. Returns undefined if not found.
 */
export function getControlById(id: string): MaturityControl | undefined {
  return getControlCatalogue().find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Auto-evaluation signal extractor
// ---------------------------------------------------------------------------
// These interfaces describe the telemetry signals consumed by the scoring layer.
// They are intentionally decoupled from the full Agent/HealthMetric shapes so
// that the scoring engine does not take a hard dependency on the entire seed.

export interface SecuritySignals {
  /** Fraction of active agents that have no anonymous auth (0-1). */
  authCoverageRatio: number;
  /** Whether all production environments have a DLP policy ID set. */
  allProdEnvsHaveDlp: boolean;
  /** Number of active agents in prod envs with unapproved HTTP connectors. */
  unapprovedHttpConnectorCount: number;
}

export interface ManagementSignals {
  /** Fraction of active agents with a non-null ownerEmail (0-1). */
  ownerCoverageRatio: number;
  /** Whether at least one enabled gate policy exists for prod promotions. */
  hasProdGatePolicy: boolean;
  /** Fraction of agents with a lifecycle field set (0-1). */
  lifecycleTagCoverageRatio: number;
}

export interface ReportingSignals {
  /** Whether App Insights returns at least one HealthMetric row. */
  appInsightsConnected: boolean;
  /**
   * Manual-only signal: whether a weekly governance digest is circulated.
   * Set to null when not yet answered via questionnaire.
   */
  weeklyDigestCirculated: boolean | null;
}

export interface TelemetrySignals {
  security:   SecuritySignals;
  management: ManagementSignals;
  reporting:  ReportingSignals;
}
