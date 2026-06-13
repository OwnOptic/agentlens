/**
 * types.ts - DLP Advisor type contract
 *
 * Shared between the API route, the recommendation engine, and the
 * /dlp-advisor UI page. All types are plain data - no server deps here.
 */

// ---------------------------------------------------------------------------
// Environment archetypes
// ---------------------------------------------------------------------------

/**
 * The five canonical Power Platform environment archetypes recognised by the
 * DLP Advisor, plus the Microsoft "default" environment.
 */
export type EnvArchetype =
  | 'default'
  | 'dev'
  | 'sandbox_uat'
  | 'production'
  | 'trial'
  | 'governance';

// ---------------------------------------------------------------------------
// Connector recommendations
// ---------------------------------------------------------------------------

export interface ConnectorRec {
  /** Display name of the connector, e.g. "SharePoint" */
  name: string;

  /** Recommended DLP bucket for this connector in this archetype */
  classification: 'business' | 'non_business' | 'blocked';

  /** One-line justification */
  reason: string;
}

// ---------------------------------------------------------------------------
// DLP recommendation (generated per archetype)
// ---------------------------------------------------------------------------

export interface DlpRecommendation {
  archetype: EnvArchetype;

  /** Short title, e.g. "Production Environment - Strict DLP" */
  title: string;

  /** 1-2 sentence summary shown in the card header */
  summary: string;

  /**
   * The recommended overall strategy, e.g.
   * "Allowlist - only Business connectors permitted; all others blocked."
   */
  strategy: string;

  /** Ordered list of connector-level recommendations */
  connectors: ConnectorRec[];

  /** Known gotchas or CoE Starter Kit deprecation notes */
  gotchas: {
    title: string;
    detail: string;
  }[];
}

// ---------------------------------------------------------------------------
// Tenant DLP policy (read from Power Platform admin API)
// ---------------------------------------------------------------------------

export interface TenantDlpPolicy {
  /** Policy GUID from the admin API */
  id: string;

  displayName: string;

  /** "AllEnvironments" | "ExceptEnvironments" | "OnlyEnvironments" */
  scope: string;

  /** Number of environments in scope (may be -1 when scope = AllEnvironments) */
  envCount: number;

  /** Counts by bucket */
  blockedCount: number;
  businessCount: number;
  nonBusinessCount: number;
}

// ---------------------------------------------------------------------------
// DLP gap (detected gap between recommended and actual policy)
// ---------------------------------------------------------------------------

export interface DlpGap {
  severity: 'critical' | 'warning' | 'info';

  /** Environment display name where the gap was detected */
  envName: string;

  /** Human-readable description of the gap */
  message: string;
}
