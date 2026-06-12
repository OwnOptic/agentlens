/**
 * AgentLens Release Gate
 *
 * Advisory-by-default release gate: evaluates an agent against all enabled
 * policies and returns a GateDecision. The gate NEVER forces a block in the
 * runtime path - it records the decision and notifies; enforcement is the
 * caller's responsibility (CI pipeline, UI warning, ops ticket).
 *
 * "Advisory" means:
 *   - Blocking rule failures are flagged and recorded as 'block' verdicts.
 *   - The gate result is ALWAYS returned (never throws on block).
 *   - Callers decide whether to halt promotion or just surface the warning.
 *
 * Usage:
 *   const result = await runGate({ agent, env, maturity, compliance }, policies);
 *   // result.decision.verdict === 'block' → surface to operator, do NOT throw
 */

import { randomUUID } from 'crypto';

import type { GateDecision, GatePolicy } from '@/lib/types';
import { parsePolicy } from './schema';
import { evaluate } from './evaluator';
import { signDecision } from './signing';
import type { PolicyContext } from './schema';

// ---------------------------------------------------------------------------
// Gate run inputs / outputs
// ---------------------------------------------------------------------------

export interface GateRunInput {
  /** The agent reference string "{envId}/{botId}". */
  agentRef: string;
  /** Full evaluation context for the agent. */
  context: PolicyContext;
  /** Gate policies to evaluate. Only enabled policies are run. */
  policies: GatePolicy[];
  /**
   * Optional: ID of a specific policy to run.
   * If omitted, all enabled policies are evaluated and the worst verdict wins.
   */
  policyId?: string;
}

export interface GateRunOutput {
  /** The resulting gate decision (ready to persist). */
  decision: GateDecision;
  /**
   * Per-policy evaluation details for the UI.
   * The aggregate verdict is the worst single-policy outcome.
   */
  policyResults: PolicyEvalSummary[];
  /**
   * Human-readable notification text.
   * Advisory mode: always filled, even on pass (summary of checks run).
   */
  notification: string;
}

export interface PolicyEvalSummary {
  policyId: string;
  policyName: string;
  verdict: 'pass' | 'block';
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Core gate runner
// ---------------------------------------------------------------------------

/**
 * Run the release gate for an agent against the supplied policies.
 *
 * Advisory mode: a 'block' verdict is informational - this function never
 * throws; the caller decides how to act on the verdict.
 */
export async function runGate(input: GateRunInput): Promise<GateRunOutput> {
  const { agentRef, context, policies, policyId } = input;

  // Filter: enabled policies only; optionally narrow to a specific policy
  const eligiblePolicies = policies.filter(
    (p) => p.enabled && (policyId === undefined || p.id === policyId)
  );

  if (eligiblePolicies.length === 0) {
    // No applicable policies - advisory pass
    const decision: GateDecision = buildDecision(agentRef, 'pass', [
      'No enabled policies matched - gate passed by default (advisory mode).',
    ]);
    return {
      decision,
      policyResults: [],
      notification: buildNotification(agentRef, 'pass', [
        'No enabled gate policies found. Gate auto-passed.',
      ]),
    };
  }

  const policyResults: PolicyEvalSummary[] = [];
  let overallVerdict: 'pass' | 'block' = 'pass';
  const allReasons: string[] = [];

  for (const gatePolicy of eligiblePolicies) {
    let parsed;
    try {
      parsed = parsePolicy(gatePolicy.yaml);
    } catch (err) {
      // If policy YAML is malformed, treat as advisory warn (do not hard-block)
      const errMsg = `Policy "${gatePolicy.name}" (${gatePolicy.id}) could not be parsed: ${String(err)}`;
      policyResults.push({
        policyId: gatePolicy.id,
        policyName: gatePolicy.name,
        verdict: 'block',
        reasons: [errMsg],
      });
      overallVerdict = 'block';
      allReasons.push(errMsg);
      continue;
    }

    const result = evaluate(parsed, context);

    policyResults.push({
      policyId: gatePolicy.id,
      policyName: gatePolicy.name,
      verdict: result.verdict,
      reasons: result.reasons,
    });

    if (result.verdict === 'block') {
      overallVerdict = 'block';
      allReasons.push(...result.reasons.map((r) => `[${gatePolicy.name}] ${r}`));
    }
  }

  // On pass, include a summary reason
  if (overallVerdict === 'pass') {
    allReasons.push(
      `All ${eligiblePolicies.length} enabled ${eligiblePolicies.length === 1 ? 'policy' : 'policies'} passed.`
    );
  }

  const decision = buildDecision(agentRef, overallVerdict, allReasons);

  return {
    decision,
    policyResults,
    notification: buildNotification(agentRef, overallVerdict, allReasons),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an unsigned GateDecision payload then sign it.
 */
function buildDecision(
  agentRef: string,
  verdict: 'pass' | 'block',
  reasons: string[]
): GateDecision {
  const id = `gate-decision-${randomUUID()}`;
  const signedAt = new Date().toISOString();
  const signature = signDecision({ id, agentRef, verdict, signedAt });

  return {
    id,
    agentRef,
    verdict,
    reasons,
    signedAt,
    signature,
    revoked: false,
  };
}

/**
 * Build a human-readable notification string for the advisory gate.
 * This is what would be sent to an operator webhook / Teams message.
 */
function buildNotification(
  agentRef: string,
  verdict: 'pass' | 'block',
  reasons: string[]
): string {
  const icon = verdict === 'pass' ? '[PASS]' : '[BLOCK - ADVISORY]';
  const lines = [
    `${icon} Release gate evaluated for ${agentRef}`,
    '',
    ...reasons.map((r) => `  - ${r}`),
    '',
    verdict === 'block'
      ? 'Gate is ADVISORY: this result has been recorded but does not automatically halt promotion. An operator must review.'
      : 'Gate passed. Promotion is clear to proceed.',
  ];
  return lines.join('\n');
}

/**
 * Convenience: run the default prod-gate policy against an agent context.
 * Falls back to the mock seed when no live policy is provided.
 */
export async function runProdGate(
  agentRef: string,
  context: PolicyContext,
  policies: GatePolicy[]
): Promise<GateRunOutput> {
  // Find the prod-oriented policy if present, else run all enabled
  const prodPolicy = policies.find((p) => p.id === 'gate-policy-prod' && p.enabled);
  return runGate({
    agentRef,
    context,
    policies,
    policyId: prodPolicy?.id,
  });
}
