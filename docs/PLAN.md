# Project Plan: AgentLens v2 — Copilot Agent Governance & Observability Platform
Date: 2026-06-12 | Owner: Elliot Margot | Status: Draft (v2 — supersedes v1, archived at docs/PLAN-v1-archive.md)
Objective: Ship a single-tenant, install-light web platform that combines tenant-wide agent inventory, cost/capacity analytics, a compliance + maturity engine, proactive alerting, and policy-as-code release gates — on an Azure Resource Graph backbone — validated first in Elliot's MVP tenant and published open-source.

> **What changed v1 → v2.** (a) Inventory backbone swapped to **Azure Resource Graph** (`PowerPlatformResources`) — Microsoft now exposes the whole-tenant agent inventory in one query, killing the per-env Dataverse fan-out *and* the per-env app-user provisioning. (b) Cost via **PPAC Licensing API + CSV fallback** (proven path). (c) Scope expanded with four new governance pillars harvested from prior art: **credit/capacity analytics**, **compliance engine + risky-pattern detection**, **maturity assessment**, and **policy-as-code release gates**. (d) **MVP-tenant linkage** is now first-class. Prior art studied: `sbrakni/Copilot-Studio-Governance-Monitoring-Power-App` (monitoring), `judeper/FSI-AgentGov` (maturity/regulatory), `oneKn8/agentgov` (trust/release gates).

---

## Executive Summary
AgentLens v2 is a Next.js web app that reads the entire tenant's Copilot Studio estate through **one Entra service principal** — using **Azure Resource Graph** for inventory (owner, env, sharing, model, channels, connectors), the **PPAC Licensing API** (with CSV fallback) for per-agent credit cost, and **Dataverse** only for on-demand deep scans. On that backbone it layers the things native PPAC + Agent 365 and the in-platform competitors don't combine in one standalone tool: **proactive Teams/email alerting**, a stateful **default-env migration tracker**, a **configurable compliance engine** with scoring, **risky-pattern detection**, an honest **maturity assessment**, and **policy-as-code release gates** with signed audit records. It installs in minutes (web app + 1 app reg + ARG read — no Dataverse import into client envs), is validated end-to-end in Elliot's **MVP tenant** first, and ships open-source as the flagship MVP contribution. v1 (Phases -1→2) is the independently shippable core; Phases 3→8 are the governance-platform roadmap.

## Scope
**In scope (full vision)**
- Inventory + default-env sprawl + migration tracker (ARG-backed)
- Cost: per-agent/per-env credit + feature breakdown + capacity/overage + PAYG estimate + CSV fallback
- Proactive alerting (budget, spike, overage, new default-env agent, compliance, unauthorized publish) → Teams/email
- Compliance engine (configurable rules, scoring, violation lifecycle, optional auto-remediation) + risky-pattern detection
- Maturity assessment (controls library, 0-4 scoring, regulatory mapping, honest partial-capped auto-scoring, report + questionnaire)
- Trust & release gates + policy-as-code (YAML policies, unit tests, signed/revocable decision records, optional MCP server)
- Conversation KPI aggregates, App Insights health, lifecycle stages, maker self-service, AI NL-query + summaries
- Reporting: exec overview, tabbed agent detail, weekly governance report (PDF/Teams), deep-scan on demand
- Install-light single-tenant; MVP-tenant-first, then client tenants by granting the app's permissions there

**Out of scope**
- Multi-tenant command center (one instance per tenant — D-011)
- Rebuilding the CS Kit's Dataverse-native test-automation framework
- Writing to client environments (read-only posture; release-gate "enforcement" is advisory/notify, not forced delete unless explicitly enabled)
- M365 declarative agents + Agent 365 agents as first-class objects in v1 (ARG `microsoft.copilotstudio/agents` only; note them as future)
- Invoice-grade per-agent cost (estimated from credit/volume — labelled)

**Assumptions**
- ARG `PowerPlatformResources` is reachable with a PP-admin / Dynamics-365-admin app reg (S-1 proves it)
- PPAC Licensing API yields per-agent or per-env credit; CSV export is the fallback (S-1 proves which)
- MVP tenant has (or will be seeded with) ≥2 Copilot Studio agents for real data
- Transcripts aggregate-only (PII); estimated cost labelled; maturity scoring partial-capped

## Stakeholders
| Name | Role | Responsibility (RACI) | Availability |
|------|------|----------------------|--------------|
| Elliot Margot | Builder / Owner | Responsible + Accountable | ~6–8 h/week part-time |
| MVP tenant | Dev/demo/OSS test bed | — | Elliot-admin |
| ITER (later) | First client pilot | Consulted | via engagement |
| MVP community | OSS audience + talk | Informed | n/a |

