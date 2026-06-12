/**
 * AgentLens Mock Seed Data
 *
 * Realistic mock data for every v1 + v2 type.
 * Import these arrays in any page/component to render without a live tenant.
 * All IDs are stable UUIDs so mocks can be cross-referenced.
 *
 * Usage:
 *   import { mockAgents, mockEnvironments, ... } from '@/lib/mock/seed';
 */

import type {
  Environment,
  Agent,
  AgentMetricDaily,
  Alert,
  IngestionRun,
  Capacity,
  ComplianceRule,
  ComplianceViolation,
  MaturityControl,
  MaturityResult,
  GatePolicy,
  GateDecision,
  ConversationKpi,
  HealthMetric,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Environments (4 envs: default, dev, uat, prod)
// ---------------------------------------------------------------------------
export const mockEnvironments: Environment[] = [
  {
    id: 'env-default-00000000',
    name: 'Default Environment',
    type: 'Default',
    isDefault: true,
    region: 'westeurope',
    orgUrl: 'https://org-default.crm4.dynamics.com',
  },
  {
    id: 'env-dev-11111111',
    name: 'AgentLens-Dev',
    type: 'Sandbox',
    isDefault: false,
    region: 'westeurope',
    orgUrl: 'https://org-dev.crm4.dynamics.com',
  },
  {
    id: 'env-uat-22222222',
    name: 'AgentLens-UAT',
    type: 'Sandbox',
    isDefault: false,
    region: 'westeurope',
    orgUrl: 'https://org-uat.crm4.dynamics.com',
  },
  {
    id: 'env-prod-33333333',
    name: 'AgentLens-Prod',
    type: 'Production',
    isDefault: false,
    region: 'westeurope',
    orgUrl: 'https://org-prod.crm4.dynamics.com',
  },
];

// ---------------------------------------------------------------------------
// Agents (10 agents, varied auth/model/channels/lifecycle across envs)
// ---------------------------------------------------------------------------
export const mockAgents: Agent[] = [
  {
    envId: 'env-default-00000000',
    botId: 'bot-anon-hr-aaa',
    name: 'HR Self-Service Bot',
    ownerName: null,
    ownerEmail: null,
    state: 'Active',
    createdOn: '2025-11-03T08:00:00Z',
    modifiedOn: '2026-05-10T14:22:00Z',
    lastActivity: '2026-06-11T16:45:00Z',
    kind: 'copilot_studio',
    lifecycle: 'prod',
  },
  {
    envId: 'env-default-00000000',
    botId: 'bot-anon-it-bbb',
    name: 'IT Helpdesk (No Auth)',
    ownerName: 'John Maker',
    ownerEmail: 'john.maker@contoso.com',
    state: 'Active',
    createdOn: '2025-12-01T09:00:00Z',
    modifiedOn: '2026-04-02T11:00:00Z',
    lastActivity: '2026-06-10T08:30:00Z',
    kind: 'copilot_studio',
    lifecycle: 'pilot',
  },
  {
    envId: 'env-default-00000000',
    botId: 'bot-orphan-ccc',
    name: 'Abandoned PoC Bot',
    ownerName: null,
    ownerEmail: null,
    state: 'Active',
    createdOn: '2025-09-15T10:00:00Z',
    modifiedOn: '2025-10-01T10:00:00Z',
    lastActivity: '2025-10-01T10:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'poc',
  },
  {
    envId: 'env-dev-11111111',
    botId: 'bot-dev-sales-ddd',
    name: 'Sales Intelligence Agent',
    ownerName: 'Alice Dev',
    ownerEmail: 'alice.dev@contoso.com',
    state: 'Active',
    createdOn: '2026-01-10T09:00:00Z',
    modifiedOn: '2026-06-01T12:00:00Z',
    lastActivity: '2026-06-12T07:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'poc',
  },
  {
    envId: 'env-dev-11111111',
    botId: 'bot-dev-http-eee',
    name: 'External API Orchestrator',
    ownerName: 'Bob Builder',
    ownerEmail: 'bob.builder@contoso.com',
    state: 'Active',
    createdOn: '2026-02-20T09:00:00Z',
    modifiedOn: '2026-05-30T16:00:00Z',
    lastActivity: '2026-06-11T22:10:00Z',
    kind: 'copilot_studio',
    lifecycle: 'poc',
  },
  {
    envId: 'env-uat-22222222',
    botId: 'bot-uat-finance-fff',
    name: 'Finance Reporting Assistant',
    ownerName: 'Carol Finance',
    ownerEmail: 'carol.finance@contoso.com',
    state: 'Active',
    createdOn: '2026-03-01T09:00:00Z',
    modifiedOn: '2026-06-05T09:00:00Z',
    lastActivity: '2026-06-12T10:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'pilot',
  },
  {
    envId: 'env-uat-22222222',
    botId: 'bot-uat-procurement-ggg',
    name: 'Procurement Orchestrator',
    ownerName: 'Dave Procurement',
    ownerEmail: 'dave.proc@contoso.com',
    state: 'Active',
    createdOn: '2026-04-01T09:00:00Z',
    modifiedOn: '2026-06-10T13:00:00Z',
    lastActivity: '2026-06-12T11:30:00Z',
    kind: 'copilot_studio',
    lifecycle: 'pilot',
  },
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-customercare-hhh',
    name: 'Customer Care Agent',
    ownerName: 'Eve Ops',
    ownerEmail: 'eve.ops@contoso.com',
    state: 'Active',
    createdOn: '2025-10-01T09:00:00Z',
    modifiedOn: '2026-06-08T10:00:00Z',
    lastActivity: '2026-06-12T12:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'prod',
  },
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-onboarding-iii',
    name: 'Employee Onboarding Agent',
    ownerName: 'Frank HR',
    ownerEmail: 'frank.hr@contoso.com',
    state: 'Active',
    createdOn: '2025-11-15T09:00:00Z',
    modifiedOn: '2026-05-20T11:00:00Z',
    lastActivity: '2026-06-11T17:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'prod',
  },
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-inactive-jjj',
    name: 'Legacy CRM Connector Bot',
    ownerName: 'Grace Legacy',
    ownerEmail: 'grace.legacy@contoso.com',
    state: 'Inactive',
    createdOn: '2025-06-01T09:00:00Z',
    modifiedOn: '2025-12-01T09:00:00Z',
    lastActivity: '2025-12-01T09:00:00Z',
    kind: 'copilot_studio',
    lifecycle: 'prod',
  },
];

