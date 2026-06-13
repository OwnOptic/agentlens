/**
 * AgentLens Compliance - Evaluator
 *
 * Evaluates each agent against a set of ComplianceRules and produces
 * ComplianceViolation records with lifecycle state derived from the
 * existing violations store (open/acknowledged/resolved/suppressed).
 *
 * The expression evaluator supports a simplified DSL:
 *   - `agent.field == "value"` / `!= "value"` / `== null` / `!= null`
 *   - `env.type == "Production"`
 *   - `agent.boolField == true` / `== false`
 *   - Compound expressions joined with `&&`
 *
 * Fields resolved against AgentEvalContext (see below).
 * Fields not present in context evaluate to `null` (falsy).
 *
 * T-301: live Agent fields (connectors, authMode, channelIds, sharingScope)
 * are preferred when present; name heuristics are fallback only.
 * dlpReviewed and httpApproved default to FALSE (fail-safe) when not live.
 */

import type { Agent, Environment, ComplianceRule, ComplianceViolation } from '@/lib/types';
import { evalExpression } from '@/lib/policy/evaluator';

// ---------------------------------------------------------------------------
// AgentEvalContext - the flat key/value view presented to the expression DSL
// ---------------------------------------------------------------------------

export interface AgentEvalContext {
  // Agent fields
  'agent.state': string;
  'agent.ownerEmail': string | null;
  'agent.ownerName': string | null;
  'agent.lifecycle': string | null;
  /** Auth mode: from live data when available, otherwise name heuristic */
  'agent.authMode': string;
  /** False by default (fail-safe); set to true only from live data */
  'agent.dlpReviewed': boolean;
  /** False by default (fail-safe); set to true only from live data */
  'agent.httpApproved': boolean;
  'agent.externalDataEgress': boolean;
  'agent.hasDirectlineChannel': boolean;
  'agent.hasTeamsChannel': boolean;
  'agent.hasHttpConnector': boolean;
  'agent.hasUnapprovedSharePointKS': boolean;
  // Env fields
  'env.type': string;
  'env.dlpPolicyId': string | null;
  /** True when any of the boolean signals above were derived from name heuristics */
  derivedFromHeuristic: boolean;
}

// ---------------------------------------------------------------------------
// Context builder: derive AgentEvalContext from Agent + Environment
// ---------------------------------------------------------------------------

/**
 * Build the evaluation context for an agent/env pair.
 *
 * T-301: Prefers live fields (agent.authMode, agent.connectors, agent.channelIds)
 * when present on the Agent record.  Falls back to name heuristics only when
 * the live field is absent.  Sets derivedFromHeuristic=true whenever a
 * heuristic was used for any signal.
 *
 * dlpReviewed and httpApproved are ALWAYS false unless explicitly provided
 * by a live data source (fail-safe: unapproved unless proven otherwise).
 */
export function buildEvalContext(agent: Agent, env: Environment): AgentEvalContext {
  const nameLower = agent.name.toLowerCase();
  let derivedFromHeuristic = false;

  // ---------------------------------------------------------------------------
  // authMode: prefer live field, fall back to name heuristic
  // ---------------------------------------------------------------------------
  let authMode: string;
  if (agent.authMode !== undefined) {
    authMode = agent.authMode;
  } else {
    derivedFromHeuristic = true;
    if (nameLower.includes('no auth') || agent.ownerEmail === null) {
      authMode = 'anonymous';
    } else if (nameLower.includes('user delegated')) {
      authMode = 'user_delegated';
    } else {
      authMode = 'entra_id';
    }
  }

  // ---------------------------------------------------------------------------
  // hasHttpConnector: prefer live connectors list, fall back to name heuristic
  // ---------------------------------------------------------------------------
  let hasHttpConnector: boolean;
  if (agent.connectors !== undefined) {
    hasHttpConnector = agent.connectors.some(
      (c) => c === 'http' || c === 'http_webhook' || c.startsWith('http'),
    );
  } else {
    derivedFromHeuristic = true;
    hasHttpConnector =
      nameLower.includes('http') ||
      nameLower.includes('api') ||
      nameLower.includes('external') ||
      nameLower.includes('orchestrat');
  }

  // ---------------------------------------------------------------------------
  // hasDirectlineChannel / hasTeamsChannel: prefer live channelIds
  // ---------------------------------------------------------------------------
  let hasDirectlineChannel: boolean;
  let hasTeamsChannel: boolean;
  if (agent.channelIds !== undefined) {
    hasDirectlineChannel = agent.channelIds.includes('directline');
    hasTeamsChannel = agent.channelIds.includes('teams');
  } else {
    derivedFromHeuristic = true;
    hasDirectlineChannel =
      nameLower.includes('customer') ||
      nameLower.includes('public') ||
      nameLower.includes('self-service') ||
      nameLower.includes('portal');
    hasTeamsChannel = !hasDirectlineChannel;
  }

  // ---------------------------------------------------------------------------
  // dlpReviewed: fail-safe = false (cannot infer from name)
  // httpApproved: fail-safe = false (cannot infer from name)
  // These must come from live data; heuristic defaults are always FALSE.
  // ---------------------------------------------------------------------------
  const dlpReviewed = false;   // fail-safe: unapproved unless live data says otherwise
  const httpApproved = false;  // fail-safe: unapproved unless live data says otherwise

  // ---------------------------------------------------------------------------
  // Remaining derived signals
  // ---------------------------------------------------------------------------
  const externalDataEgress = hasHttpConnector;
  const hasUnapprovedSharePointKS = nameLower.includes('legacy');

  // Env-level signals (mock: assume prod envs have a DLP policy if name includes "prod")
  const envHasDlp = env.type === 'Production' && env.name.toLowerCase().includes('prod');

  return {
    'agent.state': agent.state,
    'agent.ownerEmail': agent.ownerEmail,
    'agent.ownerName': agent.ownerName,
    'agent.lifecycle': agent.lifecycle ?? null,
    'agent.authMode': authMode,
    'agent.dlpReviewed': dlpReviewed,
    'agent.httpApproved': httpApproved,
    'agent.externalDataEgress': externalDataEgress,
    'agent.hasDirectlineChannel': hasDirectlineChannel,
    'agent.hasTeamsChannel': hasTeamsChannel,
    'agent.hasHttpConnector': hasHttpConnector,
    'agent.hasUnapprovedSharePointKS': hasUnapprovedSharePointKS,
    'env.type': env.type,
    'env.dlpPolicyId': envHasDlp ? `dlp-${env.id}` : null,
    derivedFromHeuristic,
  };
}