---

## Plan Overview

### Phases
| # | Phase | Tasks | Effort | Calendar | Milestone |
|---|-------|-------|--------|----------|-----------|
| -1 | Validation Spike (MVP tenant) | 5 | 10h | Wk 1 | **Data contract proven in MVP tenant** |
| 0 | Foundations (ARG backbone) | 5 | 16h | Wk 1–2 | Auth + ARG ingest + schema |
| 1 | Inventory + Sprawl | 5 | 18h | Wk 2–3 | **Shippable: live inventory + migration tracker** |
| 2 | Cost + Capacity + Alerting | 6 | 26h | Wk 4–5 | **Shippable: cost/capacity watchdog + Teams alerts** |
| 3 | Compliance Engine + Risky Patterns | 5 | 24h | Wk 6–7 | Compliance scoring + violation lifecycle |
| 4 | KPIs + Health + Reporting/Exec | 5 | 24h | Wk 8–9 | Weekly report + exec dashboard |
| 5 | Maturity Assessment Engine | 4 | 22h | Wk 10–11 | Maturity score + assessment report |
| 6 | Release Gates + Policy-as-Code | 5 | 26h | Wk 12–13 | Policy gate + signed decision records |
| 7 | AI Layer + Maker Self-Service | 4 | 20h | Wk 14 | NL query + maker view |
| 8 | OSS Hardening + Publish + Demo | 4 | 16h | Wk 15 | **Public release + talk** |

### Stats
- Total tasks: 48 | Total steps: ~180
- Total effort: 202h (**with 20% buffer: ~242h**)
- **v1 core (Phases -1→2): 70h → ~84h buffered** = the Aug-31-achievable shippable platform
- Critical path to shippable v1: **~46h**
- Parallel tracks: connectors parallelize per-API; compliance/maturity/gates are independent epics post-v1
- External dependencies: 3 (admin consent in MVP tenant, PP-admin role, Teams/email channel)

---

## Detailed Plan

### Phase -1 — Validation Spike (MVP tenant) — proves the data contract, BLOCKS build

#### T-001: Create AgentLens app registration in the MVP tenant
**Phase**: -1 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P0 · **Depends on**: none · **Blocked by**: MVP-tenant admin consent (self)
**Description**: The single service principal AgentLens uses for everything, created in Elliot's MVP tenant — the dev/demo/OSS bed.
**Steps**:
- [ ] Register `AgentLens-Reader` in the MVP tenant; client secret (dev) (20m)
- [ ] Add app perms: **Azure Resource Graph / ARM read** (`https://management.azure.com/user_impersonation` or app role for ARG), **Power Platform API** (`https://api.powerplatform.com/.default`), **Graph** `User.Read.All`, PPAC Licensing (`https://api.powerplatform.com`) (40m)
- [ ] Assign the SP a **Power Platform administrator** (or Dynamics 365 admin) directory role — required for ARG `PowerPlatformResources` + the licensing API (30m)
- [ ] Admin-consent; record tenant/client IDs (30m)
**Deliverable**: Consented app reg in the MVP tenant + permission matrix in /docs.
**Acceptance criteria**: [ ] Client-credentials token acquired for ARG + Power Platform API + Graph · [ ] SP holds PP-admin role
**Risks**: ARG access for a service principal may need the directory role *and* an Azure RBAC reader at tenant root — verify in S-1; if SP-on-ARG is blocked, fall back to a delegated token for the spike.
**Notes**: This single app reg IS the entire identity-side install — no per-env app users (ARG removes that).

#### T-002: S-1 — Prove the ARG agent inventory query
**Phase**: -1 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P0 · **Depends on**: T-001 · **Blocked by**: none
**Description**: Confirm the headline assumption — that one Azure Resource Graph query returns the MVP tenant's agents with the fields AgentLens needs.
**Steps**:
- [ ] POST ARG `/providers/Microsoft.ResourceGraph/resources` with `PowerPlatformResources | where type == 'microsoft.copilotstudio/agents'` (45m)
- [ ] Verify fields present: ownerId, environmentId, isDefault, channels, model, authentication, sharedWith*, capabilitiesCounts, lastPublishedAt, orchestration (45m)
- [ ] Record the real response shape + any null/preview fields (30m)
**Deliverable**: A captured ARG response sample + field-availability table.
**Acceptance criteria**: [ ] ≥1 agent returned with owner + env + sharing fields · [ ] Field table recorded
**Risks**: If the MVP tenant has 0 agents → seed first (T-005). If a field is preview/null → note and degrade gracefully.

