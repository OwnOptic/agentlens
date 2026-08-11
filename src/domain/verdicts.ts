/**
 * Disposition: promote, improve, consolidate or retire.
 *
 * The verdict is a recommendation derived from figures that were actually read.
 * When the inputs are missing, the verdict is `null` and the rationale says
 * which input was missing. An unclassifiable agent is a real, reportable state;
 * guessing a disposition from an absent signal is not.
 */

export type Verdict = 'promote' | 'improve' | 'consolidate' | 'retire';

export interface VerdictInput {
  /** Sessions over the lookback window. null when usage could not be read. */
  sessions: number | null;
  /** Escalation rate 0-1. null when usage could not be read. */
  escalationRate: number | null;
  /** True when the agent belongs to a duplicate cluster. */
  duplicate: boolean;
  /** True when no owner could be resolved. */
  orphan: boolean;
}

export interface VerdictOutput {
  verdict: Verdict | null;
  rationale: string;
}

/** Below this, an agent is not meaningfully in use over the window. */
const LOW_USAGE_SESSIONS = 10;
/** Above this share of sessions ending in escalation, the agent is underperforming. */
const HIGH_ESCALATION_RATE = 0.4;

export function classify(input: VerdictInput): VerdictOutput {
  const { sessions, escalationRate, duplicate, orphan } = input;

  if (sessions === null) {
    return {
      verdict: null,
      rationale:
        'No usage data could be read for this agent, so no disposition can be recommended. Connect Dataverse analytics for its environment to classify it.',
    };
  }

  if (sessions === 0) {
    return {
      verdict: 'retire',
      rationale: orphan
        ? 'Zero sessions in the window and no resolvable owner. Nothing is using it and nobody is accountable for it.'
        : 'Zero sessions in the window. It is running but nobody is using it.',
    };
  }

  if (duplicate && sessions < LOW_USAGE_SESSIONS) {
    return {
      verdict: 'consolidate',
      rationale: `Only ${sessions} sessions in the window, and it duplicates another agent. Merge it into the canonical one rather than maintaining both.`,
    };
  }

  if (duplicate) {
    return {
      verdict: 'consolidate',
      rationale: `${sessions} sessions, but it duplicates another agent. Consolidating removes the split audience and the double maintenance.`,
    };
  }

  if (sessions < LOW_USAGE_SESSIONS) {
    return {
      verdict: 'improve',
      rationale: `Only ${sessions} sessions in the window. Either it is not discoverable or it is not solving the problem - worth a look before retiring it.`,
    };
  }

  if (escalationRate !== null && escalationRate > HIGH_ESCALATION_RATE) {
    return {
      verdict: 'improve',
      rationale: `${sessions} sessions but ${Math.round(
        escalationRate * 100,
      )}% escalate to a human. It is used and failing, which is the highest-value thing to fix.`,
    };
  }

  return {
    verdict: 'promote',
    rationale: orphan
      ? `${sessions} sessions and performing well, but it has no resolvable owner. Assign one before promoting it further.`
      : `${sessions} sessions with a healthy escalation rate. This one is working - it is the pattern to spread.`,
  };
}
