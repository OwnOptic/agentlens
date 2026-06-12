/**
 * AgentLens Gate Policy Evaluator
 *
 * Evaluates a ParsedPolicy against a PolicyContext.
 * Returns a structured EvaluationResult with verdict + per-rule outcomes.
 *
 * Expression DSL supported:
 *   <path> == <value>        (strict equality)
 *   <path> != <value>        (strict inequality)
 *   <path> >= <number>
 *   <path> <= <number>
 *   <path> > <number>
 *   <path> < <number>
 *   <path> contains <string>
 *   <path> !contains <string>
 *   !(<expr>)                (negation)
 *   <expr> && <expr>         (logical AND)
 *   <expr> || <expr>         (logical OR)
 *
 * Paths are dot-separated keys resolved against the PolicyContext.
 * Null/undefined paths evaluate to null and will fail equality checks.
 */

import type { ParsedPolicy, PolicyRule, PolicyContext } from './schema';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RuleVerdict = 'pass' | 'fail' | 'skip';

export interface RuleOutcome {
  ruleId: string;
  description: string;
  verdict: RuleVerdict;
  blocking: boolean;
  reason: string;
}

export interface EvaluationResult {
  /** 'pass' if no blocking rule failed; 'block' if at least one did. */
  verdict: 'pass' | 'block';
  /** Human-readable reasons (one per failing rule). */
  reasons: string[];
  /** Detailed per-rule outcomes. */
  ruleOutcomes: RuleOutcome[];
  /** True when all blocking rules passed and no critical violations exist. */
  eligible: boolean;
}

// ---------------------------------------------------------------------------
// Path resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-path against a nested object.
 * Returns undefined when any segment is absent.
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Expression lexer / evaluator
// ---------------------------------------------------------------------------

/** Trim surrounding quotes from a string literal token. */
function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}

/** Coerce an unknown value to a number for comparison; returns NaN if not possible. */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v);
  return NaN;
}

/** Returns true if the value matches "null" or "undefined" literal tokens. */
function isNullLiteral(s: string): boolean {
  return s === 'null' || s === 'undefined';
}

/**
 * Parse and evaluate a single atomic expression (no &&/|| at top level).
 * Handles: ==, !=, >=, <=, >, <, contains, !contains
 */
function evalAtom(expr: string, ctx: Record<string, unknown>): boolean {
  const trimmed = expr.trim();

  // Negation: !(inner)
  if (trimmed.startsWith('!(') && trimmed.endsWith(')')) {
    return !evalAtom(trimmed.slice(2, -1), ctx);
  }

  // !contains
  const notContainsMatch = trimmed.match(/^(.+?)\s+!contains\s+(.+)$/);
  if (notContainsMatch) {
    const lhsVal = resolvePath(ctx, notContainsMatch[1].trim());
    const rhs = stripQuotes(notContainsMatch[2].trim());
    if (Array.isArray(lhsVal)) return !lhsVal.includes(rhs);
    if (typeof lhsVal === 'string') return !lhsVal.includes(rhs);
    return true; // no value = doesn't contain
  }

  // contains
  const containsMatch = trimmed.match(/^(.+?)\s+contains\s+(.+)$/);
  if (containsMatch) {
    const lhsVal = resolvePath(ctx, containsMatch[1].trim());
    const rhs = stripQuotes(containsMatch[2].trim());
    if (Array.isArray(lhsVal)) return lhsVal.includes(rhs);
    if (typeof lhsVal === 'string') return lhsVal.includes(rhs);
    return false;
  }

  // Numeric / equality comparisons
  const opMatch = trimmed.match(/^(.+?)\s*(>=|<=|!=|==|>|<)\s*(.+)$/);
  if (opMatch) {
    const lhsPath = opMatch[1].trim();
    const op = opMatch[2];
    const rhsRaw = opMatch[3].trim();

    const lhsVal = resolvePath(ctx, lhsPath);

    // null literal comparisons
    if (isNullLiteral(rhsRaw)) {
      const isNull = lhsVal === null || lhsVal === undefined;
      if (op === '==') return isNull;
      if (op === '!=') return !isNull;
      return false;
    }

    // boolean literals
    if (rhsRaw === 'true' || rhsRaw === 'false') {
      const rhsBool = rhsRaw === 'true';
      if (op === '==') return lhsVal === rhsBool || String(lhsVal) === rhsRaw;
      if (op === '!=') return lhsVal !== rhsBool && String(lhsVal) !== rhsRaw;
      return false;
    }

    // Try numeric comparison first
    const lhsNum = toNum(lhsVal);
    const rhsNum = toNum(rhsRaw);

    if (!isNaN(lhsNum) && !isNaN(rhsNum)) {
      if (op === '==') return lhsNum === rhsNum;
      if (op === '!=') return lhsNum !== rhsNum;
      if (op === '>=') return lhsNum >= rhsNum;
      if (op === '<=') return lhsNum <= rhsNum;
      if (op === '>') return lhsNum > rhsNum;
      if (op === '<') return lhsNum < rhsNum;
    }

    // String comparison
    const lhsStr = lhsVal === null || lhsVal === undefined ? null : String(lhsVal);
    const rhsStr = stripQuotes(rhsRaw);

    if (op === '==') return lhsStr === rhsStr;
    if (op === '!=') return lhsStr !== rhsStr;

    return false;
  }

  // Bare boolean path (e.g. "agent.dlpReviewed")
  const val = resolvePath(ctx, trimmed);
  return Boolean(val);
}