#### T-003: S-1 — Prove the cost/credit data path
**Phase**: -1 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-001 · **Blocked by**: none
**Description**: The #1 risk (R-001). Determine whether per-agent/per-env credit consumption is reachable via the PPAC Licensing API, and confirm the CSV-export fallback shape.
**Steps**:
- [ ] Call the Power Platform / PPAC Licensing API for Copilot Studio credit consumption; capture granularity (per-agent? per-env? per-feature?) (1.5h — learning, 2x)
- [ ] Export the PPAC credit CSV manually; record its columns as the fallback contract (45m)
- [ ] Decide v1 cost source: API if per-agent works, else env-level API + CSV per-agent (45m)
**Deliverable**: "Cost data reality" one-pager — what's available, at what granularity, via which path.
**Acceptance criteria**: [ ] Per-agent OR per-env credit obtained via API · [ ] CSV fallback columns documented · [ ] v1 cost source decided
**Risks**: API may be undocumented/limited (the known gap) — the CSV fallback guarantees a path regardless.
**Notes**: sbrakni + the CS Kit AgentInventoryUsage both pull credit here — proven, just under-documented.

#### T-004: S-1 — Prove Dataverse deep-scan + decide app-data residency/auth
**Phase**: -1 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P0 · **Depends on**: T-001 · **Blocked by**: none
**Description**: Confirm the one thing ARG doesn't give (deep per-agent config via Dataverse `bot`/`botcomponent`), and lock the two governance-of-the-governance-tool decisions.
**Steps**:
- [ ] Query Dataverse `bot`/`botcomponent` in one MVP env for fields ARG lacks (instructions, knowledge sources, connector detail) (45m)
- [ ] Decide AgentLens's own data store + region (D-010) and app login (Entra SSO — D-009) (45m)
- [ ] Confirm "agent" v1 scope = `microsoft.copilotstudio/agents` only (D-008) (30m)
**Deliverable**: Deep-scan field list + signed-off D-008/009/010.
**Acceptance criteria**: [ ] Deep-scan returns config fields · [ ] Data-residency + app-auth decided
**Risks**: Deep-scan needs a per-env read (a Dataverse app user) — but only for opt-in deep scans, not the core inventory (ARG covers that), so it's a feature flag, not an install blocker.

#### T-005: Seed the MVP tenant with test agents (if empty)
**Phase**: -1 · **Owner**: Elliot · **Effort**: 1h · **Priority**: P1 · **Depends on**: none · **Blocked by**: none
**Description**: Ensure there's real, varied data to render and demo — agents with different auth modes, channels, and a default-env one for the sprawl view.
**Steps**:
- [ ] Create 2–3 Copilot Studio agents in the MVP tenant (one default-env, one Entra-auth, one anonymous) (45m)
- [ ] Run a few test conversations to generate credit/transcript data (15m)
**Deliverable**: ≥2 seed agents with telemetry.
**Acceptance criteria**: [ ] Agents appear in the ARG query (T-002) · [ ] At least one in the default env
**Risks**: Seeded credit may take hours to surface — seed early in the spike.

---

### Phase 0 — Foundations (ARG backbone)

#### T-010: Repo upgrade + config + Supabase schema v2
**Phase**: 0 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-002,T-003 · **Blocked by**: none
**Description**: Evolve the existing barebones schema/config to the v2 data model (adds credit, capacity, compliance, alerts, migration, assessment, gate-decision tables).
**Steps**:
- [ ] Supabase migration `0002`: tables — `environments`, `agents`, `agent_metrics_daily`, `env_capacity`, `compliance_rules`, `compliance_violations`, `alerts`, `migration_tracker`, `assessment_controls`, `assessment_results`, `gate_policies`, `gate_decisions`, `ingestion_runs`, `config` (2h)
- [ ] Indexes + RLS scaffolding (maker self-service later) (1h)
- [ ] `.env` wired to the MVP tenant (tenant/client id, secret, ARG scope, Supabase) (1h)
**Deliverable**: Migration 0002 + MVP-tenant `.env`.
**Acceptance criteria**: [ ] Migrations apply clean · [ ] Config points at the MVP tenant
**Risks**: Schema churn — keep metrics in daily fact tables to absorb new measures.

#### T-011: Token service (multi-audience, MVP tenant)
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-001 · **Blocked by**: none
**Description**: Fill the existing `tokenService` stub — MSAL client-credentials with per-audience cache for ARG/ARM, Power Platform API, Graph, and (deep-scan) per-org Dataverse.
**Steps**: [ ] ARG/ARM + PP API + Graph audiences (1.5h) · [ ] per-org Dataverse audience for deep scan (45m) · [ ] cache + tests (45m)
**Deliverable**: Working `lib/auth/tokenService.ts`.
**Acceptance criteria**: [ ] Tokens for ARG + PP API + Graph against the MVP tenant
**Risks**: Per-audience errors → covered by S-1 smoke.

