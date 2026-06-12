# Project Plan: AgentLens — Copilot Agent Governance & Observability Webapp
Date: 2026-06-12 | Owner: Elliot Margot | Status: Draft
Objective: Ship a single-tenant, install-light webapp that does everything the Copilot Studio Kit's monitoring/governance side does — plus proactive alerting and AI query the Kit can't — deployed by a web app + one Entra app registration instead of a 45 MB Dataverse managed solution.

> Working title: **AgentLens** (naming is an open question). "All-in-one" = one web app covering inventory, cost, sprawl, governance, KPIs, health, lifecycle, and AI — no Dataverse footprint in client environments beyond a read-only application user.

---

## Executive Summary
AgentLens is a Next.js webapp that reads the Power Platform / BAP / Dataverse / Licensing / App Insights APIs through a single Entra service principal and renders a live agent-governance command surface for one tenant. It targets the two problems ITER actually has — **default-environment sprawl** (~460 apps to migrate) and **runaway agent cost** (the ~$300/week burner) — with a stateful ingestion pipeline, a baseline-diff alert engine that pushes to Teams/email, and an AI query layer. It installs in ~4 steps (~20 min) versus the multi-hour Kit saga, takes nothing into client environments except a read-only app-user, and ships open-source as Elliot's MVP OSS-creator deliverable. v1 (Phases 0–2) delivers the ITER-pain core and is independently shippable; Phases 3–6 iterate toward an Aug 31 OSS publish + community-talk demo.

## Scope
**In scope**
- Single tenant (multi-environment within that tenant).
- Agent inventory, default-env sprawl + migration tracker, cost/message-volume monitoring + budget/anomaly alerting (Teams/email), DLP/sharing/orphan governance posture, conversation KPI aggregates, App Insights health, lifecycle/prod-entry checklist, maker self-service, AI NL-query + summaries.
- Install = deploy web app + 1 Entra app registration + per-env Dataverse application-user via a provisioning script.
- Open-source reference deploy on Vercel + Supabase; documented Azure path for client/residency.

**Out of scope (v1, and deliberate non-goals)**
- The Kit's **Dataverse-native test-automation framework** (define/run test cases stored in Dataverse) — high effort, low overlap with the governance goal. Defer/decline.
- **PowerShield-style interactive DLP-approval workflows** (stateful maker request/approve) — the Kit's Dataverse backend earns its keep here; we monitor DLP, we don't replace the approval engine.
- Multi-tenant "command center" (explicitly dropped per user — single tenant only).
- Writing to client environments (read-only posture; the app-user gets a read role only).

**Assumptions**
- Per-agent **invoice-grade** cost is not cleanly exposed by any single public API; v1 derives **estimated** cost from message/session volume + env-level credit burn (honest fidelity ceiling — see R-001).
- Conversation transcripts are **aggregate-only** (counts/trends), never stored as content (PII — see R-002).
- Elliot has tenant-admin in the MVP tenant and can grant admin consent + add app-users; client deploys (ITER) require the client to add the app-user per env.
- Part-time build capacity (~6–8 h/week) against heavy client load; Aug 31 = MVP-goal anchor, not a hard external deadline.

## Stakeholders
| Name | Role | Responsibility (RACI) | Availability |
|------|------|----------------------|--------------|
| Elliot Margot | Builder / Owner | Responsible + Accountable | ~6–8 h/week (part-time) |
| ITER (Junmin / Bertrand) | First client pilot | Consulted (validate against real estate) | Async; via existing engagement |
| MVP community | OSS audience | Informed (publish + talk) | n/a |
| Microsoft (PP product) | API provider | Informed (product feedback path) | n/a |

---

## Plan Overview

### Phases
| # | Phase | Tasks | Effort | Calendar | Milestone |
|---|-------|-------|--------|----------|-----------|
| 0 | Foundations | 5 | 16h | Wk 1 | Auth + 1-env smoke test green |
| 1 | Inventory + Sprawl | 6 | 24h | Wk 2–3 | **Shippable: live inventory + migration tracker** |
| 2 | Cost + Alerting | 5 | 24h | Wk 4–5 | **Shippable: $/volume watchdog + Teams alerts** |
| 3 | Governance posture | 3 | 16h | Wk 6 | DLP + sharing + orphan detection |
| 4 | KPIs + Health | 2 | 16h | Wk 7 | Conversation aggregates + App Insights health |
| 5 | AI + Lifecycle + Maker | 4 | 20h | Wk 8–9 | NL query + checklist + maker view |
| 6 | OSS hardening + publish | 4 | 16h | Wk 10 | **Public GitHub release + demo deck** |

