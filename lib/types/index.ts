/**
 * AgentLens Shared Type Contract
 *
 * v1 types are preserved unchanged. v2 additions are clearly marked.
 * All data structures passed between components, API routes, and the database layer
 * must conform to these definitions.
 */

// ---------------------------------------------------------------------------
// v1 Types (unchanged)
// ---------------------------------------------------------------------------

/**
 * Environment
 * Represents a Power Platform environment (tenant, region).
 */
export interface Environment {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  region: string;
  orgUrl: string;
}

/**
 * AgentKind
 * Type of Copilot agent.
 *
 * NOTE: M365 declarative copilots and Agent 365 agents are OUT OF SCOPE for v1.
 * This version supports Copilot Studio agents only.
 */
export type AgentKind = 'copilot_studio';

/**
 * LifecycleStage (v2)
 * Where in its operational lifecycle an agent currently sits.
 */
export type LifecycleStage = 'poc' | 'pilot' | 'prod';

/**
 * Agent
 * Represents a Copilot Studio agent in an environment.
 * v2 adds: lifecycle
 */
export interface Agent {
  envId: string;
  botId: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  state: string;
  createdOn: string;
  modifiedOn: string;
  lastActivity: string | null;
  kind: AgentKind;
  /** v2: operational lifecycle stage */
  lifecycle?: LifecycleStage;
}

/**
 * CreditBreakdown (v2)
 * Per-feature credit consumption breakdown for an agent on a given day.
 * Maps directly to the Copilot Studio consumption meters.
 */
export interface CreditBreakdown {
  generativeAnswers: number;
  agentActions: number;
  agentFlows: number;
  textTools: number;
}

/**
 * AgentMetricDaily
 * Daily aggregated metrics for an agent (cost, usage, message count).
 * v2 adds: featureBreakdown, projectedMonthly
 */
export interface AgentMetricDaily {
  envId: string;
  botId: string;
  date: string;
  messageCount: number;
  sessionCount: number;
  estimatedCost: number;
  modelMeter: string | null;
  /** v2: per-feature credit breakdown */
  featureBreakdown?: CreditBreakdown;
  /** v2: projected monthly cost based on current daily run rate */
  projectedMonthly?: number;
}

/**
 * AlertType
 * Categories of alerts that can be raised by the governance system.
 */
export type AlertType =
  | 'budget_breach'
  | 'volume_spike'
  | 'new_default_env_agent'
  | 'model_meter_mismatch'
  | 'orphan_idle';

/**
 * AlertSeverity
 * Severity levels for alerts.
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert
 * Represents a governance alert raised for an agent or environment.
 */
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  envId: string;
  botId: string | null;
  message: string;
  state: 'open' | 'ack' | 'resolved';
  createdAt: string;
}

/**
 * MigrationStatus
 * Status of an agent or environment in a migration workflow.
 */
export type MigrationStatus = 'to_migrate' | 'notified' | 'moved';

/**
 * IngestionRun
 * Represents a single run of the agent/environment ingestion pipeline.
 */
export interface IngestionRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  envCount: number;
  agentCount: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// v2 Types
// ---------------------------------------------------------------------------

/**
 * Capacity (v2)
 * Credit capacity and consumption state for a Power Platform environment.
 */
export interface Capacity {
  envId: string;
  creditLimit: number;
  creditUsed: number;
  /** Percentage used: creditUsed / creditLimit * 100 */
  pct: number;
  /** True when creditUsed >= creditLimit */
  overage: boolean;
}

/**
 * ComplianceRule (v2)
 * A declarative governance rule evaluated against agents.
 * expression is a CEL/OPA-style string evaluated by the rule engine.
 */
export interface ComplianceRule {
  id: string;
  name: string;
  type: 'authentication' | 'data_loss' | 'knowledge_source' | 'channel' | 'connector';
  severity: 'critical' | 'warning' | 'info';
  /** CEL / simple DSL expression evaluated against agent properties */
  expression: string;
  enabled: boolean;
}

/**
 * ComplianceViolation (v2)
 * A recorded instance where an agent broke a ComplianceRule.
 * agentRef is "{envId}/{botId}".
 */
export interface ComplianceViolation {
  id: string;
  /** "{envId}/{botId}" */
  agentRef: string;
  ruleId: string;
  severity: 'critical' | 'warning' | 'info';
  state: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
  detectedAt: string;
}

/**
 * RiskyPattern (v2)
 * Enumeration of agent configuration patterns that introduce governance risk.
 */
export type RiskyPattern =
  | 'autonomous'
  | 'maker_credential'
  | 'http_action'
  | 'anonymous_auth'
  | 'computer_use'
  | 'shared_entire_tenant'
  | 'risky_connector';

/**
 * MaturityControl (v2)
 * A single control in the agent governance maturity model.
 * autoEvaluable = true means the score can be derived from telemetry without human input.
 */
export interface MaturityControl {
  id: string;
  pillar: 'security' | 'management' | 'reporting';
  name: string;
  autoEvaluable: boolean;
}

/**
 * MaturityResult (v2)
 * The evaluated score for a MaturityControl in a given assessment run.
 * capped = true means score was inferred from telemetry and cannot be
 * asserted as fully validated (residualBurden explains what remains manual).
 */
export interface MaturityResult {
  controlId: string;
  score: 0 | 1 | 2 | 3 | 4;
  /** True when score is telemetry-derived and cannot be fully verified automatically */
  capped: boolean;
  residualBurden: string;
}

/**
 * GatePolicy (v2)
 * A release gate policy expressed as YAML (OPA-compatible Rego or custom DSL).
 * Controls which agents may be promoted between lifecycle stages.
 */
export interface GatePolicy {
  id: string;
  name: string;
  /** YAML-encoded policy rules */
  yaml: string;
  enabled: boolean;
}

/**
 * GateDecision (v2)
 * A recorded gate evaluation result for an agent promotion attempt.
 * agentRef is "{envId}/{botId}".
 * signature is a HMAC-SHA256 hex of "{id}:{agentRef}:{verdict}:{signedAt}" using the
 * service signing key - allows tamper detection in audit trails.
 */
export interface GateDecision {
  id: string;
  /** "{envId}/{botId}" */
  agentRef: string;
  verdict: 'pass' | 'block';
  reasons: string[];
  signedAt: string;
  /** HMAC-SHA256 hex of the decision payload */
  signature: string;
  revoked: boolean;
}

/**
 * ConversationKpi (v2)
 * Aggregate conversation health KPIs for a bot on a given day.
 * IMPORTANT: contains NO conversation content - aggregate metrics only.
 * Sourced from Copilot Studio native analytics / App Insights aggregation queries.
 */
export interface ConversationKpi {
  envId: string;
  botId: string;
  date: string;
  sessions: number;
  /** 0-1 ratio of sessions resolved without human escalation */
  deflectionRate: number;
  /** 0-1 ratio of sessions that escalated to a human agent */
  escalationRate: number;
}

/**
 * HealthMetric (v2)
 * Operational health measurements for a bot on a given day.
 * Sourced from App Insights query results.
 */
export interface HealthMetric {
  envId: string;
  botId: string;
  date: string;
  errorRate: number;
  avgLatencyMs: number;
  failedSessions: number;
}