#### T-012: ARG connector (inventory backbone)
**Phase**: 0 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-002,T-011 · **Blocked by**: none
**Description**: The core data source — `lib/connectors/argInventory.ts` querying `PowerPlatformResources` and normalizing to the `Agent` + `Environment` DTOs.
**Steps**: [ ] ARG query + paging (1.5h) · [ ] normalize agents (owner, env, isDefault, sharing, model, auth, connectors) (1.5h) · [ ] environments + env groups (1h)
**Deliverable**: `argInventory.ts`.
**Acceptance criteria**: [ ] Returns all MVP-tenant agents normalized · [ ] `isDefault` populated
**Risks**: ARG schema drift — pin + snapshot-test.
**Notes**: Replaces the v1 per-env `dataverse.getAgents` for inventory; Dataverse kept only for deep scan.

#### T-013: Ingestion orchestrator v2 + scheduler
**Phase**: 0 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P0 · **Depends on**: T-012 · **Blocked by**: none
**Description**: ARG-backed ingest (one tenant query, no fan-out) + the run ledger + Vercel Cron + on-demand `/api/ingest`.
**Steps**: [ ] orchestrator pulls ARG → upsert agents/envs (1.5h) · [ ] `ingestion_runs` ledger (45m) · [ ] cron + protected route (45m)
**Deliverable**: Scheduled tenant-wide ingest.
**Acceptance criteria**: [ ] Full ingest populates Supabase · [ ] Run recorded
**Risks**: ARG throttling — single query is light; back-off on 429.

#### T-014: Graph owner-resolution + owner enrichment
**Phase**: 0 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P1 · **Depends on**: T-012 · **Blocked by**: none
**Description**: Resolve ARG `ownerId`/`createdBy` GUIDs → names/emails via Graph batch (for the inventory, sprawl owners, and notifications).
**Steps**: [ ] Graph batch resolve + cache (1.5h) · [ ] enrich agents (30m)
**Deliverable**: `graph.resolveOwners`.
**Acceptance criteria**: [ ] Agents show owner name + email
**Risks**: Graph throttling — batch + cache.

---

### Phase 1 — Inventory + Sprawl (shippable)

#### T-020: Inventory UI (ARG-backed) — P0, 4h, deps T-013
Filterable/sortable table of every agent (env, owner, state, model, auth, channels, last activity), summary KPI cards. **Deliverable**: Inventory page. **Acceptance**: all MVP agents listed; filter default-env. **Risk**: large tenants → server pagination.
#### T-021: Default-env Sprawl + Migration tracker — P0, 4h, deps T-020
Default-env agents with owners; migration state machine (to_migrate/notified/moved) in `migration_tracker`; progress rollup. **Deliverable**: Sprawl page. **Acceptance**: state persists + rolls up. **Risk**: orphans (no owner) surfaced explicitly.
#### T-022: Agent detail drawer (tabbed shell) — P1, 4h, deps T-020
Tabbed view: Overview / Knowledge / Credits / Compliance / Analytics (Credits/Compliance fill in later phases). **Deliverable**: detail drawer. **Acceptance**: Overview tab renders ARG fields.
#### T-023: Read API + Zustand store wiring — P1, 3h, deps T-013
`/api/agents`, `/api/environments`; client store; "Refresh" triggers on-demand ingest. **Deliverable**: read endpoints. **Acceptance**: UI reads from Supabase fast.
#### T-024: Sharing audit + orphan view (from ARG) — P1, 3h, deps T-020
Surface `sharedWithViewers/Editors` + entire-tenant shares + ownerless agents (ARG already has these). **Deliverable**: Sharing/orphan view. **Acceptance**: entire-tenant-shared agents flagged.

---

### Phase 2 — Cost + Capacity + Alerting (shippable)