### Stats
- Total tasks: 29 | Total steps: ~110
- Total effort: 132h (**with 20% buffer: ~158h**)
- Critical path (Phase 0 → 1 → 2 core): **~52h** to shippable v1
- Parallel tracks: connectors (Phase 1/2) parallelize per-API; UI parallelizes with ingestion once schema is fixed
- External dependencies: 3 (Entra admin consent, per-env app-user provisioning, Teams webhook/email channel)

---

## Detailed Plan

### Phase 0 — Foundations

#### T-001: Scaffold repo, Next.js app, Supabase project
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: none · **Blocked by**: none
**Description**: Stand up the OSS repo and the Next.js + Tailwind + Zustand shell with a Supabase project, matching the JumpStart stack so patterns/components are reusable.
**Steps**:
- [ ] Create GitHub repo `agentlens` (MIT, README stub, /docs) (20m)
- [ ] `create-next-app` (TS, App Router, Tailwind), add Zustand + Recharts + Supabase client (40m)
- [ ] Create Supabase project (MVP-tenant-adjacent), wire env vars, `.env.example` (30m)
- [ ] CI: lint + typecheck GitHub Action (30m)
- [ ] Base layout shell (sidebar nav, dark theme, brand tokens) (1h)
**Deliverable**: Running Next.js app on localhost + empty Supabase, pushed to GitHub.
**Acceptance criteria**:
- [ ] `npm run dev` renders the shell; Supabase client connects
- [ ] CI green on push
**Risks**: Stack drift from JumpStart — mitigate by copying its tsconfig/tailwind/eslint config.
**Notes**: Reuse JumpStart UI primitives where license-compatible.

#### T-002: Entra app registration + API permissions + admin consent
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: none · **Blocked by**: Tenant-admin consent (self, in MVP tenant)
**Description**: Create the single service principal AgentLens uses for all reads, grant the least-privilege application permissions, and admin-consent in the MVP tenant.
**Steps**:
- [ ] Register app `AgentLens-Reader`; create a client secret (dev) and note app/tenant IDs (20m)
- [ ] Add app permissions: Power Platform API (`https://api.powerplatform.com/.default`), Graph (`Application.Read.All`, `User.Read.All` to resolve owners), App Insights/Log Analytics read (40m)
- [ ] Grant admin consent; verify with a raw client-credentials token per audience (40m)
- [ ] Register the SP as a Power Platform admin app where required (`pac admin create-service-principal` / `New-PowerAppManagementApp`) (40m)
- [ ] Document the exact permission list in /docs (20m)
**Deliverable**: Consented app registration + a documented permission matrix.
**Acceptance criteria**:
- [ ] Client-credentials token acquired for PP API + Graph audiences
- [ ] SP can list environments via BAP API
**Risks**: Over-permissioning — keep read-only; flag any write scope. Cert vs secret is an open question (use secret for dev, cert for client/prod).
**Notes**: This is the entire "install" on the identity side — one app reg, no per-env apps.

#### T-003: Token service (MSAL client-credentials, per-audience cache)
**Phase**: 0 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-002 · **Blocked by**: none
**Description**: Server-only auth module that issues and caches tokens per audience — including the **per-environment Dataverse audience** (`https://<org>.crm.dynamics.com/.default`), which is the subtle part of multi-env fan-out.
**Steps**:
- [ ] `@azure/msal-node` ConfidentialClientApplication wrapper; secret + cert support (1h)
- [ ] `getToken(audience)` with in-memory expiry cache; `getDataverseToken(orgUrl)` deriving the per-org audience (1.5h)
- [ ] Graph + App Insights + Licensing audiences wired (45m)
- [ ] Unit tests with a fake token endpoint (45m)
**Deliverable**: `lib/auth/tokenService.ts` with cached multi-audience tokens.
**Acceptance criteria**:
- [ ] Returns valid tokens for PP API, Graph, and ≥1 Dataverse org audience
- [ ] Cache prevents duplicate token calls within expiry
**Risks**: Per-org audience mistakes → 401s; cover with a smoke test in T-005.
**Notes**: Must run server-side only (route handlers / ingestion worker) — never the browser.

