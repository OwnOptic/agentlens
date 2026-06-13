/**
 * recommendations.ts - Field-tested DLP recommendations per environment archetype.
 *
 * Sources: Power Platform admin guidance, CoE Starter Kit deprecation notes,
 * and real deployment lessons (default-env licensing trap, UAT parity rule,
 * governance-tooling HTTP allowlist).
 *
 * No server deps - pure data, safe to import on client.
 */

import type { DlpRecommendation } from '@/lib/dlp/types';

// ---------------------------------------------------------------------------
// Connector lists (shared across archetypes)
// ---------------------------------------------------------------------------

/** The Microsoft-core "business" tier - always safe to allow */
const MS_CORE_BUSINESS = [
  { name: 'Microsoft Dataverse', classification: 'business' as const, reason: 'Core Power Platform data store - required for most solutions.' },
  { name: 'SharePoint', classification: 'business' as const, reason: 'Standard document and knowledge management within M365.' },
  { name: 'Microsoft Teams', classification: 'business' as const, reason: 'Primary collaboration channel - required for Teams-integrated agents.' },
  { name: 'Office 365 Outlook', classification: 'business' as const, reason: 'Corporate email - standard for approval and notification flows.' },
  { name: 'OneDrive for Business', classification: 'business' as const, reason: 'Corporate file storage, governed by M365 compliance policies.' },
  { name: 'Microsoft Planner', classification: 'business' as const, reason: 'Task management within the M365 boundary.' },
  { name: 'Approvals', classification: 'business' as const, reason: 'Native Teams/Flow approval - keeps workflows within tenant.' },
];

/**
 * T-306: High-risk enterprise connectors - blocked in 'default' and 'production'
 * archetypes. These connectors carry significant data-exfiltration or compliance
 * risk when used without an explicit architectural review and DLP exception.
 * lastVerifiedDate applies to the recommendation record, not this sub-list.
 */
const HIGH_RISK_ENTERPRISE_BLOCKED = [
  {
    name: 'Salesforce',
    classification: 'blocked' as const,
    reason: 'CRM platform with broad data access (contacts, opportunities, accounts). Blocked by default; require explicit DLP exception with data-flow review and owner sign-off before enabling.',
  },
  {
    name: 'ServiceNow',
    classification: 'blocked' as const,
    reason: 'ITSM platform with access to incidents, CMDB, and service catalog. Blocked by default; data flowing to ServiceNow from agents must be scoped and approved to prevent accidental ticket injection or data leakage.',
  },
  {
    name: 'SAP ERP',
    classification: 'blocked' as const,
    reason: 'Core ERP system (finance, HR, procurement). Blocked by default; any integration must go through a dedicated middleware layer with field-level data mapping reviewed by the ERP team.',
  },
  {
    name: 'SQL Server',
    classification: 'blocked' as const,
    reason: 'Generic SQL Server connector can reach any on-premises or cloud database. Blocked by default; require a named data source review (schema, row-level security) before enabling for a specific agent.',
  },
];

