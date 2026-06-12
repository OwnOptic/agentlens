/**
 * AgentLens Maturity Assessment Report Generator
 *
 * Generates a structured assessment object separating:
 *   - auto-derived controls (scored from telemetry, always capped at 3)
 *   - manual-questionnaire controls (scored from human input, up to 4)
 *
 * The honesty contract:
 *   Every assessment includes an `honestyNote` string that surfaces the
 *   partial-cap rule to consumers so dashboards can display it clearly.
 */

import type { MaturityControl, MaturityResult } from '@/lib/types';
import {
  getControlCatalogue,
  getControlsByPillar,
  PILLARS,
  PILLAR_LABELS,
  type Pillar,
  type TelemetrySignals,
} from './controls';
import {
  buildTelemetrySignals,
  scoreAllControls,
  scorePillar,
  scoreOverall,
  scoreBand,
  type ScoreBand,
} from './scoring';

// ---------------------------------------------------------------------------
// Assessment shape
// ---------------------------------------------------------------------------

export interface ControlAssessment {
  control:  MaturityControl;
  result:   MaturityResult;
}

export interface PillarAssessment {
  pillar:          Pillar;
  label:           string;
  averageScore:    number;
  band:            ScoreBand;
  controls:        ControlAssessment[];
}

export interface MaturityAssessment {
  /** ISO timestamp of when this assessment was generated. */
  generatedAt: string;
  /** Overall maturity score (0-4 float, equal pillar weight). */
  overallScore: number;
  /** Overall band label. */
  overallBand: ScoreBand;
  /** Per-pillar breakdown. */
  pillars: PillarAssessment[];
  /**
   * Controls whose score was derived from telemetry only.
   * All have capped=true and score <= 3.
   */
  autoDerived: ControlAssessment[];
  /**
   * Controls that require (or received) a human questionnaire response.
   * May have capped=false and score up to 4.
   */
  manualQuestionnaire: ControlAssessment[];
  /**
   * Honesty note surfaced to the UI.
   * Explains the partial-cap rule and what human verification is still needed.
   */
  honestyNote: string;
  /**
   * True if any telemetry source was unavailable during this run,
   * meaning some auto-derived scores may be lower than reality.
   */
  dataQualityWarning: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPillarAssessment(
  pillar: Pillar,
  allControls: MaturityControl[],
  allResults:  MaturityResult[],
): PillarAssessment {
  const pillarControls = allControls.filter((c) => c.pillar === pillar);
  const resultMap = new Map(allResults.map((r) => [r.controlId, r]));

  const controls: ControlAssessment[] = pillarControls.map((ctrl) => ({
    control: ctrl,
    result:  resultMap.get(ctrl.id) ?? {
      controlId:      ctrl.id,
      score:          0 as const,
      capped:         false,
      residualBurden: 'Result not computed.',
    },
  }));

  const averageScore = scorePillar(pillar, allResults);
  return {
    pillar,
    label:        PILLAR_LABELS[pillar],
    averageScore,
    band:         scoreBand(averageScore),
    controls,
  };
}

function buildHonestyNote(autoDerived: ControlAssessment[]): string {
  const cappedCount = autoDerived.filter((ca) => ca.result.capped).length;
  if (cappedCount === 0) {
    return 'All auto-evaluated scores are telemetry-derived and capped at 3/4. A score of 4 requires human validation.';
  }
  return (
    `${cappedCount} of ${autoDerived.length} auto-evaluated control${cappedCount !== 1 ? 's are' : ' is'} ` +
    'capped at a maximum score of 3/4 because they are derived from telemetry signals alone. ' +
    'Reaching score 4 on any of these controls requires a manual review confirming that no ' +
    'residual gaps exist beyond what the monitoring APIs can observe. ' +
    'See the residualBurden field on each result for the specific verification required.'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a full MaturityAssessment.
 *
 * @param signals  Pre-built TelemetrySignals. When omitted, signals are built
 *                 from the mock seed (offline / dev mode).
 * @param dataQualityWarning  Pass true when any connector returned an error
 *                 during the current ingestion run.
 */
export function generateAssessment(
  signals?: TelemetrySignals,
  dataQualityWarning = false,
): MaturityAssessment {
  const resolvedSignals = signals ?? buildTelemetrySignals();
  const allControls     = getControlCatalogue();
  const allResults      = scoreAllControls(resolvedSignals);

  const resultMap = new Map(allResults.map((r) => [r.controlId, r]));

  // Partition into auto-derived vs manual
  const autoDerived: ControlAssessment[] = allControls
    .filter((c) => c.autoEvaluable)
    .map((ctrl) => ({
      control: ctrl,
      result:  resultMap.get(ctrl.id)!,
    }));

  const manualQuestionnaire: ControlAssessment[] = allControls
    .filter((c) => !c.autoEvaluable)
    .map((ctrl) => ({
      control: ctrl,
      result:  resultMap.get(ctrl.id)!,
    }));

  const pillars = PILLARS.map((p) =>
    buildPillarAssessment(p, allControls, allResults),
  );

  const overallScore = scoreOverall(allResults);

  return {
    generatedAt:         new Date().toISOString(),
    overallScore,
    overallBand:         scoreBand(overallScore),
    pillars,
    autoDerived,
    manualQuestionnaire,
    honestyNote:         buildHonestyNote(autoDerived),
    dataQualityWarning,
  };
}

/**
 * Return a flat list of controls that still need human action:
 *   - capped controls with residualBurden (auto-derived, human verification pending)
 *   - manual controls with score < 3
 */
export function getPendingActions(assessment: MaturityAssessment): ControlAssessment[] {
  const capped = assessment.autoDerived.filter(
    (ca) => ca.result.capped && ca.result.score < 3,
  );
  const lowManual = assessment.manualQuestionnaire.filter(
    (ca) => ca.result.score < 3,
  );
  return [...capped, ...lowManual];
}

/**
 * Compute the pillar heatmap data structure used by the UI.
 * Returns an array of { pillar, label, score, band, color } records.
 */
export interface HeatmapCell {
  pillar:  Pillar;
  label:   string;
  score:   number;
  band:    ScoreBand;
  /** Tailwind bg class for the heatmap tile. */
  bgClass: string;
}

const BAND_BG: Record<ScoreBand, string> = {
  critical:   'bg-red-700',
  low:        'bg-orange-600',
  developing: 'bg-yellow-600',
  managed:    'bg-green-600',
  optimised:  'bg-emerald-500',
};

export function buildHeatmap(assessment: MaturityAssessment): HeatmapCell[] {
  return assessment.pillars.map((p) => ({
    pillar:  p.pillar,
    label:   p.label,
    score:   p.averageScore,
    band:    p.band,
    bgClass: BAND_BG[p.band],
  }));
}