#### T-004: Supabase schema v1
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-001 · **Blocked by**: none
**Description**: Define the normalized store that decouples the UI from the APIs and enables history/alerting/migration state.
**Steps**:
- [ ] Tables: `environments`, `agents`(envId,botId PK), `agent_metrics_daily`, `dlp_policies`, `agent_sharing`, `alerts`, `migration_tracker`, `ingestion_runs`, `config` (1.5h)
- [ ] Indexes (envId, botId, metric date); migration files committed (45m)
- [ ] Seed `config` (thresholds, Teams webhook placeholder) (45m)
**Deliverable**: Versioned SQL migrations + ER notes in /docs.
**Acceptance criteria**:
- [ ] Migrations apply cleanly to a fresh Supabase
- [ ] `agents` uniquely keyed by (envId, botId)
**Risks**: Schema churn later — keep metrics in a daily fact table to absorb new measures without reshaping.
**Notes**: RLS deferred to Phase 5 (maker self-service).

#### T-005: Single-environment smoke test (end-to-end auth → data)
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-003, T-004 · **Blocked by**: Per-env app-user in the test env
**Description**: Prove the whole spine on ONE environment before building fan-out: token → BAP list envs → pick one → Dataverse `bot` query → write rows to Supabase.
**Steps**:
- [ ] Add the SP as a Dataverse application user (read role) in the MVP test env (45m)
- [ ] Script: list environments (BAP), query `bot` table in the test env, print count (1h)
- [ ] Upsert environments + agents into Supabase (45m)
- [ ] Document the per-env app-user step (basis for T-104) (30m)
**Deliverable**: A script that lands real agents from one env into Supabase.
**Acceptance criteria**:
- [ ] ≥1 environment + its agents persisted in Supabase
- [ ] App-user provisioning steps captured
**Risks**: App-user role too narrow → empty `bot` reads; verify with System Customizer/read role on the bot tables.
**Notes**: This de-risks Phase 1's fan-out and the install story in one shot.

---

### Phase 1 — Inventory + Default-Env Sprawl (shippable)

#### T-101: Power Platform / BAP connector
**Phase**: 1 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-005 · **Blocked by**: none
**Description**: Normalize environment + copilot/agent listings and the env type (default vs managed) from BAP/PP API — the backbone of the sprawl view.
**Steps**:
- [ ] `listEnvironments()` (id, name, type, isDefault, region) (1.5h)
- [ ] `listCopilots(envId)` where exposed by PP API; reconcile with Dataverse bots (1.5h)
- [ ] DTO normalization + tests (1h)
**Deliverable**: `lib/connectors/ppApi.ts`.
**Acceptance criteria**: [ ] Returns all envs with `isDefault` flag · [ ] Handles paging
**Risks**: API shape drift — pin api-version; snapshot-test DTOs.
**Notes**: `isDefault` is what powers the sprawl tracker.

#### T-102: Dataverse connector (bot table + owner resolution)
**Phase**: 1 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P0 · **Depends on**: T-005 · **Blocked by**: none
**Description**: Per-env reads of the `bot` table (agents) with owner/maker, timestamps, state, and component-derived connector usage; resolve ownerid → name/email via Graph.
**Steps**:
- [ ] `getAgents(orgUrl)`: bot select (name, ownerid, createdon, modifiedon, statecode, schemaname) (1.5h)
- [ ] Derive `lastActivity` (modifiedon now; transcript-based later) (45m)
- [ ] Resolve owners via Graph batch; cache (1.5h)
- [ ] Normalize + upsert to `agents` (1.25h)
**Deliverable**: `lib/connectors/dataverse.ts`.
**Acceptance criteria**: [ ] Agents carry resolved owner display name/email · [ ] Idempotent upsert by (envId, botId)
**Risks**: Graph throttling on owner resolve — batch + cache.
**Notes**: Connector usage may need the bot components/dependencies query — can be a v1.1 enrichment.

#### T-103: Ingestion orchestrator (multi-env fan-out)
**Phase**: 1 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P0 · **Depends on**: T-101, T-102 · **Blocked by**: none
**Description**: Concurrency-bounded fan-out across all environments with per-env isolation (one env's failure doesn't sink the run) and a run ledger.
**Steps**:
- [ ] `p-limit` fan-out over envs; per-env try/catch (1.5h)
- [ ] Write `ingestion_runs` (status, counts, per-env errors) (1h)
- [ ] `/api/ingest` protected route (cron secret) + on-demand trigger (1.5h)
- [ ] Vercel Cron schedule (e.g. hourly) (1h)
**Deliverable**: Scheduled + on-demand ingestion populating Supabase tenant-wide.
**Acceptance criteria**: [ ] Full-tenant ingest completes with a per-env status report · [ ] A failing env is skipped, not fatal
**Risks**: Long runs hit serverless timeouts — chunk envs / queue; document Azure Functions path for large tenants.
**Notes**: Bounded concurrency (e.g. 5) to respect API limits.