#### T-030: Credit cost connector (Licensing API + CSV fallback) — P0, 5h, deps T-003
Per-agent/per-env daily credit from the PPAC Licensing API; CSV-import parser as fallback; feature-level split (Generative Answers, Agent Actions, Agent Flows, Text Tools). **Deliverable**: `cost.ts` + CSV importer. **Acceptance**: daily credit persisted (API or CSV); feature breakdown captured. **Risk**: R-001 — CSV guarantees a path.
#### T-031: Metrics history, MTD + projected monthly — P1, 3h, deps T-030
`agent_metrics_daily` rollups; 7/30-day baselines; month-to-date + projected monthly total. **Deliverable**: baseline/trend queries. **Acceptance**: projection computed per agent.
#### T-032: Environment capacity monitoring — P1, 4h, deps T-030
Per-env credit capacity vs consumption; overage detection; capacity gauges. **Deliverable**: `env_capacity` + gauge UI. **Acceptance**: overage flagged at threshold.
#### T-033: Rule/alert engine — P0, 5h, deps T-031,T-032
Diff vs baseline; rules: budget breach, volume/credit spike (>3x 7-day), env overage, new default-env agent, high-consumption, model-meter mismatch, orphan/idle. Severity + dedupe + cooldown. **Deliverable**: `alerts/engine.ts`. **Acceptance**: simulated 3x spike raises one alert.
#### T-034: Teams + email dispatch (severity routing) — P1, 4h, deps T-033
Adaptive Cards w/ deep links; routing Critical→Teams+Email, High→Teams, Med/Low→in-app; config-driven channel. **Deliverable**: alert delivery. **Acceptance**: test alert lands in Teams + inbox.
#### T-035: Cost + Alerts UI — P1, 5h, deps T-031,T-033
Cost dashboard (top burners, Δ vs baseline, projections, feature split), capacity gauges, alerts page w/ ack + bulk ops. **Deliverable**: Cost + Alerts pages. **Acceptance**: top burners ranked; anomalies badged; "estimated" labelled.

---

### Phase 3 — Compliance Engine + Risky-Pattern Detection (advanced)

#### T-040: Compliance rule model + seed rules — P1, 5h, deps T-013
Data-driven rules (`compliance_rules`): types Authentication / Data-Loss / Knowledge-Source / Channel / Connector; severity Critical/Warning/Info; ship a default rule pack. **Deliverable**: rule schema + seed pack. **Acceptance**: rules editable; seed pack loads.
#### T-041: Compliance evaluator (runs each sync) — P1, 5h, deps T-040
Evaluate every agent against rules on each ingest; write `compliance_violations`; lifecycle Open→Ack→Resolved/Suppressed. **Deliverable**: evaluator. **Acceptance**: violations created + transition through lifecycle.
#### T-042: Risky-pattern detection — P1, 5h, deps T-012
Flag autonomous (generative) agents, maker-cred usage, HTTP-request actions, anonymous/no-auth, computer-use, entire-tenant shares, risky connectors (mostly from ARG `authentication`/`capabilitiesCounts`/`orchestration`). **Deliverable**: pattern rules + flags. **Acceptance**: each pattern detectable on seed data.
#### T-043: Compliance scoring (agent + tenant) — P2, 4h, deps T-041
Weighted score per agent + tenant rollup; compliance badges in UI. **Deliverable**: scoring + badges. **Acceptance**: tenant score + per-agent badges render.
#### T-044: Compliance center UI + optional auto-remediation — P2, 5h, deps T-041
Rule management, violation queue w/ bulk ops; opt-in auto-remediation (advisory/notify by default; forced actions feature-flagged off). **Deliverable**: Compliance Center. **Acceptance**: rules managed; violations actioned. **Risk**: auto-remediation is dangerous → default advisory only.

---

### Phase 4 — KPIs + Health + Reporting/Exec (advanced)

#### T-050: Conversation KPI aggregates (PII-safe) — P2, 6h, deps T-011
Dataverse `$apply` aggregates (volume/deflection/escalation by day/agent); never store content. **Acceptance**: trends render; zero raw transcript stored. **Risk**: R-002 PII → aggregate-only.
#### T-051: App Insights health — P2, 6h, deps T-011
KQL over App Insights for agent error/latency/failed-sessions where wired. **Acceptance**: per-agent health where App Insights exists.
#### T-052: Executive overview dashboard — P2, 4h, deps T-035,T-043
KPI cards + trend charts (agents, cost, compliance score, alerts, capacity). **Acceptance**: one-glance tenant posture.
#### T-053: Weekly governance report (PDF + Teams) — P2, 5h, deps T-052
Auto-generated weekly summary → email/Teams + PDF (reuse JumpStart doc-gen patterns). **Acceptance**: scheduled weekly report delivered.
#### T-054: Deep-scan on demand — P2, 3h, deps T-022
On-demand Dataverse deep scan for one agent (knowledge sources, instructions, connector detail) into the detail drawer. **Acceptance**: deep scan populates Knowledge tab.

---

### Phase 5 — Maturity Assessment Engine (advanced)