/** Consumer / social connectors - blocked in all hardened archetypes */
const CONSUMER_SOCIAL_BLOCKED = [
  { name: 'WhatsApp', classification: 'blocked' as const, reason: 'Consumer messaging app - no enterprise data-residency guarantees.' },
  { name: 'Facebook', classification: 'blocked' as const, reason: 'Consumer social network - PII leak risk, no corporate data-handling agreement.' },
  { name: 'Twitter / X', classification: 'blocked' as const, reason: 'Public social network - corporate data must not flow here.' },
  { name: 'Instagram', classification: 'blocked' as const, reason: 'Consumer social media - same risk profile as Facebook.' },
  { name: 'Dropbox', classification: 'blocked' as const, reason: 'Consumer cloud storage - data can leave the corporate boundary undetected.' },
  { name: 'Box', classification: 'blocked' as const, reason: 'Consumer/SMB storage without tenant-enforced DLP controls.' },
  { name: 'Google Drive', classification: 'blocked' as const, reason: 'Google ecosystem - no M365 compliance policy coverage.' },
  { name: 'Gmail', classification: 'blocked' as const, reason: 'Personal email - corporate data exfiltration vector.' },
  { name: 'Google Calendar', classification: 'blocked' as const, reason: 'Google ecosystem - not covered by tenant conditional access.' },
  { name: 'FTP', classification: 'blocked' as const, reason: 'Unencrypted file transfer - high exfiltration risk.' },
  { name: 'SFTP', classification: 'blocked' as const, reason: 'Encrypted but opaque - no audit trail within Power Platform logs.' },
  { name: 'RSS', classification: 'blocked' as const, reason: 'Unauthenticated outbound HTTP feed - unnecessary in production flows.' },
  { name: 'Twilio', classification: 'blocked' as const, reason: 'Third-party SMS - corporate data in third-party telco pipeline.' },
  { name: 'Slack', classification: 'blocked' as const, reason: 'Competing collaboration platform - route through Teams instead.' },
  { name: 'Mailchimp', classification: 'blocked' as const, reason: 'Marketing SaaS - corporate contacts must not leave the M365 boundary.' },
  { name: 'OpenAI (consumer)', classification: 'blocked' as const, reason: 'Consumer OpenAI endpoint - use Azure OpenAI for enterprise data-residency and compliance.' },
  { name: 'HTTP', classification: 'blocked' as const, reason: 'Generic HTTP = unknown destination; blocks unapproved exfiltration paths.' },
  { name: 'HTTP Webhook', classification: 'blocked' as const, reason: 'Arbitrary outbound webhooks - any endpoint reachable; no governance.' },
  { name: 'When an HTTP request is received', classification: 'blocked' as const, reason: 'Inbound anonymous HTTP trigger - creates unauthenticated public endpoints.' },
  { name: 'Direct Line (Bot Framework)', classification: 'blocked' as const, reason: 'Unauthenticated channel - use Teams/Direct Line Speech with Entra ID auth.' },
];

// ---------------------------------------------------------------------------
// DLP_RECOMMENDATIONS
// ---------------------------------------------------------------------------