#### T-104: Per-environment app-user provisioning script (the install)
**Phase**: 1 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-005 · **Blocked by**: Admin rights in target envs
**Description**: The one repeated install step, automated — add the AgentLens SP as a read-only application user across all (or selected) environments via pac / Dataverse Web API.
**Steps**:
- [ ] Define a minimal read security role (bot, transcript-aggregate, sharing tables) (1h)
- [ ] Script: for each env, create application user + assign role (pac admin / Web API) (2h)
- [ ] Dry-run + idempotency (skip if present) (1h)
**Deliverable**: `scripts/provision-app-user.ts` + role definition.
**Acceptance criteria**: [ ] One command provisions the SP across N envs · [ ] Re-runnable without duplicates
**Risks**: Per-env admin friction at clients — document a manual fallback (PPAC → app users).
**Notes**: This + T-002 IS the entire install. Headline of the "easier than the Kit" story.

#### T-105: Inventory UI
**Phase**: 1 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-103 · **Blocked by**: none
**Description**: The core table — every agent in the tenant with env, owner, state, last activity, filters/search/sort.
**Steps**:
- [ ] `/api/agents` read endpoint (Supabase) (45m)
- [ ] Inventory table (sort/filter by env, owner, state, default-env) (1.5h)
- [ ] Agent detail drawer (45m)
**Deliverable**: Inventory page reading from Supabase.
**Acceptance criteria**: [ ] Lists all agents tenant-wide · [ ] Filter "default env only" works
**Risks**: Large tenants (1000+ agents) — server-side pagination.
**Notes**: Recharts summary cards (counts by env/state) up top.

#### T-106: Default-env sprawl + migration tracker UI
**Phase**: 1 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-105 · **Blocked by**: none
**Description**: ITER's signature view — every agent in the default environment, its owner, and a migration state machine (to-migrate / notified / moved) tracked in `migration_tracker`.
**Steps**:
- [ ] Default-env list with owner + last activity (1h)
- [ ] Migration status column + bulk "mark notified/moved" → `migration_tracker` (1.5h)
- [ ] Progress header (X of 460 migrated) (30m)
**Deliverable**: Sprawl + migration tracker page.
**Acceptance criteria**: [ ] Shows default-env agents with owners · [ ] Migration state persists and rolls up
**Risks**: Owner gaps (orphans) — surface "no owner" explicitly as a cleanup signal.
**Notes**: This is the demo-able "wow" for ITER and the OSS pitch.

---

### Phase 2 — Cost + Alerting (shippable)

#### T-201: Cost / message-volume metrics connector
**Phase**: 2 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P0 · **Depends on**: T-103 · **Blocked by**: none
**Description**: Pull the reliable signals — per-agent message/session volume (analytics/Dataverse aggregates) and env-level credit burn (licensing API) — and derive an **estimated** per-agent cost. Honest about the fidelity ceiling (R-001).
**Steps**:
- [ ] Message/session counts per agent per day (Dataverse `$apply` aggregate) (2h)
- [ ] Env credit/capacity burn from licensing API (1.5h)
- [ ] Cost estimate = volume × rate (config) + model-meter field; persist to `agent_metrics_daily` (1.5h)
**Deliverable**: `lib/connectors/cost.ts` + daily metrics.
**Acceptance criteria**: [ ] Per-agent daily volume persisted · [ ] Env credit burn captured · [ ] Estimate labelled "estimated"
**Risks**: **R-001** per-agent invoice-grade cost not exposed — v1 ships volume + estimate, clearly labelled.
**Notes**: Model-meter field enables the Claude-premium mis-meter catch.

#### T-202: Metrics history + trends
**Phase**: 2 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-201 · **Blocked by**: none
**Description**: Roll daily metrics into 7/30-day baselines used by the UI and the alert engine.
**Steps**:
- [ ] Baseline views (7d/30d avg per agent) (1h)
- [ ] Trend series endpoint (1h)
- [ ] Backfill handling for gaps (1h)
**Deliverable**: Baseline/trend queries.
**Acceptance criteria**: [ ] 7-day avg computed per agent · [ ] Endpoint returns series for charts
**Risks**: Cold-start (no history) → alerts need ≥N days; gate alerts on min-history.
**Notes**: Baselines are the anomaly-detection substrate.

