/**
 * AgentLens Shared Type Contract
 *
 * This file defines the canonical types and interfaces used across the application.
 * All data structures passed between components, API routes, and the database layer
 * must conform to these definitions.
 */

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
 * Agent
 * Represents a Copilot Studio agent in an environment.
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
}

/**
 * AgentMetricDaily
 * Daily aggregated metrics for an agent (cost, usage, message count).
 */
export interface AgentMetricDaily {
  envId: string;
  botId: string;
  date: string;
  messageCount: number;
  sessionCount: number;
  estimatedCost: number;
  modelMeter: string | null;
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
