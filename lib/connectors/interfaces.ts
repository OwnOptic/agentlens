/**
 * AgentLens Connector Interface Contract
 *
 * Declares the function signatures that all feature agents and pages build against.
 * Concrete implementations live alongside each connector file; these interfaces
 * are the stable contract - never import concrete implementations directly in
 * feature code, always depend on these types.
 */

import type {
  Agent,
  Environment,
  AgentMetricDaily,
  Capacity,
  HealthMetric,
  ConversationKpi,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// argInventory connector
// Wraps the Power Platform Admin API / Dataverse Web API agent inventory.
// ---------------------------------------------------------------------------
export interface ArgInventoryConnector {
  /** List all Copilot Studio agents visible to the service principal across all envs */
  listAgents(): Promise<Agent[]>;
  /** List all Power Platform environments accessible to the service principal */
  listEnvironments(): Promise<Environment[]>;
}

// ---------------------------------------------------------------------------
// cost connector
// Wraps the Power Platform Billing / Consumption API.
// ---------------------------------------------------------------------------
export interface CostConnector {
  /**
   * Fetch daily credit consumption metrics for all agents in the org.
   * @param orgUrl  The Dataverse org URL, e.g. https://org.crm.dynamics.com
   */
  getDailyMetrics(orgUrl: string): Promise<AgentMetricDaily[]>;
  /**
   * Fetch current credit capacity and overage state per environment.
   */
  getCapacity(): Promise<Capacity[]>;
}

// ---------------------------------------------------------------------------
// graph connector
// Wraps Microsoft Graph API for identity resolution.
// ---------------------------------------------------------------------------
export interface GraphConnector {
  /**
   * Resolve display names and email addresses for a list of Entra object IDs.
   * Returns a Map keyed by object ID; missing IDs are omitted (not null entries).
   * @param ids  Array of Entra user/service-principal object IDs
   */
  resolveOwners(ids: string[]): Promise<Map<string, { name: string; email: string }>>;
}

// ---------------------------------------------------------------------------
// dataverseDeepScan connector
// Performs a deep inspection of a single agent's Dataverse configuration to
// detect risky patterns, authentication mode, enabled channels, connectors, etc.
// ---------------------------------------------------------------------------
export interface DataverseDeepScanConnector {
  /**
   * Scan a specific agent's Dataverse record for governance signals.
   * Returns an untyped payload intentionally - the caller is responsible for
   * mapping to ComplianceViolation / RiskyPattern as needed.
   * @param orgUrl  The Dataverse org URL
   * @param botId   The bot component ID (GUID)
   */
  scan(orgUrl: string, botId: string): Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// appInsights connector
// Wraps Application Insights / Azure Monitor query API.
// ---------------------------------------------------------------------------
export interface AppInsightsConnector {
  /**
   * Fetch daily operational health metrics (error rate, latency, failed sessions)
   * for all bots that report to the configured App Insights workspace.
   */
  getHealth(): Promise<HealthMetric[]>;
}

// ---------------------------------------------------------------------------
// kpis connector
// Wraps Copilot Studio native analytics aggregation endpoint.
// Returns aggregate-only data; no conversation content is ever returned.
// ---------------------------------------------------------------------------
export interface KpisConnector {
  /**
   * Fetch daily aggregate conversation KPIs (sessions, deflection, escalation)
   * for all bots across all connected environments.
   * NOTE: aggregate only - no message content, no user identifiers.
   */
  getAggregates(): Promise<ConversationKpi[]>;
}

// ---------------------------------------------------------------------------
// Connector registry type
// Feature agents receive a ConnectorRegistry rather than individual connectors
// so the concrete implementation can be swapped (live vs mock) at the call site.
// ---------------------------------------------------------------------------
export interface ConnectorRegistry {
  argInventory: ArgInventoryConnector;
  cost: CostConnector;
  graph: GraphConnector;
  dataverseDeepScan: DataverseDeepScanConnector;
  appInsights: AppInsightsConnector;
  kpis: KpisConnector;
}
