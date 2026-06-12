/**
 * AgentLens Compliance - Risky Pattern Detector
 *
 * Detects all RiskyPattern values for each agent by examining agent fields,
 * name heuristics, and the eval context from evaluator.ts.
 *
 * RiskyPattern enum values (from lib/types/index.ts):
 *   'autonomous' | 'maker_credential' | 'http_action' | 'anonymous_auth' |
 *   'computer_use' | 'shared_entire_tenant' | 'risky_connector'
 *
 * Each detector function returns true if the pattern is present on the agent.
 * detectAllPatterns() returns the full matrix row for one agent.
 */

import type { Agent, Environment, RiskyPattern } from '@/lib/types';
import { buildEvalContext } from './evaluator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPatternResult {
  agentRef: string;
  agentName: string;
  envId: string;
  envType: string;
  lifecycle: string | null;
  patterns: Record<RiskyPattern, boolean>;
  /** Total number of risky patterns detected */
  patternCount: number;
  /** Highest-risk pattern label for sorting */
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Individual pattern detectors
// These each take the agent + env + derived context and return a boolean.
// ---------------------------------------------------------------------------

/** Autonomous: agent can take actions without human confirmation steps. */
function detectAutonomous(agent: Agent, env: Environment): boolean {
  const name = agent.name.toLowerCase();
  // Orchestrators, pipeline agents, agents with "action" in name
  return (
    name.includes('orchestrat') ||
    name.includes('pipeline') ||
    name.includes('automat') ||
    (env.type === 'Production' && name.includes('action'))
  );
}

/** Maker credential: agent uses maker's personal OAuth token instead of a service principal. */
function detectMakerCredential(agent: Agent): boolean {
  const ctx = buildEvalContext(agent, {
    id: agent.envId,
    name: '',
    type: 'Default',
    isDefault: false,
    region: '',
    orgUrl: '',
  });
  // Heuristic: user-delegated auth in combo with low-maturity lifecycle
  return (
    ctx['agent.authMode'] === 'user_delegated' ||
    (agent.lifecycle === 'poc' && agent.ownerEmail !== null)
  );
}

/** HTTP action: agent calls external HTTP endpoints (potential data exfiltration). */
function detectHttpAction(agent: Agent): boolean {
  const name = agent.name.toLowerCase();
  return (
    name.includes('http') ||
    name.includes('external api') ||
    name.includes('api orchestrat') ||
    name.includes('webhook') ||
    name.includes('external')
  );
}

/** Anonymous auth: agent allows unauthenticated end users. */
function detectAnonymousAuth(agent: Agent, env: Environment): boolean {
  const ctx = buildEvalContext(agent, env);
  return ctx['agent.authMode'] === 'anonymous';
}

/** Computer use: agent controls a desktop or RPA flow. */
function detectComputerUse(agent: Agent): boolean {
  const name = agent.name.toLowerCase();
  return (
    name.includes('rpa') ||
    name.includes('computer use') ||
    name.includes('desktop') ||
    name.includes('screen') ||
    name.includes('ui automation')
  );
}

/** Shared entire tenant: agent is shared with the whole tenant (all users). */
function detectSharedEntireTenant(agent: Agent, env: Environment): boolean {
  // Heuristic: default env agents with no owner are typically tenant-wide
  return env.isDefault && agent.ownerEmail === null && agent.state === 'Active';
}

/** Risky connector: agent uses a connector classified as high-risk (SQL, SAP, Salesforce, etc.). */
function detectRiskyConnector(agent: Agent): boolean {
  const name = agent.name.toLowerCase();
  return (
    name.includes('crm') ||
    name.includes('salesforce') ||
    name.includes('sap') ||
    name.includes('sql') ||
    name.includes('legacy') ||
    name.includes('finance')
  );
}

// ---------------------------------------------------------------------------
// Risk score: weight each pattern for sorting
// ---------------------------------------------------------------------------

const PATTERN_RISK_WEIGHT: Record<RiskyPattern, number> = {
  anonymous_auth: 10,
  http_action: 8,
  risky_connector: 7,
  shared_entire_tenant: 7,
  autonomous: 6,
  maker_credential: 5,
  computer_use: 4,
};

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * Detect all RiskyPattern values for a single agent + environment pair.
 * Returns a complete AgentPatternResult row.
 */
export function detectAllPatterns(agent: Agent, env: Environment): AgentPatternResult {
  const patterns: Record<RiskyPattern, boolean> = {
    autonomous: detectAutonomous(agent, env),
    maker_credential: detectMakerCredential(agent),
    http_action: detectHttpAction(agent),
    anonymous_auth: detectAnonymousAuth(agent, env),
    computer_use: detectComputerUse(agent),
    shared_entire_tenant: detectSharedEntireTenant(agent, env),
    risky_connector: detectRiskyConnector(agent),
  };

  const patternCount = Object.values(patterns).filter(Boolean).length;
  const riskScore = (Object.entries(patterns) as [RiskyPattern, boolean][])
    .filter(([, v]) => v)
    .reduce((acc, [k]) => acc + PATTERN_RISK_WEIGHT[k], 0);

  return {
    agentRef: `${agent.envId}/${agent.botId}`,
    agentName: agent.name,
    envId: agent.envId,
    envType: env.type,
    lifecycle: agent.lifecycle ?? null,
    patterns,
    patternCount,
    riskScore,
  };
}

/**
 * Build the full risky-patterns matrix for a list of agents + environments.
 * Results are sorted by riskScore descending (highest-risk agents first).
 */
export function buildPatternsMatrix(
  agents: Agent[],
  environments: Environment[],
): AgentPatternResult[] {
  const envMap = new Map<string, Environment>(environments.map((e) => [e.id, e]));

  const rows: AgentPatternResult[] = [];
  for (const agent of agents) {
    const env = envMap.get(agent.envId);
    if (!env) continue;
    rows.push(detectAllPatterns(agent, env));
  }

  return rows.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Return the ordered list of all RiskyPattern keys (stable column order for the matrix).
 */
export const ALL_RISKY_PATTERNS: RiskyPattern[] = [
  'anonymous_auth',
  'http_action',
  'risky_connector',
  'shared_entire_tenant',
  'autonomous',
  'maker_credential',
  'computer_use',
];

/**
 * Human-readable labels for each pattern.
 */
export const PATTERN_LABELS: Record<RiskyPattern, string> = {
  anonymous_auth: 'Anonymous Auth',
  http_action: 'HTTP Action',
  risky_connector: 'Risky Connector',
  shared_entire_tenant: 'Shared: Entire Tenant',
  autonomous: 'Autonomous',
  maker_credential: 'Maker Credential',
  computer_use: 'Computer Use',
};