/**
 * Split an expression on top-level && or || operators
 * (not inside parentheses).
 */
function splitTopLevel(expr: string, op: '&&' | '||'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;
    else if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(expr.slice(start, i).trim());
      start = i + op.length;
      i += op.length - 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
}

/**
 * Fully evaluate an expression string, respecting &&, ||, and nesting.
 */
function evalExpression(expr: string, ctx: Record<string, unknown>): boolean {
  const trimmed = expr.trim();

  // Split on || first (lowest precedence)
  const orParts = splitTopLevel(trimmed, '||');
  if (orParts.length > 1) {
    return orParts.some((p) => evalExpression(p, ctx));
  }

  // Split on &&
  const andParts = splitTopLevel(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every((p) => evalExpression(p, ctx));
  }

  return evalAtom(trimmed, ctx);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Flatten a PolicyContext into a plain record for path resolution.
 */
function flattenContext(ctx: PolicyContext): Record<string, unknown> {
  return {
    agent: ctx.agent as unknown as Record<string, unknown>,
    env: (ctx.env ?? {}) as Record<string, unknown>,
    maturity: (ctx.maturity ?? {}) as Record<string, unknown>,
    compliance: (ctx.compliance ?? {}) as Record<string, unknown>,
  };
}

/**
 * Evaluate a single rule against the context.
 */
function evaluateRule(rule: PolicyRule, ctx: Record<string, unknown>): RuleOutcome {
  let passed: boolean;

  try {
    passed = evalExpression(rule.condition, ctx);
  } catch (err) {
    // If expression throws, treat as evaluation failure (fail-safe: block)
    return {
      ruleId: rule.id,
      description: rule.description,
      verdict: 'fail',
      blocking: rule.blocking,
      reason: `Rule "${rule.id}" expression evaluation error: ${String(err)}`,
    };
  }

  if (passed) {
    return {
      ruleId: rule.id,
      description: rule.description,
      verdict: 'pass',
      blocking: rule.blocking,
      reason: '',
    };
  }

  return {
    ruleId: rule.id,
    description: rule.description,
    verdict: 'fail',
    blocking: rule.blocking,
    reason: rule.blocking
      ? `BLOCK - ${rule.description} (condition: ${rule.condition})`
      : `ADVISORY - ${rule.description} (condition: ${rule.condition})`,
  };
}

/**
 * Evaluate a parsed policy against a PolicyContext.
 *
 * @param policy  The parsed gate policy.
 * @param context The agent/env/maturity/compliance data to test.
 * @returns       EvaluationResult with verdict, reasons, and per-rule outcomes.
 */
export function evaluate(policy: ParsedPolicy, context: PolicyContext): EvaluationResult {
  const flat = flattenContext(context);
  const ruleOutcomes: RuleOutcome[] = [];
  const reasons: string[] = [];
  let blocked = false;

  for (const rule of policy.rules) {
    const outcome = evaluateRule(rule, flat);
    ruleOutcomes.push(outcome);

    if (outcome.verdict === 'fail') {
      reasons.push(outcome.reason);
      if (outcome.blocking) {
        blocked = true;
      }
    }
  }

  const verdict: 'pass' | 'block' = blocked ? 'block' : 'pass';

  return {
    verdict,
    reasons,
    ruleOutcomes,
    eligible: !blocked,
  };
}

/**
 * Convenience: evaluate raw YAML directly (parses then evaluates).
 * Throws if the YAML is invalid.
 */
export function evaluateYaml(yaml: string, context: PolicyContext): EvaluationResult {
  // Lazy import to avoid circular deps at module level
  const { parsePolicy } = require('./schema') as { parsePolicy: (y: string) => ParsedPolicy };
  return evaluate(parsePolicy(yaml), context);
}