// ---------------------------------------------------------------------------
// AgentMetricDaily (last 3 days for a subset of agents)
// ---------------------------------------------------------------------------
export const mockMetrics: AgentMetricDaily[] = [
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-customercare-hhh',
    date: '2026-06-12',
    messageCount: 1840,
    sessionCount: 412,
    estimatedCost: 41.20,
    modelMeter: 'standard',
    featureBreakdown: { generativeAnswers: 820, agentActions: 310, agentFlows: 200, textTools: 510 },
    projectedMonthly: 1236.00,
  },
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-customercare-hhh',
    date: '2026-06-11',
    messageCount: 1760,
    sessionCount: 395,
    estimatedCost: 39.50,
    modelMeter: 'standard',
    featureBreakdown: { generativeAnswers: 790, agentActions: 295, agentFlows: 195, textTools: 480 },
    projectedMonthly: 1185.00,
  },
  {
    envId: 'env-prod-33333333',
    botId: 'bot-prod-onboarding-iii',
    date: '2026-06-12',
    messageCount: 540,
    sessionCount: 120,
    estimatedCost: 12.00,
    modelMeter: 'standard',
    featureBreakdown: { generativeAnswers: 240, agentActions: 90, agentFlows: 80, textTools: 130 },
    projectedMonthly: 360.00,
  },
  {
    envId: 'env-uat-22222222',
    botId: 'bot-uat-finance-fff',
    date: '2026-06-12',
    messageCount: 320,
    sessionCount: 78,
    estimatedCost: 8.60,
    modelMeter: 'premium',
    featureBreakdown: { generativeAnswers: 160, agentActions: 60, agentFlows: 40, textTools: 60 },
    projectedMonthly: 258.00,
  },
  {
    envId: 'env-default-00000000',
    botId: 'bot-anon-hr-aaa',
    date: '2026-06-12',
    messageCount: 210,
    sessionCount: 55,
    estimatedCost: 5.50,
    modelMeter: 'standard',
    featureBreakdown: { generativeAnswers: 110, agentActions: 30, agentFlows: 25, textTools: 45 },
    projectedMonthly: 165.00,
  },
  {
    envId: 'env-dev-11111111',
    botId: 'bot-dev-http-eee',
    date: '2026-06-12',
    messageCount: 88,
    sessionCount: 22,
    estimatedCost: 2.20,
    modelMeter: 'standard',
    featureBreakdown: { generativeAnswers: 40, agentActions: 18, agentFlows: 15, textTools: 15 },
    projectedMonthly: 66.00,
  },
];

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export const mockAlerts: Alert[] = [
  {
    id: 'alert-00000001',
    type: 'new_default_env_agent',
    severity: 'critical',
    envId: 'env-default-00000000',
    botId: 'bot-anon-hr-aaa',
    message: 'New agent deployed directly into Default Environment without approval gate.',
    state: 'open',
    createdAt: '2026-06-11T08:00:00Z',
  },
  {
    id: 'alert-00000002',
    type: 'orphan_idle',
    severity: 'warning',
    envId: 'env-default-00000000',
    botId: 'bot-orphan-ccc',
    message: 'Agent has had no activity for 253 days and has no registered owner.',
    state: 'open',
    createdAt: '2026-06-10T06:00:00Z',
  },
  {
    id: 'alert-00000003',
    type: 'budget_breach',
    severity: 'critical',
    envId: 'env-prod-33333333',
    botId: 'bot-prod-customercare-hhh',
    message: 'Projected monthly spend ($1,236) exceeds environment budget cap ($1,000).',
    state: 'open',
    createdAt: '2026-06-12T01:00:00Z',
  },
  {
    id: 'alert-00000004',
    type: 'model_meter_mismatch',
    severity: 'warning',
    envId: 'env-uat-22222222',
    botId: 'bot-uat-finance-fff',
    message: 'Agent is using premium meter but was provisioned on a standard-tier budget.',
    state: 'ack',
    createdAt: '2026-06-09T14:30:00Z',
  },
  {
    id: 'alert-00000005',
    type: 'volume_spike',
    severity: 'info',
    envId: 'env-dev-11111111',
    botId: 'bot-dev-http-eee',
    message: '3x message volume spike detected vs 7-day average. Possible test automation leak.',
    state: 'resolved',
    createdAt: '2026-06-08T11:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// IngestionRuns
// ---------------------------------------------------------------------------
export const mockIngestionRuns: IngestionRun[] = [
  {
    id: 'run-00000001',
    startedAt: '2026-06-12T00:00:00Z',
    finishedAt: '2026-06-12T00:04:22Z',
    status: 'success',
    envCount: 4,
    agentCount: 10,
    errors: [],
  },
  {
    id: 'run-00000002',
    startedAt: '2026-06-11T00:00:00Z',
    finishedAt: '2026-06-11T00:05:01Z',
    status: 'partial',
    envCount: 4,
    agentCount: 9,
    errors: ['env-uat-22222222: 401 Unauthorized - service principal token expired'],
  },
];

// ---------------------------------------------------------------------------
// Capacity (v2)
// ---------------------------------------------------------------------------
export const mockCapacity: Capacity[] = [
  {
    envId: 'env-default-00000000',
    creditLimit: 5000,
    creditUsed: 3210,
    pct: 64.2,
    overage: false,
  },
  {
    envId: 'env-dev-11111111',
    creditLimit: 2000,
    creditUsed: 487,
    pct: 24.4,
    overage: false,
  },
  {
    envId: 'env-uat-22222222',
    creditLimit: 3000,
    creditUsed: 2980,
    pct: 99.3,
    overage: false,
  },
  {
    envId: 'env-prod-33333333',
    creditLimit: 10000,
    creditUsed: 10412,
    pct: 104.1,
    overage: true,
  },
];

// ---------------------------------------------------------------------------
// ComplianceRules (v2) - representative rule catalogue
// ---------------------------------------------------------------------------
export const mockComplianceRules: ComplianceRule[] = [
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
    id: 'rule-channel-001',
    name: 'Public Website Channel Requires DLP Review',
    type: 'channel',
    severity: 'warning',
    expression: 'agent.channels contains "directline" && agent.dlpReviewed == false',
    enabled: true,
  },
  {
    id: 'rule-connector-001',
    name: 'HTTP Connector Blocked in Prod Without Approval',
    type: 'connector',
    severity: 'critical',
    expression: 'agent.connectors contains "http" && env.type == "Production" && agent.httpApproved == false',
    enabled: true,
  },
  {
    id: 'rule-dlp-001',
    name: 'SharePoint Knowledge Source Must Use Approved SharePoint Sites',
    type: 'knowledge_source',
    severity: 'warning',
    expression: 'agent.knowledgeSources.some(s => s.type == "sharepoint" && !s.siteUrl.startsWith("https://contoso.sharepoint.com"))',
    enabled: true,
  },
  {
    id: 'rule-dlp-002',
    name: 'DLP Policy Applied to All Production Environments',
    type: 'data_loss',
    severity: 'critical',
    expression: 'env.type == "Production" && env.dlpPolicyId == null',
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// ComplianceViolations (v2)
// ---------------------------------------------------------------------------
export const mockViolations: ComplianceViolation[] = [
  {
    id: 'viol-00000001',
    agentRef: 'env-default-00000000/bot-anon-it-bbb',
    ruleId: 'rule-auth-001',
    severity: 'critical',
    state: 'open',
    detectedAt: '2026-06-12T00:05:00Z',
  },
  {
    id: 'viol-00000002',
    agentRef: 'env-default-00000000/bot-anon-hr-aaa',
    ruleId: 'rule-auth-002',
    severity: 'warning',
    state: 'open',
    detectedAt: '2026-06-11T00:05:00Z',
  },
  {
    id: 'viol-00000003',
    agentRef: 'env-default-00000000/bot-orphan-ccc',
    ruleId: 'rule-auth-002',
    severity: 'warning',
    state: 'acknowledged',
    detectedAt: '2026-05-20T00:05:00Z',
  },
  {
    id: 'viol-00000004',
    agentRef: 'env-dev-11111111/bot-dev-http-eee',
    ruleId: 'rule-connector-001',
    severity: 'critical',
    state: 'open',
    detectedAt: '2026-06-12T00:05:00Z',
  },
  {
    id: 'viol-00000005',
    agentRef: 'env-uat-22222222/bot-uat-procurement-ggg',
    ruleId: 'rule-channel-001',
    severity: 'warning',
    state: 'resolved',
    detectedAt: '2026-06-01T00:05:00Z',
  },
];

// ---------------------------------------------------------------------------
// MaturityControls (v2) - abbreviated catalogue
// ---------------------------------------------------------------------------
export const mockMaturityControls: MaturityControl[] = [
  {
    id: 'ctrl-sec-001',
    pillar: 'security',
    name: 'Authentication enforcement across all channels',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-sec-002',
    pillar: 'security',
    name: 'DLP policy applied to all environments',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-sec-003',
    pillar: 'security',
    name: 'Service principal rotation policy in place',
    autoEvaluable: false,
  },
  {
    id: 'ctrl-mgmt-001',
    pillar: 'management',
    name: 'All agents have a registered owner',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-mgmt-002',
    pillar: 'management',
    name: 'Release gate policy active for prod promotions',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-mgmt-003',
    pillar: 'management',
    name: 'Lifecycle stages tagged on all agents',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-rep-001',
    pillar: 'reporting',
    name: 'App Insights workspace connected',
    autoEvaluable: true,
  },
  {
    id: 'ctrl-rep-002',
    pillar: 'reporting',
    name: 'Weekly governance digest circulated',
    autoEvaluable: false,
  },
];

// ---------------------------------------------------------------------------
// MaturityResults (v2)
// ---------------------------------------------------------------------------
export const mockMaturityResults: MaturityResult[] = [
  { controlId: 'ctrl-sec-001', score: 2, capped: true, residualBurden: 'Anonymous auth detected on 2 agents in default env. Manual review required.' },
  { controlId: 'ctrl-sec-002', score: 3, capped: true, residualBurden: 'All prod envs have DLP; dev/uat coverage unverified via API.' },
  { controlId: 'ctrl-sec-003', score: 1, capped: false, residualBurden: 'No rotation policy documented. Manual IT process claimed but not audited.' },
  { controlId: 'ctrl-mgmt-001', score: 2, capped: true, residualBurden: '3 agents have null ownerEmail. Orphan remediation in progress.' },
  { controlId: 'ctrl-mgmt-002', score: 4, capped: true, residualBurden: 'Gate policy enforced via CI; manual overrides still possible by Global Admin.' },
  { controlId: 'ctrl-mgmt-003', score: 3, capped: true, residualBurden: '1 agent missing lifecycle tag (legacy-crm bot).' },
  { controlId: 'ctrl-rep-001', score: 4, capped: true, residualBurden: 'App Insights workspace connected for all prod envs.' },
  { controlId: 'ctrl-rep-002', score: 2, capped: false, residualBurden: 'Digest sent ad-hoc; no automated schedule confirmed.' },
];

// ---------------------------------------------------------------------------
// GatePolicies (v2)
// ---------------------------------------------------------------------------
export const mockGatePolicies: GatePolicy[] = [
  {
    id: 'gate-policy-prod',
    name: 'Prod Promotion Gate',
    yaml: `---
name: prod-promotion-gate
version: "1.0"
rules:
  - id: no_anon_auth
    description: Agent must not use anonymous authentication
    condition: agent.authMode != "anonymous"
    blocking: true
  - id: owner_required
    description: Agent must have a registered owner
    condition: agent.ownerEmail != null
    blocking: true
  - id: dlp_reviewed
    description: DLP review must be completed
    condition: agent.dlpReviewed == true
    blocking: true
  - id: maturity_min_score
    description: Security pillar average score must be >= 3
    condition: maturity.securityAvg >= 3
    blocking: false
`,
    enabled: true,
  },
  {
    id: 'gate-policy-pilot',
    name: 'Pilot Promotion Gate',
    yaml: `---
name: pilot-promotion-gate
version: "1.0"
rules:
  - id: owner_required
    description: Agent must have a registered owner
    condition: agent.ownerEmail != null
    blocking: true
  - id: no_http_connector_unapproved
    description: HTTP connector requires explicit approval for pilot
    condition: "!(agent.connectors contains 'http') || agent.httpApproved == true"
    blocking: true
`,
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// GateDecision (v2) - one pass, one block
// ---------------------------------------------------------------------------
export const mockGateDecisions: GateDecision[] = [
  {
    id: 'gate-decision-00000001',
    agentRef: 'env-uat-22222222/bot-uat-finance-fff',
    verdict: 'pass',
    reasons: ['All blocking rules satisfied.'],
    signedAt: '2026-06-10T14:00:00Z',
    signature: 'a3f8c2d1e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1',
    revoked: false,
  },
  {
    id: 'gate-decision-00000002',
    agentRef: 'env-dev-11111111/bot-dev-http-eee',
    verdict: 'block',
    reasons: [
      'rule no_http_connector_unapproved: HTTP connector present but httpApproved flag is false.',
      'rule owner_required: ownerEmail is set (non-blocking check passed).',
    ],
    signedAt: '2026-06-11T09:30:00Z',
    signature: 'b4c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9',
    revoked: false,
  },
];

// ---------------------------------------------------------------------------
// ConversationKpis (v2) - last 3 days for prod agents
// ---------------------------------------------------------------------------
export const mockConversationKpis: ConversationKpi[] = [
  { envId: 'env-prod-33333333', botId: 'bot-prod-customercare-hhh', date: '2026-06-12', sessions: 412, deflectionRate: 0.74, escalationRate: 0.11 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-customercare-hhh', date: '2026-06-11', sessions: 395, deflectionRate: 0.72, escalationRate: 0.13 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-customercare-hhh', date: '2026-06-10', sessions: 380, deflectionRate: 0.70, escalationRate: 0.14 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-onboarding-iii', date: '2026-06-12', sessions: 120, deflectionRate: 0.88, escalationRate: 0.05 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-onboarding-iii', date: '2026-06-11', sessions: 115, deflectionRate: 0.87, escalationRate: 0.06 },
  { envId: 'env-uat-22222222', botId: 'bot-uat-finance-fff', date: '2026-06-12', sessions: 78, deflectionRate: 0.62, escalationRate: 0.20 },
  { envId: 'env-uat-22222222', botId: 'bot-uat-procurement-ggg', date: '2026-06-12', sessions: 44, deflectionRate: 0.55, escalationRate: 0.25 },
];

// ---------------------------------------------------------------------------
// HealthMetrics (v2) - last 2 days for prod + uat
// ---------------------------------------------------------------------------
export const mockHealthMetrics: HealthMetric[] = [
  { envId: 'env-prod-33333333', botId: 'bot-prod-customercare-hhh', date: '2026-06-12', errorRate: 0.012, avgLatencyMs: 820, failedSessions: 5 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-customercare-hhh', date: '2026-06-11', errorRate: 0.015, avgLatencyMs: 860, failedSessions: 6 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-onboarding-iii', date: '2026-06-12', errorRate: 0.005, avgLatencyMs: 640, failedSessions: 1 },
  { envId: 'env-prod-33333333', botId: 'bot-prod-onboarding-iii', date: '2026-06-11', errorRate: 0.008, avgLatencyMs: 670, failedSessions: 1 },
  { envId: 'env-uat-22222222', botId: 'bot-uat-finance-fff', date: '2026-06-12', errorRate: 0.032, avgLatencyMs: 1240, failedSessions: 3 },
  { envId: 'env-uat-22222222', botId: 'bot-uat-procurement-ggg', date: '2026-06-12', errorRate: 0.045, avgLatencyMs: 1580, failedSessions: 2 },
  { envId: 'env-dev-11111111', botId: 'bot-dev-http-eee', date: '2026-06-12', errorRate: 0.091, avgLatencyMs: 2200, failedSessions: 2 },
];

// ---------------------------------------------------------------------------
// Convenience: full mock registry (all arrays in one object for easy spreading)
// ---------------------------------------------------------------------------
export const mockRegistry = {
  environments: mockEnvironments,
  agents: mockAgents,
  metrics: mockMetrics,
  alerts: mockAlerts,
  ingestionRuns: mockIngestionRuns,
  capacity: mockCapacity,
  complianceRules: mockComplianceRules,
  violations: mockViolations,
  maturityControls: mockMaturityControls,
  maturityResults: mockMaturityResults,
  gatePolicies: mockGatePolicies,
  gateDecisions: mockGateDecisions,
  conversationKpis: mockConversationKpis,
  healthMetrics: mockHealthMetrics,
} as const;
