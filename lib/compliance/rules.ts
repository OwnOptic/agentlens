/**
 * AgentLens Compliance - Default Rule Pack
 *
 * Provides the default set of ComplianceRules shipped with AgentLens v2.
 * Rules are evaluated by the evaluator against live or mock agent data.
 * The seed data (mockComplianceRules) overlaps intentionally; this pack
 * is the authoritative defaults and can diverge as rules evolve.
 */

import type { ComplianceRule } from '@/lib/types';

/**
 * The default rule pack. 9 rules across all 5 ComplianceRule type categories.
 * Rules referencing env.type / agent properties are evaluated by the evaluator
 * using the simplified DSL interpreter in evaluator.ts.
 */
export const defaultRulePack: ComplianceRule[] = [
  // ---- Authentication rules -----------------------------------------------
  {
    id: 'rule-auth-001',
    name: 'No Anonymous Authentication in Production',
    type: 'authentication',
    severity: 'critical',
    expression: 'agent.authMode == "anonymous" && env.type == "Production"',
    enabled: true,
  },
  {
    id: 'rule-auth-002',
    name: 'Owner Required for All Active Agents',
    type: 'authentication',
    severity: 'warning',
    expression: 'agent.state == "Active" && agent.ownerEmail == null',
    enabled: true,
  },
  {
    id: 'rule-auth-003',
    name: 'Service Principal Auth Recommended for Prod',
    type: 'authentication',
    severity: 'info',
    expression: 'env.type == "Production" && agent.authMode == "user_delegated"',
    enabled: true,
  },

  // ---- Data loss prevention rules ------------------------------------------
  {
    id: 'rule-dlp-001',
    name: 'DLP Policy Applied to All Production Environments',
    type: 'data_loss',
    severity: 'critical',
    expression: 'env.type == "Production" && env.dlpPolicyId == null',
    enabled: true,
  },
  {
    id: 'rule-dlp-002',
    name: 'No Unclassified External Data Egress',
    type: 'data_loss',
    severity: 'warning',
    expression: 'agent.externalDataEgress == true && agent.dlpReviewed == false',
    enabled: true,
  },

  // ---- Knowledge source rules -----------------------------------------------
  {
    id: 'rule-ks-001',
    name: 'SharePoint Knowledge Source Must Use Approved Sites',
    type: 'knowledge_source',
    severity: 'warning',
    expression: 'agent.hasUnapprovedSharePointKS == true',
    enabled: true,
  },

  // ---- Channel rules --------------------------------------------------------
  {
    id: 'rule-channel-001',
    name: 'Public Website Channel Requires DLP Review',
    type: 'channel',
    severity: 'warning',
    expression: 'agent.hasDirectlineChannel == true && agent.dlpReviewed == false',
    enabled: true,
  },
  {
    id: 'rule-channel-002',
    name: 'Teams Channel Agents Must Have Registered Owner',
    type: 'channel',
    severity: 'info',
    expression: 'agent.hasTeamsChannel == true && agent.ownerEmail == null',
    enabled: true,
  },

  // ---- Connector rules ------------------------------------------------------
  {
    id: 'rule-connector-001',
    name: 'HTTP Connector Blocked in Prod Without Approval',
    type: 'connector',
    severity: 'critical',
    expression: 'agent.hasHttpConnector == true && env.type == "Production" && agent.httpApproved == false',
    enabled: true,
  },
];

/**
 * Look up a rule by its ID from the default pack.
 * Returns undefined if not found.
 */
export function getRuleById(id: string): ComplianceRule | undefined {
  return defaultRulePack.find((r) => r.id === id);
}

/**
 * Return only enabled rules from the pack.
 */
export function getEnabledRules(): ComplianceRule[] {
  return defaultRulePack.filter((r) => r.enabled);
}

/**
 * Return rules filtered by type.
 */
export function getRulesByType(type: ComplianceRule['type']): ComplianceRule[] {
  return defaultRulePack.filter((r) => r.type === type);
}