#### T-203: Rule / alert engine
**Phase**: 2 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P0 · **Depends on**: T-202 · **Blocked by**: none
**Description**: Post-ingest engine that diffs current vs baseline and raises alerts: budget breach, volume spike (>N× 7-day avg), new agent in default env, model-meter mismatch, orphan/idle.
**Steps**:
- [ ] Rule definitions + config thresholds (1.5h)
- [ ] Evaluator runs at end of ingest; writes `alerts` with dedupe (2h)
- [ ] Severity + state (open/ack/resolved) (1.5h)
**Deliverable**: `lib/alerts/engine.ts`.
**Acceptance criteria**: [ ] A simulated 3× spike raises one alert · [ ] No duplicate alert on repeat ingest
**Risks**: Alert noise — dedupe + min-history + cool-down.
**Notes**: This is the proactive edge the Kit lacks.

#### T-204: Teams + email dispatch
**Phase**: 2 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-203 · **Blocked by**: Teams webhook / mail channel
**Description**: Deliver alerts to a Teams channel (incoming webhook) and email (Graph sendMail or Resend), config-driven per tenant.
**Steps**:
- [ ] Teams Adaptive Card payload + webhook post (1.5h)
- [ ] Email path (Graph sendMail) (1h)
- [ ] Config UI field for webhook/recipients (30m)
**Deliverable**: Alert delivery to Teams + email.
**Acceptance criteria**: [ ] Test alert lands in Teams + inbox · [ ] Channel configurable
**Risks**: Webhook secrecy — store in `config`/secrets, never in repo.
**Notes**: Teams card deep-links back to the agent in AgentLens.

#### T-205: Cost UI (per-agent, trends, anomaly flags)
**Phase**: 2 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-202, T-203 · **Blocked by**: none
**Description**: Cost dashboard — per-agent estimated spend, trend charts, top burners, and anomaly flags from the engine.
**Steps**:
- [ ] Cost table (sort by spend, Δ vs baseline) (1h)
- [ ] Trend charts (Recharts) + "top 10 burners" (1.5h)
- [ ] Anomaly + alert badges (30m)
**Deliverable**: Cost page + Alerts page.
**Acceptance criteria**: [ ] Top burners ranked · [ ] Anomalies visibly flagged
**Risks**: Estimate misread as invoice — label "estimated" prominently.
**Notes**: The $300/week watchdog, visualized.

---

### Phase 3 — Governance posture (lighter detail)

#### T-301: DLP posture per environment (P1, 6h, depends T-101)
Pull DLP policies + connector classifications via BAP Governance API; show per-env Business/Non-Business/Blocked and flag risky/blocked connectors on agents. **Deliverable**: DLP view. **Acceptance**: per-env classification rendered; agent↔connector risk surfaced. **Risk**: BAP read perms.

#### T-302: Sharing audit (P2, 5h, depends T-102)
Read principalaccess/sharing for agents; show who can access what; flag broad shares. **Deliverable**: Sharing view. **Acceptance**: per-agent access list. **Risk**: sharing tables read role.

#### T-303: Orphan / idle / zombie detection (P1, 5h, depends T-202)
Rules: no owner, no activity in N days, capacity-consuming with zero usage → retire candidates. **Deliverable**: Cleanup worklist + alert rule. **Acceptance**: candidates listed with reason. **Risk**: "activity" fidelity → combine modifiedon + transcript counts.

### Phase 4 — KPIs + Health (lighter detail)

#### T-401: Conversation KPI aggregates (P2, 8h, depends T-102) — PII-safe
Aggregate `conversationtranscripts` via Dataverse `$apply` (counts by day/agent, deflection/escalation proxies); **never store content**. **Deliverable**: KPI view. **Acceptance**: volume/deflection trends; zero raw transcript stored. **Risk**: **R-002** PII + volume → aggregate-only, sampling.

#### T-402: App Insights health (P2, 8h, depends T-003)
KQL over App Insights for agent error rate/latency/failed sessions; map to agents. **Deliverable**: Health view. **Acceptance**: error/latency per agent. **Risk**: requires App Insights resource + read perms; not all tenants wire it.

### Phase 5 — AI + Lifecycle + Maker (lighter detail)