// evalExpression is imported from lib/policy/evaluator (T-303: shared evaluator)
// The policy evaluator's version supports &&, ||, !, contains, !contains, and
// all numeric/string/null/boolean comparisons - it is strictly a superset of
// the old compliance-local evaluator.

// ---------------------------------------------------------------------------
// Context conversion helper (T-303)
// ---------------------------------------------------------------------------

/**
 * Convert a flat AgentEvalContext (keys like 'agent.state', 'env.type') into
 * a nested object ({ agent: { state: ... }, env: { type: ... } }) so that the
 * shared policy evalExpression (which resolves dot-paths into nested objects)
 * can be used without modification.
 */
function flattenEvalContext(ctx: AgentEvalContext): Record<string, unknown> {
  const nested: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (key === 'derivedFromHeuristic') continue; // top-level meta field
    const dotIdx = key.indexOf('.');
    if (dotIdx === -1) continue;
    const ns = key.slice(0, dotIdx);
    const field = key.slice(dotIdx + 1);
    if (!nested[ns]) nested[ns] = {};
    nested[ns][field] = value;
  }
  return nested as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main evaluate function
// ---------------------------------------------------------------------------

let _violationSeq = 100; // deterministic ID counter for generated violations

/**
 * Evaluate a list of agents against the enabled rules.
 * Existing violations are passed in to preserve their lifecycle state
 * (acknowledged, resolved, suppressed) - only NEW violations are created as 'open'.
 *
 * Returns the full merged violation list (existing + new).
 */
export function evaluateAgents(
  agents: Agent[],
  environments: Environment[],
  rules: ComplianceRule[],
  existingViolations: ComplianceViolation[],
): ComplianceViolation[] {
  const enabledRules = rules.filter((r) => r.enabled);
  const envMap = new Map<string, Environment>(environments.map((e) => [e.id, e]));

  // Index existing violations by "agentRef|ruleId" for O(1) lookup
  const existingIndex = new Map<string, ComplianceViolation>();
  for (const v of existingViolations) {
    existingIndex.set(`${v.agentRef}|${v.ruleId}`, v);
  }

  const result: ComplianceViolation[] = [...existingViolations];
  const seen = new Set(existingViolations.map((v) => `${v.agentRef}|${v.ruleId}`));

  for (const agent of agents) {
    const env = envMap.get(agent.envId);
    if (!env) continue;

    const ctx = buildEvalContext(agent, env);
    const agentRef = `${agent.envId}/${agent.botId}`;

    // Convert flat AgentEvalContext (keys like 'agent.state') to nested object
    // so the shared evalExpression (policy evaluator) can resolve dot-paths.
    const nestedCtx = flattenEvalContext(ctx);

    for (const rule of enabledRules) {
      const key = `${agentRef}|${rule.id}`;
      const fired = evalExpression(rule.expression, nestedCtx);

      if (fired && !seen.has(key)) {
        // New violation
        result.push({
          id: `viol-gen-${String(++_violationSeq).padStart(8, '0')}`,
          agentRef,
          ruleId: rule.id,
          severity: rule.severity,
          state: 'open',
          detectedAt: new Date().toISOString(),
        });
        seen.add(key);
      }
    }
  }

  return result;
}
