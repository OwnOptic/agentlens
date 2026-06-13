/**
 * AgentLens Gate Policy Schema
 *
 * Defines the TypeScript representation of YAML gate policies.
 * Policies are stored as YAML strings in GatePolicy.yaml; this module
 * provides the parsed in-memory model and a lightweight parser.
 *
 * YAML shape:
 * ---
 * name: <string>
 * version: "1.0"
 * rules:
 *   - id: <string>
 *     description: <string>
 *     condition: <string>   # simple DSL expression
 *     blocking: <boolean>   # true = blocks gate; false = advisory only
 */

// ---------------------------------------------------------------------------
// Parsed policy model
// ---------------------------------------------------------------------------

/** A single rule inside a gate policy. */
export interface PolicyRule {
  /** Unique rule identifier within this policy. */
  id: string;
  /** Human-readable description shown in the gate decision UI. */
  description: string;
  /**
   * Condition expression evaluated by the evaluator.
   * Supported operators: ==, !=, >=, <=, >, <, contains, !contains, &&, ||, !()
   * Dot-paths: agent.*, maturity.*, env.*, compliance.*
   */
  condition: string;
  /**
   * When true the rule can produce a 'block' verdict.
   * When false it is advisory: a failure appends a reason but does not block.
   */
  blocking: boolean;
}

/** In-memory representation of a parsed gate policy. */
export interface ParsedPolicy {
  name: string;
  version: string;
  rules: PolicyRule[];
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

/**
 * The data model passed to the evaluator.
 * All fields are optional so partial data still evaluates gracefully.
 */
export interface PolicyContext {
  agent: AgentContext;
  env?: EnvContext;
  maturity?: MaturityContext;
  compliance?: ComplianceContext;
}

export interface AgentContext {
  botId: string;
  envId: string;
  /** auth mode string, e.g. "anonymous", "aad", "msa" */
  authMode?: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  state?: string;
  lifecycle?: string;
  dlpReviewed?: boolean;
  httpApproved?: boolean;
  /** list of connector identifiers, e.g. ["http", "sharepoint"] */
  connectors?: string[];
  /** list of channel identifiers */
  channels?: string[];
}

export interface EnvContext {
  type?: string;
  region?: string;
  dlpPolicyId?: string | null;
}

export interface MaturityContext {
  securityAvg?: number;
  managementAvg?: number;
  reportingAvg?: number;
}

export interface ComplianceContext {
  openViolationsCount?: number;
  criticalViolationsCount?: number;
}

// ---------------------------------------------------------------------------
// YAML policy parser
// ---------------------------------------------------------------------------

/**
 * Parse a gate policy YAML string into a ParsedPolicy.
 *
 * Implements a minimal line-based parser for the fixed schema above.
 * Avoids a full YAML library dependency for edge-runtime compatibility.
 * Throws a descriptive error if the YAML is structurally invalid.
 */
export function parsePolicy(yaml: string): ParsedPolicy {
  const lines = yaml.split('\n').map((l) => l.trimEnd());

  let name = '';
  let version = '1.0';
  const rules: PolicyRule[] = [];
  let seenRulesKey = false;

  let i = 0;

  // Helper: extract value from "key: value" line
  // Only strips surrounding quotes when the entire value is wrapped in a matching
  // quote pair (e.g. version: "1.0" -> 1.0, name: 'foo' -> foo).
  // Does NOT strip quotes that are embedded inside the value (condition strings).
  function extractValue(line: string): string {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return '';
    const raw = line.slice(colonIdx + 1).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  // Helper: get leading spaces count
  function indent(line: string): number {
    return line.length - line.trimStart().length;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed === '---' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    if (trimmed.startsWith('name:')) {
      name = extractValue(trimmed);
    } else if (trimmed.startsWith('version:')) {
      version = extractValue(trimmed);
    } else if (trimmed === 'rules:') {
      seenRulesKey = true;
      i++;
      // Parse list of rules
      while (i < lines.length) {
        const ruleLine = lines[i];
        const ruleTrimmed = ruleLine.trim();

        if (!ruleTrimmed || ruleTrimmed.startsWith('#')) {
          i++;
          continue;
        }

        // A rule starts with "- id:" at list-item indent level
        if (ruleTrimmed.startsWith('- id:') || ruleTrimmed.startsWith('-  id:')) {
          const baseIndent = indent(ruleLine);
          const rule: Partial<PolicyRule> = {};
          rule.id = extractValue(ruleTrimmed.replace(/^-\s*/, ''));
          i++;

          while (i < lines.length) {
            const propLine = lines[i];
            const propTrimmed = propLine.trim();

            // T-303c: blank lines and comments inside a rule block must NOT
            // be treated as a dedent - skip them and continue parsing properties.
            if (!propTrimmed || propTrimmed.startsWith('#')) {
              i++;
              continue;
            }

            // Back to parent (another list item or dedented)
            // Only check indent for non-blank lines (blank lines already skipped above)
            if (propTrimmed.startsWith('- id:') || indent(propLine) <= baseIndent) {
              break;
            }

            if (propTrimmed.startsWith('description:')) {
              rule.description = extractValue(propTrimmed);
            } else if (propTrimmed.startsWith('condition:')) {
              rule.condition = extractValue(propTrimmed);
            } else if (propTrimmed.startsWith('blocking:')) {
              const val = extractValue(propTrimmed).toLowerCase();
              rule.blocking = val === 'true';
            }
            i++;
          }

          if (!rule.id || rule.condition === undefined) {
            throw new Error(
              `Policy parse error: rule missing required fields (id/condition). Rule id="${rule.id}"`
            );
          }

          rules.push({
            id: rule.id,
            description: rule.description ?? '',
            condition: rule.condition,
            blocking: rule.blocking ?? false,
          });
          continue;
        } else {
          // Not a list item inside rules - break out of rules parsing
          break;
        }
      }
      continue;
    }

    i++;
  }

  if (!name) {
    throw new Error('Policy parse error: missing required field "name"');
  }

  // T-303d: explicitly reject policies that have no 'rules:' key.
  // Without this check, a policy with no rules silently returns [] and passes
  // every gate evaluation - a dangerous false-positive.
  if (!seenRulesKey) {
    throw new Error('Policy parse error: missing required field "rules" (no "rules:" key found)');
  }

  return { name, version, rules };
}