#### T-501: NL query (text-to-SQL, constrained) (P2, 6h, depends T-105)
Claude/Ollama translate NL → read-only SQL over an allowlisted Supabase schema; render results. **Deliverable**: Ask-bar. **Acceptance**: "agents in default env over $50/mo" returns correct rows. **Risk**: SQL injection/over-reach → read-only role, table allowlist, query validation. **PII**: tenant-identifying data → Claude direct, not Ollama (Elliot's rule).

#### T-502: AI governance summaries + recommendations (P3, 4h, depends T-303)
Scheduled AI summary of posture + retire/migrate/optimize recommendations. **Deliverable**: Weekly summary card + optional Teams digest. **Acceptance**: actionable recs generated. **Risk**: hallucinated recs → ground strictly on DB rows.

#### T-503: Lifecycle + prod-entry checklist (P2, 5h, depends T-105)
Maturity stage per agent (PoC→pilot→prod), enforce a prod-entry checklist, change/version history from modifiedon. **Deliverable**: Lifecycle view. **Acceptance**: stage + checklist persisted. **Risk**: stage is manual metadata → store in our DB.

#### T-504: Maker self-service (role-aware) (P3, 5h, depends T-101)
Supabase RLS + auth so makers see only their own agents' cost/health. **Deliverable**: Maker view. **Acceptance**: maker sees only owned agents. **Risk**: identity mapping maker→ownerid; auth model (Entra SSO for the app).

### Phase 6 — OSS hardening + publish (lighter detail)

#### T-601: Docs + install guide (P1, 5h)
README, architecture doc, the 4-step install, permission matrix, screenshots. **Acceptance**: a stranger can install from docs alone.
#### T-602: Install script polish + setup wizard page (P1, 5h, depends T-104)
One-command provisioning + an in-app setup wizard (tenant id, webhook, thresholds). **Acceptance**: green-field install < 20 min.
#### T-603: Branding, license, public release (P1, 3h)
MIT license, logo, GitHub release, topics. **Acceptance**: public repo + tagged release → MVP OSS contribution logged.
#### T-604: Demo prep (community talk) (P2, 3h, depends T-106, T-205)
Demo script + slides ("a lighter alternative to the Copilot Studio Kit"). **Acceptance**: 10-min demo runs end-to-end → MVP talk goal.

---

## Dependency Map
| Task | Depends On | Blocks | Parallel With | Wait Time |
|------|-----------|--------|---------------|-----------|
| T-001 | none | T-004 | T-002 | - |
| T-002 | none | T-003, T-104 | T-001 | Admin consent (self) |
| T-003 | T-002 | T-005 | T-004 | - |
| T-004 | T-001 | T-005 | T-003 | - |
| T-005 | T-003, T-004 | T-101, T-102, T-104 | - | Per-env app-user |
| T-101 | T-005 | T-103, T-301, T-504 | T-102 | - |
| T-102 | T-005 | T-103, T-302, T-401 | T-101 | - |
| T-103 | T-101, T-102 | T-105, T-201 | T-104 | - |
| T-104 | T-005 | T-602 | T-103 | Env admin rights |
| T-105 | T-103 | T-106, T-205, T-501, T-503 | - | - |
| T-106 | T-105 | T-604 | - | - |
| T-201 | T-103 | T-202 | - | - |
| T-202 | T-201 | T-203, T-205, T-303 | - | ≥7d history |
| T-203 | T-202 | T-204, T-205 | - | - |
| T-204 | T-203 | - | T-205 | Teams webhook |
| T-205 | T-202, T-203 | T-604 | T-204 | - |

## Critical Path
```
T-002 (3h) → T-003 (4h) → T-005 (3h) → T-103* (depends T-101 4h + T-102 5h) → T-201 (5h) → T-202 (3h) → T-203 (5h) → T-205 (3h)
Core spine to shippable cost+alerting v1 ≈ 3+4+3+9+5+3+5+3 = 35h critical, ~52h with the Phase-1 inventory/sprawl UI on the path.
With 20% buffer: ~62h to a demo-able, shippable v1 (Phases 0–2).
```
**Note**: T-202 introduces a real-time wait — alerts need ≥7 days of metric history before they're trustworthy. Start ingestion (Phase 1) early so history accrues while Phase 2 UI is built.

## Timeline
Anchored to part-time capacity (~6–8 h/week) vs the Aug 31 MVP-OSS-goal deadline (80 days). Front-load ingestion so baselines accrue.

### Phase 0–1 (Wk 1–3): Foundations + shippable Inventory/Sprawl — 40h
| Week | Tasks | Hours | Milestone |
|------|-------|-------|-----------|
| Wk 1 | T-001, T-002, T-003, T-004 | 13h | Auth + schema ready |
| Wk 2 | T-005, T-101, T-102 | 13h | Real agents in Supabase tenant-wide |
| Wk 3 | T-103, T-104, T-105, T-106 | 15h | **Shippable: live inventory + migration tracker; ingestion running (history accruing)** |

### Phase 2 (Wk 4–5): Cost + Alerting — 24h
| Week | Tasks | Hours | Milestone |
|------|-------|-------|-----------|
| Wk 4 | T-201, T-202 | 8h | Per-agent volume + estimated cost |
| Wk 5 | T-203, T-204, T-205 | 11h | **Shippable: anomaly alerts → Teams/email; cost dashboard** |

### Phase 3–6 (Wk 6–10): Governance, KPIs, AI, Lifecycle, OSS — 68h
| Week | Tasks | Hours | Milestone |
|------|-------|-------|-----------|
| Wk 6 | T-301, T-302, T-303 | 16h | Governance posture |
| Wk 7 | T-401, T-402 | 16h | KPIs + health |
| Wk 8–9 | T-501, T-502, T-503, T-504 | 20h | AI query + lifecycle + maker view |
| Wk 10 | T-601, T-602, T-603, T-604 | 16h | **Public OSS release + demo deck (MVP goals logged)** |

---

## Risk Register
| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|-----------|-------|
| R-001 | Per-agent **invoice-grade cost** isn't exposed by any single public API | H | H | v1 ships per-agent **volume** + **estimated** cost (labelled) + env credit burn; alert on volume spikes (the leading indicator). Document the ceiling openly. | Elliot |
| R-002 | Conversation transcripts carry **PII** and are high-volume | H | H | Aggregate-only via Dataverse `$apply`; never store content; sample; defer to Phase 4 | Elliot |
| R-003 | **Per-env app-user** provisioning friction at clients | M | M | Automated script (T-104) + manual PPAC fallback; gracefully skip un-provisioned envs | Elliot |
| R-004 | Serverless **timeouts** on large-tenant ingestion (1000+ agents) | M | M | Bounded concurrency + chunked/queued runs; documented Azure Functions path | Elliot |
| R-005 | **API drift** (PP/BAP/licensing endpoints change) | M | M | Pin api-versions; snapshot-test DTOs; isolate per-connector | Elliot |
| R-006 | **Token/audience** mistakes (per-org Dataverse audience) → 401s | M | M | Smoke test (T-005) before fan-out; per-audience cache tests | Elliot |
| R-007 | Capacity: client load (ITER etc.) starves the side-project | H | M | Phase to **shippable at Phase 2**; each phase independently valuable; no hard deadline | Elliot |
| R-008 | Sending tenant data to 3rd-party model (Ollama) in AI layer | L | H | Claude-direct for tenant-identifying data; Ollama only on anonymized aggregates (Elliot's PII rule) | Elliot |

## Decision Log
| # | Decision | Date | Rationale | Decided By |
|---|----------|------|-----------|-----------|
| D-001 | Needs a DB — use **Supabase/Postgres** | 2026-06-12 | History for anomaly baselines, stateful migration tracker, API rate limits forbid live per-load calls, alerting needs prior-state diff | Elliot |
| D-002 | OSS reference deploy = **Vercel + Supabase**; documented **Azure** path for client/residency | 2026-06-12 | Lightest for OSS/MVP-tenant; Azure for client data-residency + App Insights proximity | Elliot |
| D-003 | v1 = **Inventory + Sprawl + Cost + Alerting** (Phases 0–2); defer governance/KPI/AI/lifecycle | 2026-06-12 | Targets ITER's real pain fastest; independently shippable | Elliot |
| D-004 | Cost v1 = **estimated from volume** + env credit burn (not invoice-grade) | 2026-06-12 | Per-agent invoice cost not exposed (R-001); volume is the actionable leading indicator | Elliot |
| D-005 | Transcripts = **aggregate-only**, no content stored | 2026-06-12 | PII + volume (R-002) | Elliot |
| D-006 | Install = **1 Entra app reg + per-env read app-user** (read-only posture) | 2026-06-12 | The "easier than the Kit" core; nothing imported into client envs | Elliot |
| D-007 | **Decline** the Kit's test-automation + PowerShield approval-workflow features | 2026-06-12 | Stateful Dataverse-native; high effort, off-goal; monitor DLP, don't replace the approval engine | Elliot |

## Open Questions
- [ ] Confirm v1 = Inventory + Sprawl + Cost + Alerting, with Phases 3–6 as iteration? (assumed yes — D-003)
- [ ] OSS reference deploy on **Vercel** or **Azure** first? (assumed Vercel — D-002)
- [ ] **Cert vs secret** for the app registration in the MVP-tenant dev phase? (assumed secret for dev, cert for client/prod)
- [ ] Is **estimated** per-agent cost acceptable for v1, or is invoice-grade a hard requirement? (assumed estimated — D-004)
- [ ] Product **name**: AgentLens, or something else (brand check + GitHub/namespace availability)?
- [ ] Does ITER want to be the **named pilot** for AgentLens, or keep it MVP-tenant-only until published?

## Success Criteria
- [ ] Installs on a fresh tenant in **< 20 min** with no Dataverse managed-solution import (web app + 1 app reg + provisioning script)
- [ ] Renders **every agent across all environments** with owner, env, and default-env flag
- [ ] **Default-env migration tracker** shows owners and persists migration state (the ITER worklist)
- [ ] A simulated cost/volume spike fires a **Teams + email alert** within one ingest cycle
- [ ] Published **open-source** on GitHub (MIT) with a working install guide → logged as MVP **OSS-creator** contribution
- [ ] **10-minute demo** runs end-to-end → MVP community-talk material
- [ ] Honest cost labelling (no "invoice-grade" claim where it's estimated)
```

---

## Addendum: Robustness Upgrade + Phase -1 Validation Spike (2026-06-12)
Closes the gaps from the "what's missing" review. **No build hour is spent until Phase -1 passes.**

### Phase -1 — Validation Spike (1 day, BLOCKS all build)
Proves the proposal rests on real data, not assumptions, in Elliot's **MVP tenant**.
- **S-1 Data-contract spike (P0, 4h):** with the app registration, actually call (a) BAP/PP API `listEnvironments` + agent list, (b) Dataverse `bot` table in 1 env, (c) the **cost/usage source** — verify whether per-agent message/credit data is in Dataverse, Copilot Studio analytics, or App Insights, and whether the SP can read it. **Output:** a one-page "what data actually exists + which API serves it" doc. Kills R-001/R-009.
- **S-2 Agent-scope decision (P0, 1h):** define "agent" = Copilot Studio custom agents (Dataverse `bot`) for v1; explicitly note M365 declarative agents + Agent 365 agents are **out of v1** (different sources). 
- **S-3 App-data-residency decision (P0, 1h):** decide where AgentLens stores its OWN data (Supabase region / self-hosted Postgres / Azure) and whether that's acceptable for a sensitive client (ITER DPO). A governance tool cannot be ungoverned.
- **S-4 App auth decision (P0, 1h):** how humans log into AgentLens (Entra SSO from day one, not deferred). 
- **Gate:** if S-1 shows the cost data isn't readable, re-scope cost → volume-only before building.

### New Decisions
| # | Decision | Rationale |
|---|----------|-----------|
| D-008 | "Agent" v1 = Copilot Studio custom agents (Dataverse `bot`); M365 declarative + Agent 365 = out of scope v1 | Different data sources; keeps the connector layer tractable |
| D-009 | AgentLens app auth = **Entra SSO from day 0** (not deferred to Phase 5) | Even the admin surface needs authn/authz immediately |
| D-010 | App's own data store + region decided in Phase -1 before build | Self-governance / client DPO acceptability |
| D-011 | One AgentLens **instance per client tenant** (no shared multi-tenant DB) | Isolation, residency, blast-radius — matches "single tenant" |

### New Risks
| # | Risk | L | I | Mitigation |
|---|------|---|---|------------|
| R-009 | Cost/usage data not readable by the SP / not in a queryable store | M | H | Phase -1 S-1 spike proves it BEFORE build; fallback = volume-only |
| R-010 | IP ownership (personal vs Witivio) blocks OSS publish | M | M | Clarify with Witivio before T-603 publish; can stay private until resolved |
| R-011 | Microsoft Agent 365 (01/07) / native governance obsoletes parts | M | M | Position as complementary (sprawl + alerting Microsoft doesn't do); revisit scope post-A365 GA |
| R-012 | AgentLens itself ungoverned (god-mode SP + PII in 3rd-party DB) | M | H | Read-only SP, least-priv role, app-data-residency decision (D-010), no transcript content stored |

### New Open Questions
- [ ] IP: personal or Witivio-owned? (gates OSS publish — R-010)
- [ ] One instance per client confirmed (D-011)?
- [ ] Does ITER's DPO accept the app's data store/region (D-010)?
