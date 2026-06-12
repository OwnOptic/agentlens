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
 */

import type { Agent, Environment, ComplianceRule, ComplianceViolation } from '@/lib/types';

// ---------------------------------------------------------------------------
// AgentEvalContext - the flat key/value view presented to the expression DSL
// ---------------------------------------------------------------------------

export interface AgentEvalContext {
  // Agent fields
  'agent.state': string;
  'agent.ownerEmail': string | null;
  'agent.ownerName': string | null;
  'agent.lifecycle': string | null;
  /** Derived from naming conventions / mock scan results */
  'agent.authMode': string;
  'agent.dlpReviewed': boolean;
  'agent.httpApproved': boolean;
  'agent.externalDataEgress': boolean;
  'agent.hasDirectlineChannel': boolean;
  'agent.hasTeamsChannel': boolean;
  'agent.hasHttpConnector': boolean;
  'agent.hasUnapprovedSharePointKS': boolean;
  // Env fields
  'env.type': string;
  'env.dlpPolicyId': string | null;
}

// ---------------------------------------------------------------------------
// Context builder: derive AgentEvalContext from Agent + Environment
// ---------------------------------------------------------------------------

/**
 * Build the evaluation context for an agent/env pair.
 * Uses agent name heuristics and seed metadata to infer governance signals
 * without requiring live Dataverse scans.
 */
export function buildEvalContext(agent: Agent, env: Environment): AgentEvalContext {
  const nameLower = agent.name.toLowerCase();

  // Infer auth mode from agent name / ownership patterns
  let authMode = 'entra_id';
  if (nameLower.includes('no auth') || agent.ownerEmail === null) {
    authMode = 'anonymous';
  } else if (nameLower.includes('user delegated')) {
    authMode = 'user_delegated';
  }

  // Infer connectors from name
  const hasHttpConnector =
    nameLower.includes('http') ||
    nameLower.includes('api') ||
    nameLower.includes('external') ||
    nameLower.includes('orchestrat');

  // Infer channel presence
  const hasDirectlineChannel =
    nameLower.includes('customer') ||
    nameLower.includes('public') ||
    nameLower.includes('self-service') ||
    nameLower.includes('portal');
  const hasTeamsChannel = !hasDirectlineChannel;

  // DLP / approval heuristics
  const dlpReviewed = env.type === 'Production' && agent.ownerEmail !== null;
  const httpApproved = env.type !== 'Production';
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
  };
}

// ---------------------------------------------------------------------------
// DSL expression evaluator
// ---------------------------------------------------------------------------

type LiteralValue = string | boolean | null;

function parseLiteral(raw: string): LiteralValue {
  const trimmed = raw.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Quoted string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Evaluate a single comparison clause: `lhs == rhs` or `lhs != rhs`.
 * lhs is a dotted key (agent.X or env.X); rhs is a literal value.
 */
function evalClause(clause: string, ctx: AgentEvalContext): boolean {
  clause = clause.trim();

  // Handle `== null` and `!= null`
  const neqNull = /^(\S+)\s*!=\s*null$/.exec(clause);
  if (neqNull) {
    const key = neqNull[1] as keyof AgentEvalContext;
    return ctx[key] !== null && ctx[key] !== undefined;
  }
  const eqNull = /^(\S+)\s*==\s*null$/.exec(clause);
  if (eqNull) {
    const key = eqNull[1] as keyof AgentEvalContext;
    return ctx[key] === null || ctx[key] === undefined;
  }

  // `== true` / `== false`
  const eqBool = /^(\S+)\s*==\s*(true|false)$/.exec(clause);
  if (eqBool) {
    const key = eqBool[1] as keyof AgentEvalContext;
    const expected = eqBool[2] === 'true';
    return ctx[key] === expected;
  }

  // `== "string"` or `!= "string"`
  const neqStr = /^(\S+)\s*!=\s*(".*?"|'.*?'|\S+)$/.exec(clause);
  if (neqStr) {
    const key = neqStr[1] as keyof AgentEvalContext;
    const expected = parseLiteral(neqStr[2]);
    return ctx[key] !== expected;
  }
  const eqStr = /^(\S+)\s*==\s*(".*?"|'.*?'|\S+)$/.exec(clause);
  if (eqStr) {
    const key = eqStr[1] as keyof AgentEvalContext;
    const expected = parseLiteral(eqStr[2]);
    return ctx[key] === expected;
  }

  // Boolean presence check (just a key reference)
  if (/^[\w.]+$/.test(clause)) {
    const key = clause as keyof AgentEvalContext;
    const val = ctx[key];
    return val !== null && val !== undefined && val !== false && val !== '';
  }

  // Unrecognized clause - conservative default: no violation
  return false;
}

/**
 * Evaluate a full DSL expression (supports `&&` compound clauses).
 * Returns true if the expression matches (i.e. a violation is triggered).
 */
export function evalExpression(expression: string, ctx: AgentEvalContext): boolean {
  const clauses = expression.split('&&').map((c) => c.trim()).filter(Boolean);
  return clauses.every((clause) => evalClause(clause, ctx));
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

    for (const rule of enabledRules) {
      const key = `${agentRef}|${rule.id}`;
      const fired = evalExpression(rule.expression, ctx);

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