#### T-060: Controls library + governance pillars/zones — P2, 6h, deps T-013
Controls across Security/Management/Reporting pillars, tiered zones; map controls → telemetry signals already collected. **Acceptance**: control library loads; signals mapped.
#### T-061: Maturity scoring 0-4 (honest partial-cap) — P2, 6h, deps T-060
Score each control 0-4 against zone thresholds; **partial-capped auto-scoring** — telemetry never asserts full compliance, always cites residual manual/attestation burden. **Acceptance**: scores never return "full" from telemetry alone; residual cited. **Risk**: false assurance → the partial-cap principle is mandatory.
#### T-062: Regulatory mapping + assessment report + questionnaire — P3, 6h, deps T-061
Regulation→control map; report generator (auto-filled telemetry controls + manual questionnaire for attestation controls) + RACI/checklist. **Acceptance**: report distinguishes auto vs manual evidence.
#### T-063: Maturity dashboard — P3, 4h, deps T-061
Pillar/zone heatmap + maturity trend. **Acceptance**: maturity visualized over time.

---

### Phase 6 — Release Gates + Policy-as-Code (advanced)

#### T-070: Policy-as-code engine (YAML) — P2, 6h, deps T-013
YAML policy schema (conditions over agent/compliance/cost fields) + evaluator + policy unit tests. **Acceptance**: a sample policy evaluates against an agent; unit tests pass.
#### T-071: Release / prod-entry gate — P2, 6h, deps T-070
Evaluate an agent against policies before promotion (PoC→pilot→prod); pass/block verdict + prod-entry checklist enforcement; advisory-by-default (notify, don't force). **Acceptance**: an unready agent is blocked w/ reasons.
#### T-072: Signed decision records + audit replay + revocation — P3, 5h, deps T-071
HMAC-signed `gate_decisions`; audit replay; revoke (keeps original signed payload for replay). **Acceptance**: decision verifiable + revocable.
#### T-073: Inbound trust gate (external/A2A) — P3, 4h, deps T-070
Evaluate external/A2A agents (signature/registration) before trust. **Acceptance**: unsigned external agent blocked. **Notes**: lower priority for single-tenant internal focus.
#### T-074: Optional MCP server (verdict query) — P3, 5h, deps T-071
Expose AgentLens governance verdicts via an MCP server so Copilot Studio agents can query them. **Acceptance**: MCP returns a verdict for an agent. **Notes**: showcase feature; ties to Elliot's MCP work.

---

### Phase 7 — AI Layer + Maker Self-Service (advanced)

#### T-080: NL query (text-to-SQL, constrained) — P2, 6h, deps T-020
Claude/Ollama → read-only SQL over an allowlisted Supabase schema; Claude for tenant data, Ollama only on anonymized. **Acceptance**: "default-env agents over $50/mo" returns correct rows. **Risk**: over-reach → read-only role + allowlist + validation.
#### T-081: AI governance summaries + recommendations — P3, 4h, deps T-043,T-061
Scheduled AI posture summary + retire/migrate/optimize recs, grounded strictly on DB rows. **Acceptance**: actionable recs generated.
#### T-082: Maker self-service (role-aware RLS) — P3, 5h, deps T-014
Supabase RLS + Entra SSO so makers see only their own agents' cost/health/compliance. **Acceptance**: maker sees only owned agents.
#### T-083: Lifecycle stages + prod-entry checklist — P2, 5h, deps T-021
Maturity stage per agent (PoC→pilot→prod) + checklist (feeds the release gate). **Acceptance**: stage + checklist persist.

---

### Phase 8 — OSS Hardening + Publish + Demo

#### T-090: Docs + install guide — P1, 5h
README, architecture, the install (web app + 1 app reg + ARG), permission matrix, screenshots from the MVP tenant. **Acceptance**: a stranger installs from docs.
#### T-091: Install/setup wizard + config UI — P1, 5h, deps T-010
In-app setup (tenant id, app reg, Teams webhook, thresholds, rule packs). **Acceptance**: green-field setup < 20 min.
#### T-092: Branding, license, public release — P1, 3h
MIT (pending IP clearance — R-010), logo, GitHub release, topics → log MVP OSS contribution. **Acceptance**: public repo + tagged release.
#### T-093: Demo + community talk prep — P2, 3h, deps T-021,T-035
Demo script + slides ("standalone, alerting-first alternative to the Kit, built on the new ARG inventory"), recorded from the MVP tenant. **Acceptance**: 10-min demo runs end-to-end.

---

## Dependency Map (critical/early)
| Task | Depends On | Blocks | Parallel With | Wait Time |
|------|-----------|--------|---------------|-----------|
| T-001 | none | T-002,T-003,T-004,T-011 | T-005 | MVP admin consent |
| T-002 | T-001 | T-012 | T-003,T-004 | — |
| T-003 | T-001 | T-030 | T-002,T-004 | — |
| T-004 | T-001 | T-054 | T-002,T-003 | — |
| T-005 | none | T-002 (data) | T-001 | credit lag |
| T-010 | T-002,T-003 | T-011..T-013 | — | — |
| T-011 | T-001 | T-012,T-050,T-051 | T-010 | — |
| T-012 | T-002,T-011 | T-013,T-020,T-042 | — | — |
| T-013 | T-012 | T-020,T-030,T-040,T-060,T-070 | T-014 | — |
| T-020 | T-013 | T-021,T-022,T-024,T-080 | — | — |
| T-030 | T-003,T-013 | T-031,T-032 | — | — |
| T-033 | T-031,T-032 | T-034,T-035 | — | — |

## Critical Path
```
T-001 (2h) → T-002 (2h) → T-012 (4h) → T-013 (3h) → T-030 (5h) → T-031 (3h) → T-033 (5h) → T-035 (5h)
Spine to shippable cost+alerting v1 ≈ 29h + Phase-1 inventory/sprawl UI on path ≈ 46h.
With 20% buffer: ~55h to a demo-able, shippable v1 (Phases -1→2).
```
**Real-time wait:** alerts need ≥7 days of metric history — start ingestion (Phase 0/1) early so baselines accrue while Phase 2 UI is built.

## Timeline (vs Aug 31 MVP-OSS anchor, ~6–8h/week)
| Weeks | Phases | Hours | Milestone |
|-------|--------|-------|-----------|
| Wk 1 | -1 (spike) + start 0 | 14h | **Data contract proven in MVP tenant** |
| Wk 2–3 | 0 + 1 | 30h | **Shippable: inventory + sprawl/migration; ingestion live** |
| Wk 4–5 | 2 | 26h | **Shippable: cost/capacity watchdog + Teams alerts** ← v1 done (~Aug) |
| Wk 6–7 | 3 | 24h | Compliance engine + risky patterns |
| Wk 8–9 | 4 | 24h | KPIs + health + weekly report + exec |
| Wk 10–11 | 5 | 22h | Maturity assessment |
| Wk 12–13 | 6 | 26h | Release gates + policy-as-code |
| Wk 14 | 7 | 20h | AI + maker view |
| Wk 15 | 8 | 16h | **Public OSS release + demo** |

**v1 (Phases -1→2) lands within the Aug-31 window; Phases 3–8 are the post-v1 governance-platform roadmap.**

---

## Risk Register
| # | Risk | L | I | Mitigation | Owner |
|---|------|---|---|------------|-------|
| R-001 | Per-agent credit cost not cleanly API-exposed | M | H | Licensing API + **CSV-import fallback** (proven by sbrakni + CS Kit); env-level if per-agent fails; label estimated | Elliot |
| R-002 | Transcript PII / volume | H | H | Aggregate-only via `$apply`; no content stored | Elliot |
| R-003 | ~~Per-env app-user provisioning friction~~ **RETIRED** — ARG removes it | — | — | ARG `PowerPlatformResources` is tenant-wide; deep-scan app-user is opt-in only | Elliot |
| R-004 | Serverless timeouts on ingest | L | M | ARG is one light query (not fan-out); back-off; Azure Functions path documented | Elliot |
| R-005 | ARG / Licensing API schema drift | M | M | Pin api-versions; snapshot-test DTOs | Elliot |
| R-006 | Token/ARG-RBAC for the SP blocked | M | H | S-1 proves SP-on-ARG; delegated-token fallback for spike; PP-admin role assigned | Elliot |
| R-007 | Capacity: client load starves the build | H | M | Phase to shippable at Phase 2; each phase independent | Elliot |
| R-008 | Tenant data → 3rd-party model (Ollama) | L | H | Claude-direct for tenant data; Ollama only anonymized | Elliot |
| R-009 | Cost-data contract unproven before build | M | H | Phase -1 S-1 spike gates all build | Elliot |
| R-010 | IP ownership (personal vs Witivio) blocks OSS publish | M | M | Clarify with Witivio before T-092; stays private until resolved | Elliot |
| R-011 | Agent 365 / native PPAC obsoletes scope | M | M | Position as complement; durable wedge = standalone form + alerting + migration + policy-as-code gates + honest maturity (native + competitors don't combine these) | Elliot |
| R-012 | AgentLens itself ungoverned (god-mode SP + PII in 3rd-party DB) | M | H | Read-only SP, least-priv, data-residency decision (D-010), no transcript content | Elliot |
| R-013 | Crowded 0-star space — low OSS traction | M | L | Build for Elliot's own use + MVP credibility first; traction is upside, not the goal | Elliot |
| R-014 | Auto-remediation / forced gate actions cause harm | M | H | Advisory/notify by default; forced actions feature-flagged OFF; read-only client posture | Elliot |

## Decision Log
| # | Decision | Date | Rationale |
|---|----------|------|-----------|
| D-001 | DB = Supabase/Postgres | 2026-06-12 | History for baselines, stateful migration/violations/gates, rate-limit shield |
| D-002 | OSS deploy = Vercel + Supabase; Azure path documented | 2026-06-12 | Lightest for OSS/MVP; Azure for client residency |
| D-003 | v1 = inventory + sprawl + cost + alerting (Phases -1→2) | 2026-06-12 | ITER pain; independently shippable |
| D-004 | Cost v1 = estimated (credit/volume) + CSV fallback | 2026-06-12 | Invoice-grade not exposed (R-001) |
| D-005 | Transcripts aggregate-only | 2026-06-12 | PII (R-002) |
| D-006 | Install = 1 Entra app reg + ARG (read-only) | 2026-06-12 | The "easier than the Kit" core |
| D-007 | Decline CS Kit test-automation + PowerShield approval workflows | 2026-06-12 | Off-goal, Dataverse-native |
| D-008 | "Agent" v1 = `microsoft.copilotstudio/agents` only | 2026-06-12 | ARG type; M365/Agent365 future |
| D-009 | App auth = Entra SSO from day 0 | 2026-06-12 | Admin surface needs authn/authz |
| D-010 | App data store + region decided in Phase -1 | 2026-06-12 | Self-governance / client DPO |
| D-011 | One instance per client tenant | 2026-06-12 | Isolation/residency |
| **D-012** | **Inventory backbone = Azure Resource Graph (`PowerPlatformResources`)** | 2026-06-12 | Microsoft now exposes whole-tenant agents in one query → kills per-env fan-out + app-user provisioning (retires R-003) |
| **D-013** | **Cost = PPAC Licensing API + manual CSV fallback** | 2026-06-12 | Proven path (sbrakni + CS Kit AgentInventoryUsage); CSV guarantees a route |
| **D-014** | **Validate in MVP tenant first (dev/demo/OSS bed), then client tenants** | 2026-06-12 | Safe, real data, no client risk during build |
| **D-015** | **Release-gate + auto-remediation actions are advisory/notify by default; forced actions feature-flagged OFF** | 2026-06-12 | Read-only posture; avoid harm in client tenants (R-014) |
| **D-016** | **Maturity auto-scoring is partial-capped (never asserts full compliance from telemetry)** | 2026-06-12 | Honesty — adopted from FSI-AgentGov; avoids false assurance |
| **D-017** | **Standalone Next.js web app form (not a Power Platform solution)** | 2026-06-12 | The differentiator vs sbrakni/the Kit (in-platform); install-light |

## Open Questions
- [ ] IP: personal or Witivio-owned? (gates OSS publish — R-010)
- [ ] Does the MVP-tenant SP get ARG access via directory role alone, or also Azure RBAC at root? (S-1 / R-006)
- [ ] Per-agent credit from the Licensing API, or env-level + CSV per-agent? (S-1 — T-003)
- [ ] Does ITER's DPO accept the app's data store/region when it goes to a client? (D-010)
- [ ] Product name: AgentLens, or something else (brand/namespace check)?
- [ ] How far to take release gates / MCP server for a single-tenant internal tool (Phase 6 priority)?

## Success Criteria
- [ ] Installs on a fresh tenant in **< 20 min** (web app + 1 app reg + ARG; no Dataverse import)
- [ ] **One ARG query** renders every agent across the tenant with owner + env + sharing
- [ ] **Default-env migration tracker** shows owners + persists migration state (ITER worklist)
- [ ] A simulated cost/credit spike fires a **Teams + email alert** within one ingest cycle
- [ ] **Compliance score** + violations render; risky patterns (anonymous, maker-cred, autonomous) flagged
- [ ] **Maturity report** distinguishes auto-derived vs manual-attestation evidence (partial-capped)
- [ ] A **release gate** blocks an unready agent with reasons + a signed decision record
- [ ] Validated end-to-end **in the MVP tenant**; deployable to a client by granting permissions
- [ ] Published **open-source** (MIT, IP cleared) → MVP OSS contribution logged; **10-min demo** recorded
- [ ] Honest labelling throughout (estimated cost; partial-capped maturity; aggregate-only transcripts)