export const DLP_RECOMMENDATIONS: DlpRecommendation[] = [
  // -------------------------------------------------------------------------
  // DEFAULT - lock down hard
  // -------------------------------------------------------------------------
  {
    archetype: 'default',
    title: 'Default Environment - Hard Lockdown',
    summary:
      'The maker landing zone: every licensed user in the tenant can create here. Lock down hard with Microsoft-core-only Business connectors and block all consumer/social/HTTP. Violations surface at runtime as AppForbidden, not at install.',
    strategy:
      'Strict allowlist - Business tier: Microsoft core only. All consumer, social, generic HTTP, unauthenticated channels, and high-risk enterprise connectors: Blocked. Pair with the tenant disableShareWithEveryone lever and consider Managed Environment to force per-environment routing.',
    connectors: [
      ...MS_CORE_BUSINESS,
      ...CONSUMER_SOCIAL_BLOCKED,
      ...HIGH_RISK_ENTERPRISE_BLOCKED,
    ],
    lastVerifiedDate: '2026-06-13',
    connectorCatalogVersion: '2026-06-13',
    gotchas: [
      {
        title: 'DLP violations surface at RUNTIME, not at install',
        detail:
          'Apps import and save fine even when connectors violate the policy. The flow / app fails with AppForbidden the first time it tries to connect. This means makers can unknowingly build broken apps. Enforce DLP early and communicate it to makers before they build, not after.',
      },
      {
        title: 'Making default a Managed Environment can trigger per-user licensing for every free-tier maker',
        detail:
          'Real case: ~2,000 makers x ~30 EUR/month = ~360k EUR/year in forced Premium licenses. DLP-first (no Managed Env) is the cheap governance lever. Add Managed Env only when you are ready to license the entire maker population or when you have already reduced default-env population via environment routing.',
      },
      {
        title: 'Pair with disableShareWithEveryone at tenant level',
        detail:
          'The tenant setting disableShareWithEveryone=true (Power Platform admin center > Settings > Environment settings) prevents canvas apps from being shared with "Everyone in the org" from the default env. It is free, requires no Managed Env, and significantly limits blast radius of maker mistakes. Always enable this alongside the strict DLP.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // DEV - permissive with guardrails
  // -------------------------------------------------------------------------
  {
    archetype: 'dev',
    title: 'Development Environment - Permissive + HTTP Under Review',
    summary:
      'Experimentation zone for makers. HTTP is allowed but should be reviewed before promotion to UAT. Consumer and social connectors are still blocked. Use environment routing to ensure new makers land here, not in default.',
    strategy:
      'Permissive Business tier with HTTP allowed for internal/first-party APIs. Consumer, social, and unauthenticated channels remain Blocked. Requires environment routing so new makers bypass the default env entirely.',
    connectors: [
      ...MS_CORE_BUSINESS,
      { name: 'HTTP', classification: 'business' as const, reason: 'Allowed in dev for prototyping against internal APIs - must be reviewed before promotion.' },
      { name: 'HTTP Webhook', classification: 'non_business' as const, reason: 'Non-Business in dev (can exist but not mix with Business data) - blocked at production boundary.' },
      { name: 'Azure Service Bus', classification: 'business' as const, reason: 'Event-driven integrations common in dev/test scenarios.' },
      { name: 'Azure Blob Storage', classification: 'business' as const, reason: 'Dev storage pattern for document processing pipelines.' },
      { name: 'Azure Key Vault', classification: 'business' as const, reason: 'Secret management - required for secure dev patterns.' },
      { name: 'WhatsApp', classification: 'blocked' as const, reason: 'Consumer messaging - blocked even in dev; use Teams for notification prototyping.' },
      { name: 'Facebook', classification: 'blocked' as const, reason: 'Consumer social - no business justification even in dev.' },
      { name: 'Twitter / X', classification: 'blocked' as const, reason: 'Public social - blocked at all tiers.' },
      { name: 'Dropbox', classification: 'blocked' as const, reason: 'Consumer storage - use Azure Blob or SharePoint.' },
      { name: 'Box', classification: 'blocked' as const, reason: 'Consumer storage - not in the approved dev toolchain.' },
      { name: 'Google Drive', classification: 'blocked' as const, reason: 'Google ecosystem - blocked at all tiers.' },
      { name: 'Gmail', classification: 'blocked' as const, reason: 'Personal email - blocked at all tiers.' },
      { name: 'OpenAI (consumer)', classification: 'blocked' as const, reason: 'Use Azure OpenAI - same model, enterprise residency + compliance.' },
      { name: 'Slack', classification: 'blocked' as const, reason: 'Use Teams connector for all chat prototyping.' },
      { name: 'Direct Line (Bot Framework)', classification: 'blocked' as const, reason: 'Unauthenticated channel - use Teams or Direct Line Speech with Entra ID.' },
    ],
    gotchas: [
      {
        title: 'Environment routing must be configured or makers land in default',
        detail:
          'Without environment routing (Power Platform admin center > Environments > Default environment routing), new makers are dropped into the default env, not this dev env. The dev permissive policy only helps if makers actually use the dev env. Set routing to this env for your maker security group.',
      },
      {
        title: 'HTTP-allowed in dev is a promotion gate, not a free pass',
        detail:
          'Any flow using the HTTP connector in dev must go through a connector approval review before it is promoted to UAT or production. Document the approval process in your ALM runbook so the gate is not silently skipped during handover.',
      },
      {
        title: 'Dev policy drift is a slow-burn risk',
        detail:
          'Makers get used to dev permissions and then are surprised when flows break after promotion. Run a weekly DLP diff between dev and production so drift is visible before it becomes a blocked release.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // SANDBOX / UAT - mirror production exactly
  // -------------------------------------------------------------------------
  {
    archetype: 'sandbox_uat',
    title: 'Sandbox / UAT - Mirror Production Policy',
    summary:
      'UAT exists to validate that what passes testing also works in production. The DLP policy MUST be an exact mirror of the production policy. Any drift between UAT and production means releases are not actually tested under real conditions.',
    strategy:
      'Policy parity with production - identical connector classifications. No exceptions. Drift = untestable releases. Apply the same policy object or use a shared "AllEnvironments" policy scoped to include both.',
    connectors: [
      ...MS_CORE_BUSINESS,
      { name: 'HTTP with Microsoft Entra ID (preauthorized)', classification: 'business' as const, reason: 'Mirrors production - allowed only for governed first-party admin APIs.' },
      ...CONSUMER_SOCIAL_BLOCKED,
      { name: 'Azure Service Bus', classification: 'business' as const, reason: 'Mirror of production - if production allows it, UAT must allow it identically.' },
      { name: 'Azure Blob Storage', classification: 'business' as const, reason: 'Mirror of production file storage connectors.' },
      { name: 'Azure Key Vault', classification: 'business' as const, reason: 'Mirror of production secret management.' },
    ],
    gotchas: [
      {
        title: 'Parity is the only point of UAT DLP',
        detail:
          'If UAT has looser DLP than production (e.g. HTTP allowed in UAT but blocked in prod), flows that pass UAT will fail in production. This is the most common source of "it worked in test" failures. Apply the same policy object to both envs, or use a policy scoped to AllEnvironments that covers both.',
      },
      {
        title: 'Policy change process must apply to BOTH envs simultaneously',
        detail:
          'When you add an exception to production (e.g. approving a new connector), apply it to UAT at the same time. Treat the UAT policy as a managed copy, not a separate artifact. Script this in your ALM pipeline.',
      },
      {
        title: 'UAT data ≠ production data, but DLP policy must be identical',
        detail:
          'Using anonymized/synthetic data in UAT is correct practice. The DLP policy being identical ensures that the connector permission model is tested against real constraints. These are two separate concerns - do not relax DLP just because the data is synthetic.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PRODUCTION - strict explicit allowlist
  // -------------------------------------------------------------------------
  {
    archetype: 'production',
    title: 'Production Environment - Strict Explicit Allowlist',
    summary:
      'Every connector exception must be documented and approved. HTTP is blocked by default but HTTP with Microsoft Entra ID (preauthorized) is allowed for governed first-party admin APIs only - blocking it breaks governance tooling (Copilot Studio Kit and PowerShield both call api.bap.microsoft.com and api.flow.microsoft.com).',
    strategy:
      'Strict allowlist - Business: Microsoft core + HTTP with Entra ID (scoped to first-party admin APIs). All other HTTP, consumer, social, and high-risk enterprise connectors: Blocked. Every exception is documented in the policy changelog with business owner and ticket reference.',
    connectors: [
      ...MS_CORE_BUSINESS,
      {
        name: 'HTTP with Microsoft Entra ID (preauthorized)',
        classification: 'business' as const,
        reason:
          'Required for governance tooling: Copilot Studio Kit and PowerShield call api.bap.microsoft.com, api.flow.microsoft.com, and licensing.powerplatform.microsoft.com. Blocking this breaks admin automation. Scope to these three endpoints via connector configuration.',
      },
      { name: 'Azure Service Bus', classification: 'business' as const, reason: 'Event-driven integration - approved for production when scoped to corporate Azure subscription.' },
      { name: 'Azure Blob Storage', classification: 'business' as const, reason: 'Document processing pipelines - approved with data-residency verified in corporate subscription.' },
      { name: 'Azure Key Vault', classification: 'business' as const, reason: 'Secret management - mandatory for any production flow handling credentials.' },
      ...CONSUMER_SOCIAL_BLOCKED,
      ...HIGH_RISK_ENTERPRISE_BLOCKED,
      { name: 'HTTP', classification: 'blocked' as const, reason: 'Generic HTTP is blocked in production; use HTTP with Entra ID for first-party APIs, or a dedicated connector.' },
      { name: 'HTTP Webhook', classification: 'blocked' as const, reason: 'Arbitrary outbound webhooks are blocked in production - all integrations must use approved connectors.' },
    ],
    lastVerifiedDate: '2026-06-13',
    connectorCatalogVersion: '2026-06-13',
    gotchas: [
      {
        title: 'Blocking HTTP with Entra ID breaks governance tooling',
        detail:
          'Copilot Studio Kit (AdminHub, PowerShield) and the CoE Starter Kit (deprecated but still in use at many tenants) rely on HTTP with Microsoft Entra ID to call api.bap.microsoft.com, api.flow.microsoft.com, and licensing.powerplatform.microsoft.com. If you block this connector in the governance env, your admin tooling stops working. Allow it in the governance env and document the exception explicitly.',
      },
      {
        title: 'Every exception must have a business owner and ticket reference',
        detail:
          'Production DLP exceptions that are not documented become invisible technical debt. Maintain a policy changelog (SharePoint list or JSON in your repo) with: connector name, justification, approving owner, ticket reference, and review-by date. Audit quarterly.',
      },
      {
        title: 'CoE Starter Kit is deprecated - do not add new connectors for it',
        detail:
          'Microsoft announced CoE Kit EoL on 2026-05-08. Pivot to Managed Environments + Copilot Studio Kit + Purview. Do not open new production DLP exceptions for CoE Kit connectors - route the requirement through the replacement tooling instead.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // TRIAL - time-boxed permissive
  // -------------------------------------------------------------------------
  {
    archetype: 'trial',
    title: 'Trial Environment - Time-Boxed Permissive',
    summary:
      'Evaluation and proof-of-concept zone. Permissive to enable rapid exploration, but must be time-boxed. Orphaned trial environments become shadow IT - set an expiry reminder at creation time and enforce decommission.',
    strategy:
      'Permissive - most connectors allowed to reduce friction during evaluation. Consumer social blocked. Set an environment expiry (90 days max) and assign an owner. Never let trial envs outlive their purpose.',
    connectors: [
      ...MS_CORE_BUSINESS,
      { name: 'HTTP', classification: 'business' as const, reason: 'Allowed in trial for rapid prototyping - not for production use.' },
      { name: 'HTTP Webhook', classification: 'business' as const, reason: 'Allowed in trial to test webhook integrations with external systems.' },
      { name: 'Azure Service Bus', classification: 'business' as const, reason: 'Common trial integration pattern for event-driven architectures.' },
      { name: 'Azure Blob Storage', classification: 'business' as const, reason: 'File processing trials frequently need blob storage.' },
      { name: 'Azure Key Vault', classification: 'business' as const, reason: 'Trial patterns that require secret management.' },
      { name: 'Salesforce', classification: 'non_business' as const, reason: 'Non-Business in trial (may coexist with non-corporate data); upgrade to Business if needed at production.' },
      { name: 'ServiceNow', classification: 'non_business' as const, reason: 'Non-Business tier during trial evaluation; promote to Business if taken to production.' },
      { name: 'WhatsApp', classification: 'blocked' as const, reason: 'Consumer messaging - blocked even in trial.' },
      { name: 'Facebook', classification: 'blocked' as const, reason: 'Consumer social - blocked at all tiers.' },
      { name: 'Twitter / X', classification: 'blocked' as const, reason: 'Public social - blocked at all tiers.' },
      { name: 'Gmail', classification: 'blocked' as const, reason: 'Personal email - blocked even in trial to prevent corporate data leakage via personal accounts.' },
      { name: 'Dropbox', classification: 'blocked' as const, reason: 'Consumer storage - blocked at all tiers.' },
      { name: 'OpenAI (consumer)', classification: 'blocked' as const, reason: 'Use Azure OpenAI even in trial - residency and compliance matter from day one.' },
    ],
    gotchas: [
      {
        title: 'Set an expiry reminder at creation time - not later',
        detail:
          'Trial environments with no owner and no expiry date become permanent. Assign an owner, set a calendar reminder 90 days out, and add the env to your governance inventory (CoE Kit Env table or Managed Env expiry). Orphaned trial envs are a top source of shadow IT and DLP policy gaps.',
      },
      {
        title: 'Never promote trial flows directly to production',
        detail:
          'Trial flows were built against permissive DLP. They will almost certainly use connectors (HTTP, consumer webhooks) that are blocked in production. Always re-validate against the production DLP policy before promotion. Build a checklist into your ALM runbook.',
      },
      {
        title: 'Trial licenses expire silently',
        detail:
          'Power Platform trial licenses (90-day Developer Plan, Partner-Led Trial) expire without warning. Flows and apps stop running. Add license expiry to your governance calendar alongside the env expiry.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // GOVERNANCE - admin tooling env
  // -------------------------------------------------------------------------
  {
    archetype: 'governance',
    title: 'Governance Environment - Admin Tooling Zone',
    summary:
      'Dedicated environment for Copilot Studio Kit, CoE replacement tooling, PowerShield, and admin automation. The DLP must allow what it governs: HTTP with Microsoft Entra ID scoped to the admin APIs that governance tools call.',
    strategy:
      'Business: Microsoft core + Power Platform for Admins + Dataverse + HTTP with Microsoft Entra ID preauthorized, scoped to api.bap.microsoft.com, api.flow.microsoft.com, and licensing.powerplatform.microsoft.com. This env reads the admin APIs - its DLP must permit the very calls that governance enforces on other envs.',
    connectors: [
      ...MS_CORE_BUSINESS,
      {
        name: 'HTTP with Microsoft Entra ID (preauthorized)',
        classification: 'business' as const,
        reason:
          'Governance tooling (Copilot Studio Kit AdminHub, PowerShield, CoE Kit replacement flows) calls api.bap.microsoft.com, api.flow.microsoft.com, and licensing.powerplatform.microsoft.com. This connector must be Business here. Scope to these three hosts only.',
      },
      {
        name: 'Power Platform for Admins',
        classification: 'business' as const,
        reason:
          'Native admin connector for environment and DLP policy management - core to Copilot Studio Kit and CoE-replacement tooling.',
      },
      {
        name: 'Power Apps for Admins',
        classification: 'business' as const,
        reason:
          'Admin operations on canvas apps - required for AgentLens-style inventory and governance pipelines.',
      },
      {
        name: 'Power Automate Management',
        classification: 'business' as const,
        reason:
          'Flow lifecycle management from governance tooling - required for ALM and audit automation.',
      },
      {
        name: 'Office 365 Users',
        classification: 'business' as const,
        reason:
          'Resolves display names and managers for maker profiles in governance dashboards.',
      },
      {
        name: 'Azure Monitor Logs',
        classification: 'business' as const,
        reason:
          'Pulls agent telemetry and flow run logs for compliance and KPI dashboards.',
      },
      ...CONSUMER_SOCIAL_BLOCKED,
      { name: 'HTTP', classification: 'blocked' as const, reason: 'Generic HTTP is blocked even in the governance env; only HTTP with Entra ID (preauthorized) is permitted.' },
      { name: 'HTTP Webhook', classification: 'blocked' as const, reason: 'Arbitrary webhooks have no place in the governance env.' },
    ],
    gotchas: [
      {
        title: 'The governance env DLP must allow what governance tools call',
        detail:
          'Copilot Studio Kit, PowerShield, and any replacement CoE flows all call Microsoft admin APIs via HTTP with Entra ID. If you apply the same strict DLP as production without the Entra ID HTTP exception, every admin flow breaks. This is a real field gotcha - the governance env needs its own explicit DLP policy.',
      },
      {
        title: 'Restrict access to this env to admin security groups only',
        detail:
          'The governance env has elevated connector permissions (Power Platform for Admins, HTTP to admin APIs). Limit who can create flows here. Use security groups in the env access settings and apply Managed Environment to enforce per-env RBAC.',
      },
      {
        title: 'CoE Starter Kit is deprecated - plan migration to CS Kit',
        detail:
          'If your governance env currently runs the CoE Starter Kit, start planning migration to the Copilot Studio Kit + Managed Environments. CoE Kit EoL was announced 2026-05-08. New admin tooling investments should target the Copilot Studio Kit connectors and admin API flows instead.',
      },
    ],
  },
];
