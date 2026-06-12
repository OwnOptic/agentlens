# AgentLens v2 Architecture

Deep dive into the system design, data flow, and connectors that power AgentLens.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AgentLens (Next.js App)                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Client Layer (React + TailwindCSS)                                  │  │
│  │  • Dashboard: Overview, Inventory, Sprawl, Cost, Alerts              │  │
│  │  • Governance UI: Compliance, Risky Patterns, Maturity, Gates        │  │
│  │  • Tools: Lifecycle, Maker View, Ask (AI), Settings                  │  │
│  │  • Real-time updates via WebSocket (optional)                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                 │                                           │
│  ┌──────────────────────────────┴───────────────────────────────────────┐  │
│  │  API Routes (Next.js /api/*)                                         │  │
│  │  • /api/agents         → ConnectorRegistry.argInventory.listAgents   │  │
│  │  • /api/metrics        → ConnectorRegistry.cost.getDailyMetrics      │  │
│  │  • /api/capacity       → ConnectorRegistry.cost.getCapacity          │  │
│  │  • /api/compliance     → rules + violation engine                    │  │
│  │  • /api/maturity       → controls + scoring                          │  │
│  │  • /api/gates          → policy evaluation + decisions               │  │
│  │  • /api/kpis           → ConnectorRegistry.kpis.getAggregates        │  │
│  │  • /api/health         → ConnectorRegistry.appInsights.getHealth     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
        ┌─────────────────┐ ┌──────────┐ ┌──────────────────┐
        │ Azure Resource  │ │ PPAC     │ │ Dataverse        │
        │ Graph (ARG)     │ │ Licensing│ │ (on-demand deep  │
        │                 │ │ API      │ │ scans only)      │
        │ PowerPlatform   │ │ (+ CSV   │ │                  │
        │ Resources Query │ │ fallback)│ │ • Agent detail   │
        │                 │ │          │ │ • Channels       │
        │ • Agents        │ │ Per-agent│ │ • Connectors     │
        │ • Owners        │ │ daily    │ │ • Auth config    │
        │ • Environments  │ │ credits  │ │ • Skills         │
        │ • Sharing       │ │ • Feature│ │                  │
        │                 │ │   breakdown         │
        └─────────────────┘ │ • Feature breakdown│ │
                            │                  │
                            └──────────────────┘

                    ┌──────────────────────────────┐
                    │ App Insights / CS Analytics  │
                    │ • Error rate, latency        │
                    │ • Session health             │
                    │ • Deflection / escalation    │
                    └──────────────────────────────┘

                    ┌──────────────────────────────┐
                    │ Supabase (Optional)          │
                    │ • Metrics time-series        │
                    │ • Alert audit log            │
                    │ • Settings (tenant-specific) │
                    └──────────────────────────────┘
```

---

## Backbone: Azure Resource Graph (ARG)

**Primary inventory source.** Replaces v1's per-environment Dataverse polling.

### Why ARG?

- **Single query** returns all agents across the entire tenant in <1s
- **Owner resolution** included (no separate Graph calls needed for most agents)
- **Sharing metadata** (scope: tenant, environment, teams channel)
- **No Dataverse import** into client environments required
- **Public Microsoft endpoint**, no custom connector provisioning

### Query Pattern

```kql
resources
| where type == 'microsoft.copilotstudio/agents'
| project
    botId = properties.botId,
    name = name,
    environment = tolower(split(id, '/')[4]),
    ownerPrincipalId = properties.ownerPrincipalId,
    createdOn = properties.createdOn,
    modifiedOn = properties.modifiedOn,
    state = properties.state,
    properties = properties
| join kind=leftouter (
    resources
    | where type == 'microsoft.copilotstudio/bots'
    | project
        botId = properties.botId,
        lastActivity = properties.lastActivity,
        channels = properties.channels,
        modelMeter = properties.modelMeter
  ) on botId
```

### Data Returned

- `botId`, `name`, `state`, `createdOn`, `modifiedOn`
- `ownerPrincipalId` (resolved to email/name via Graph)
- `lastActivity`, `channels`, `modelMeter`
- Environment path (enables grouping by environment)

---

## Connectors: The Data Layer

AgentLens is built on a **connector pattern** — all data access goes through typed interfaces in `lib/connectors/interfaces.ts`. Each page/feature receives a `ConnectorRegistry` with 6 pluggable connectors:

### 1. ArgInventory Connector

**Interface:**
```ts
interface ArgInventoryConnector {
  listAgents(): Promise<Agent[]>;
  listEnvironments(): Promise<Environment[]>;
}
```

**Implementation:**
- Calls Azure Resource Graph with the above KQL query
- Returns all agents + environments in the tenant
- Caches for 5 minutes (configurable)

**Where used:**
- Inventory page
- Sprawl detection (agents in default environment)
- Agent detail pages

---

### 2. Cost Connector

**Interface:**
```ts
interface CostConnector {
  getDailyMetrics(orgUrl: string): Promise<AgentMetricDaily[]>;
  getCapacity(): Promise<Capacity[]>;
}
```

**Implementation:**
- **getDailyMetrics()**: Calls PPAC Licensing API for per-agent daily credits
  - Returns: `messageCount`, `sessionCount`, `estimatedCost`
  - **Feature breakdown** (v2 new): `generativeAnswers`, `agentActions`, `agentFlows`, `textTools`
  - **Projected monthly**: extrapolates current daily run rate to 30 days
  - **Fallback**: CSV export from Copilot Studio analytics if API is unavailable
- **getCapacity()**: Queries Power Platform capacity dashboard
  - Returns: `creditLimit`, `creditUsed`, `pct`, `overage` per environment

**Where used:**
- Cost page (daily trends, per-agent cost)
- Capacity page (overage detection)
- Alerts (budget breach detection)

---

### 3. Graph Connector

**Interface:**
```ts
interface GraphConnector {
  resolveOwners(ids: string[]): Promise<Map<string, { name: string; email: string }>>;
}
```

**Implementation:**
- Batches Microsoft Graph calls to resolve Entra user/service principal display names and emails
- Returns a map keyed by object ID
- Missing IDs are omitted (no null entries)

**Where used:**
- Inventory page (agent owner name/email)
- Compliance violations (assigned to person/team)
- Reporting (stakeholder identification)

---

### 4. DataverseDeepScan Connector

**Interface:**
```ts
interface DataverseDeepScanConnector {
  scan(orgUrl: string, botId: string): Promise<Record<string, unknown>>;
}
```

**Implementation:**
- **Only called on-demand** (not in the ingestion loop)
- Queries Dataverse tables directly for detailed agent configuration
- Returns untyped payload; caller maps to compliance/risky-pattern violations
- Used to detect:
  - Authentication mode (anonymous, generic, user)
  - Enabled channels (Teams, portal, etc.)
  - Connectors used (SharePoint, SQL, HTTP, etc.)
  - Skills and plugin actions

**Where used:**
- Deep Scan button in agent detail page
- Risky pattern detection (autonomous agents, maker credentials, HTTP actions, etc.)

---

### 5. AppInsights Connector

**Interface:**
```ts
interface AppInsightsConnector {
  getHealth(): Promise<HealthMetric[]>;
}
```

**Implementation:**
- Queries Azure Application Insights (or legacy Analytics) for bot telemetry
- Returns daily aggregates: `errorRate`, `avgLatencyMs`, `failedSessions`
- No conversation content; aggregate metrics only

**Where used:**
- Health page (operational metrics dashboard)
- Alerts (error-rate anomaly detection)

---

### 6. KPIs Connector

**Interface:**
```ts
interface KpisConnector {
  getAggregates(): Promise<ConversationKpi[]>;
}
```

**Implementation:**
- Calls Copilot Studio native analytics aggregation API
- Returns daily: `sessions`, `deflectionRate`, `escalationRate`
- **Critical:** NO conversation content, no user identifiers — aggregate only

**Where used:**
- Conversation KPIs page
- Alerts (escalation spike detection)

---

## Engines: Business Logic

### Compliance Engine

**Files:** `lib/engines/compliance.ts`, API route `/api/compliance`

**What it does:**
1. Loads all `ComplianceRule`s from the config
2. For each agent, evaluates the rule `expression` (CEL/simple DSL)
3. Records `ComplianceViolation` if the rule fails
4. Tracks violation lifecycle: `open` → `acknowledged` → `resolved` / `suppressed`

**Rules are configurable:**
- **Type**: `authentication`, `data_loss`, `knowledge_source`, `channel`, `connector`
- **Severity**: `critical`, `warning`, `info`
- **Expression**: CEL-style rules, e.g., `agent.channels.contains('Teams') && !agent.usesMFA`

**Example rule:**
```yaml
id: auth-no-anonymous
name: "Anonymous Authentication Blocked"
type: authentication
severity: critical
enabled: true
expression: "agent.authMode != 'anonymous'"
```

---

### Risky Pattern Detector

**Files:** `lib/engines/risky-patterns.ts`

**Patterns detected:**
1. `autonomous` - Agent runs without user approval loops
2. `maker_credential` - Uses maker's own credentials (not service account)
3. `http_action` - Calls HTTP endpoints (potential data exfil)
4. `anonymous_auth` - No authentication enforced
5. `computer_use` - Uses Copilot Studio computer-use actions
6. `shared_entire_tenant` - Available to all users (no scoping)
7. `risky_connector` - Uses high-risk connectors (SQL, HTTP, custom flows)

Each pattern maps to a data-collection step (ARG property, Dataverse deep scan, config check).

---

### Maturity Assessment Engine

**Files:** `lib/engines/maturity.ts`

**3 pillars:**
- **Security**: Authentication, encryption, DLP, least-privilege
- **Management**: Versioning, documentation, ownership, governance
- **Reporting**: Telemetry, audit, KPIs, alerting

**18 controls:**
Each control is scored 0-4:
- **0**: Not implemented
- **1**: Documented / planned
- **2**: Partially implemented
- **3**: Fully implemented
- **4**: Automated + audited

**Auto-evaluable vs. manual:**
- **Auto-evaluable** (8): Can be inferred from ARG + Dataverse + telemetry
  - E.g., "Agent has Conversation KPIs enabled" (telemetry check)
  - E.g., "Agent has DLP rule" (Dataverse check)
- **Manual** (10): Require human judgment or external data
  - E.g., "Agent documentation is current"
  - E.g., "Owner completed security training"

**Capped scoring:** Auto scores are marked `capped: true` with `residualBurden` explaining what remains manual (e.g., "Requires stakeholder sign-off on security controls").

---

### Release Gates Engine

**Files:** `lib/engines/gates.ts`

**What it does:**
1. Load `GatePolicy` (YAML-encoded, OPA/Rego-compatible)
2. Evaluate policy against agent + target lifecycle stage
3. Record `GateDecision` (pass/block + reasons)
4. Sign decision with HMAC-SHA256 (tamper detection)

**Example policy:**
```yaml
name: "Production Gate"
rules:
  - agent.lifecycle == 'pilot' && !violations.critical
  - agent.lastActivity > 30d_ago
  - maturityScore >= 2.5
```

**Decisions:**
- **Pass**: Agent allowed to promote; reasons list mandatory checks
- **Block**: Agent promotion rejected; reasons explain why

**Audit trail:** Every decision is signed and immutable.

---

## Data Flow: From ARG to Dashboard

### 1. Inventory Ingestion (Real-time)

User loads the dashboard or clicks "Refresh":

```
Client → GET /api/agents
  ↓
API Route aggregates:
  a. ARG query (ArgInventoryConnector.listAgents)
  b. Graph resolve owners (GraphConnector.resolveOwners)
  c. Cost metrics (CostConnector.getDailyMetrics) - optional, cached
  ↓
Response: Agent[] with owner names, last activity, metrics
  ↓
Client: Render inventory table + agent detail cards
```

### 2. Governance Evaluation (Scheduled or On-Demand)

Background job or manual trigger:

```
Scheduler (hourly) or User clicks "Evaluate Compliance"
  ↓
Compliance engine loads all rules + agents
  ↓
For each agent:
  a. ARG props + recent deep-scan result → agent state
  b. Evaluate each ComplianceRule.expression
  c. Record ComplianceViolation if fails
  ↓
Write violations to Supabase (timestamped audit log)
  ↓
If any violations: trigger alert (Teams/email)
```

### 3. Maturity Assessment (On-Demand or Periodic)

User clicks "Run Assessment":

```
User → POST /api/maturity/assess
  ↓
Maturity engine:
  a. Load all MaturityControls (3 pillars × 18 controls)
  b. For each control:
     - If autoEvaluable: query data sources (ARG, telemetry, Dataverse)
     - If manual: skip (or prompt user via questionnaire)
  c. Score 0-4 and mark capped if inferred
  ↓
Write MaturityResult[] to Supabase
  ↓
Client: Render score breakdown + residual burden list
```

### 4. Alert Lifecycle

```
Alert trigger (budget breach, compliance violation, etc.)
  ↓
Create Alert record (status: open)
  ↓
Send Teams/email notification (if configured)
  ↓
User acknowledges: Alert status → ack
  ↓
User resolves: Alert status → resolved
  ↓
Historical alerts stay in Supabase for reporting
```

---

## Storage & State

### Transient (In-Memory, <5min)

- ARG query results (cached at connector)
- Graph resolutions (batched, cached)

### Persistent (Supabase)

- Daily metrics (time-series)
- Compliance violations (audit log)
- Maturity results (assessment snapshots)
- Gate decisions (signed, immutable)
- Alert history (lifecycle tracking)
- Settings (tenant-specific config)

### Never Stored

- Conversation content
- User identifiers
- Secrets (client secret, keys)

---

## Security Model

### Authentication

- Users authenticate via **Entra ID** (SSO, MSAL.js)
- Service principal authenticates via **client secret** (server-side only)
- Client secret is NEVER exposed to the browser

### Authorization

- Service principal needs:
  - `Azure Resource Graph: ResourceGraph.Read.All` (app permission)
  - `Microsoft Graph: User.Read` (delegated — for owner resolution)
  - Power Platform Admin role (to list environments)
- Users authenticate as themselves but see tenant-wide data (single-tenant assumption)

### Data Access

- **Client browser:** Sees agents, metrics, alerts (no secrets)
- **API server:** Can access Azure Resource Graph, PPAC, Dataverse (uses client secret)
- **Database (Supabase):** RLS (Row Level Security) policies restrict read/write by tenant
- **Alerts:** Sent to Teams/email webhooks (no PII embedded)

---

## Deployment Patterns

### Standalone (Single Organization)

```
agentlens.contoso.com
  ↓
Entra tenant: contoso.onmicrosoft.com
  ↓
Service principal: AgentLens app registration
  ↓
Reads agents from: ARG in contoso.onmicrosoft.com
```

### Managed Service (Multi-Tenant, Future)

Each tenant gets its own instance or isolated workspace.

---

## Performance Targets

| Operation | Latency | Cache |
|-----------|---------|-------|
| Load agent inventory | <1s | 5 min (ARG) |
| Resolve owners | <2s | 1 hour (Graph batch) |
| Fetch daily metrics | <3s | 1 hour (PPAC) |
| Evaluate compliance | <10s | 30 min (rule eval) |
| Assess maturity | <15s | N/A (always fresh) |

---

## Future Extensibility

### Adding a New Connector

1. Define interface in `lib/connectors/interfaces.ts`
2. Implement concrete class (e.g., `MyDataConnector`)
3. Register in `ConnectorRegistry`
4. Use in API routes

### Adding a New Engine

1. Create `lib/engines/my-engine.ts`
2. Implement core logic + scoring
3. Create API route `/api/my-engine`
4. Add to dashboard page

### Adding a New Data Source

1. Query in the appropriate connector (or create a new one)
2. Map results to existing types (or extend types in `lib/types/index.ts`)
3. Use in engine or API route

---

## References

- See [docs/PLAN.md](PLAN.md) for the full v2 roadmap
- See [docs/INSTALL.md](INSTALL.md) for deployment steps
- See `lib/types/index.ts` for all data contracts
- See `lib/connectors/interfaces.ts` for connector signatures
- See `lib/mock/seed.ts` for example data

---

**Version:** v2.0.0-beta  
**Last Updated:** 2026-06-12
