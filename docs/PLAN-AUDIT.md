# AgentLens — Feature Audit & "Make It Real" Plan
Date: 2026-06-12 | Owner: Elliot Margot | Status: Draft
Objective: Every feature shows **real tenant data or an honest "not connected" state — never mock dressed as real**; the standalone Live page is removed and **Overview becomes the real, ARG-driven landing**; the DEMO banner is retired page-by-page as each feature goes real.

---

## Executive Summary
AgentLens v2 is fully built but **14 of 17 pages render mock seed data** — only Live (MVP), Agent Discovery, and Ask (AI) touch the real tenant (via Azure Resource Graph). A mock Cost page recently read as real spend and alarmed the owner. This plan audits each feature against reality, then makes them real in priority order: first the ones already sourceable from ARG (Overview, Inventory, Sprawl, Compliance, Risky Patterns, Maturity, Maker View — no new connection needed), then the ones needing extra sources (Conversation KPIs = transcript analysis, Cost = Licensing API, Health = App Insights). Structurally, the Live page is deleted and its real ARG data moves into Overview so the landing page is real from the first click. Each phase retires the DEMO banner from more pages until it's gone.

## Scope
**In scope:** delete Live page → Overview becomes real ARG landing; wire every ARG-sourceable feature to real data; build real Conversation-KPI transcript analysis (intent/sentiment); honest "not connected" states for Cost/Health until their sources are wired; retire the DEMO banner per page.
**Out of scope:** the multi-source discovery itself (already built); Agent 365 / Foundry / Fabric live data (license/token-gated, already degrade gracefully); production hosting/IP/OSS publish.
**Assumptions:** ARG token (or app-reg SP) available; Supabase for stateful features; transcript analysis is aggregate-only (store signal counts, never raw content).

## Stakeholders
| Name | Role | RACI | Availability |
|---|---|---|---|
| Elliot Margot | Builder/Owner | R+A | ~6–8 h/wk |
| MVP tenant | Real-data test bed | C | self-admin |

---

## FEATURE AUDIT (grounded in the code)

Legend: **MOCK** = renders seed data · **PARTIAL** = live impl exists but falls back to mock / shallow · **REAL** = real tenant data.

| Feature | Today | Real source | Real logic needed | Real NOW? | Effort |
|---|---|---|---|---|---|
| **Live (MVP)** | REAL (ARG) | — | **DELETE** — fold into Overview | — | — |
| **Overview** | MOCK (computeExecPosture over seed) | ARG (agents, envs, resource counts) | Real agent/env/resource KPIs; label cost/compliance KPIs "demo" inline until wired | ✅ now | 6h |
| **Inventory** | MOCK | ARG agents (owner, env, model, auth, channels, sharing) | Same query Discovery uses; filters/sort over real rows | ✅ now | 4h |
| **Sprawl + Migration** | MOCK | ARG default-env agents + Supabase | Real default-env list + stateful migration tracker (to_migrate→notified→moved) | ✅ now (state needs Supabase) | 5h |
| **Compliance** | MOCK | ARG agent fields | Evaluate rule pack vs real fields (auth mode, sharing, connectors); violation lifecycle | ✅ now | 6h |
| **Risky Patterns** | MOCK | ARG `authentication`/`orchestration`/`capabilitiesCounts`/`sharedWith*` | Detect anonymous-auth, generative/autonomous, entire-tenant-shared, maker-cred, risky-connector — all present in ARG | ✅ now | 4h |
| **Maturity** | MOCK | ARG-derived signals | Partial-capped scoring from real signals (auth coverage, owner coverage, sharing, DLP) — never assert "full" | ✅ now | 5h |
| **Maker View** | MOCK | ARG agents filtered by owner | Role-aware: signed-in user → their ARG agents only | ✅ now (needs app auth) | 5h |
| **Conversation KPIs** | PARTIAL (native aggregates live, falls back to mock) + **NO content analysis** | Dataverse `msdyn_conversationkpis` (aggregates) + `conversationtranscript` (content) | KEEP native deflection/escalation; **ADD transcript intent/sentiment**: detect gratitude ("thanks","that helped"), resolution ("solved","that worked","perfect"), escalation ("talk to a human","representative"), frustration/negative, abandonment → compute resolution rate, CSAT proxy, escalation rate, frustration rate per agent. Store **only aggregate signal counts** (PII-safe). | partial now / content needs transcripts | 12h |
| **Cost + Capacity** | MOCK (convincing fake money) | PPAC Licensing API (+ CSV fallback) | Per-agent credit; until wired show honest "Cost not connected — needs Licensing connection / CSV import". **Stop showing fake $.** | needs licensing | 8h |
| **Health** | MOCK | Azure Application Insights (KQL) | Error rate / latency / failed sessions per agent; honest "App Insights not connected" otherwise | needs App Insights | 8h |
| **Alerts** | MOCK | Supabase metric history + alert engine | Engine over **real** baselines; no fake alerts until history exists | needs ingestion | 6h |
| **Release Gates** | MOCK | ARG agents + policy engine | Evaluate YAML policies vs real agents; signed decisions | ✅ now (eval) | 5h |
| **Lifecycle** | MOCK | Supabase | Stage (PoC/pilot/prod) + prod-entry checklist persisted | needs Supabase | 4h |
| **Settings** | MOCK form | app config | Real config: tenant/app-reg/tokens/thresholds/source toggles | partial | 5h |
| **Agent Discovery** | REAL | ARG (+ Graph/Foundry/Fabric gated) | — keep | ✅ | — |
| **Ask (AI)** | REAL | ARG + Azure OpenAI | — keep | ✅ | — |

**Connector reality (lib/):** `argInventory`/`discovery`/`ask` real; `kpis` has a real Dataverse `$apply` impl + mock fallback (shallow — counts only); `cost`/`appInsights`/`health`/`dataverse`/`ppApi`/`nlQuery`/`summaries`/`tokenService` are TODO stubs or mock-fallback.

---

## Plan Overview
| # | Phase | Tasks | Effort | Milestone |
|---|-------|-------|--------|-----------|
| 0 | Restructure: kill Live, real Overview | 3 | 12h | **Landing page is REAL; banner off Overview** |
| 1 | ARG-NOW features real | 6 | 30h | Inventory/Sprawl/Compliance/Risky/Maturity/MakerView real; banner off them |
| 2 | Conversation KPIs (transcript intel) | 4 | 16h | Real thank-you/resolution/escalation detection |
| 3 | Cost + Capacity honest | 2 | 10h | Real cost OR honest "not connected" — no fake $ |
| 4 | Health + Alerts real | 3 | 16h | App Insights health; real alert engine |
| 5 | Lifecycle/Gates/Settings real | 3 | 14h | Stateful + policy-on-real-agents |
| 6 | Honesty pass: retire DEMO banner | 2 | 6h | **Banner gone; every page real or honest-empty** |

**Stats:** 23 tasks · **104h (+20% = ~125h)** · critical path ≈ Phase 0→1 (42h) · the ARG-NOW phase is the big unlock (7 pages real with no new connection).

---

## Detailed Plan (early phases full; later phases lighter)

### Phase 0 — Restructure: delete Live, make Overview real

#### T-001: Delete Live page + nav item; redirect /live → /
**Phase**: 0 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P0 · **Depends on**: none
**Steps**:
- [ ] Remove `app/(dashboard)/live/page.tsx`; add a redirect (`redirect('/')`) for any bookmarks (30m)
- [ ] Remove "Live (MVP)" from `NAV_GROUPS` in layout (15m)
- [ ] Remove `/live` from `REAL_DATA_ROUTES`; add `/` (since Overview becomes real) (15m)
- [ ] Keep `/api/live` route (Overview will reuse its ARG query) or fold into a shared `lib/connectors/argLive.ts` (1h)
**Deliverable**: No Live page; Overview slot ready.
**Acceptance**: [ ] `/live` redirects to `/` · [ ] nav has no Live item
**Risks**: Overview not yet real when banner removed → sequence T-002 before flipping the banner.

#### T-002: Overview → real ARG landing
**Phase**: 0 · **Owner**: Elliot · **Effort**: 6h · **Priority**: P0 · **Depends on**: T-001
**Description**: Replace `computeExecPosture(mockSeed)` with real ARG data: real total agents, real environments, real resource inventory, default-env count, orphan (no-owner) count. KPIs that can't be real yet (cost, compliance score, maturity) are rendered with an inline "demo" chip rather than faking the whole page.
**Steps**:
- [ ] New `/api/overview` (or reuse `/api/live` + `/api/discover`) returning real agent/env/resource summary (1.5h)
- [ ] Rewrite Overview to consume it: real KPI cards (agents, envs, default-env, orphans, connectors) (2h)
- [ ] Real charts where possible (agents by env, by platform); demo-chip the cost/compliance/maturity cards (1.5h)
- [ ] Loading + honest empty states (1h)
**Deliverable**: Overview shows real tenant posture.
**Acceptance**: [ ] Agent/env counts match the ARG probe · [ ] No un-labelled fake numbers
**Risks**: 0 agents in MVP tenant → design a real-but-empty state (not a fake one).

#### T-003: Remove DEMO banner from Overview (+ keep on still-mock pages)
**Phase**: 0 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P1 · **Depends on**: T-002
**Description**: Make the banner page-aware: only show on pages still using mock. Introduce a per-page `dataState` ('real' | 'partial' | 'demo') the layout reads, so retiring the banner is a one-line flip per page as each goes real.
**Steps**: [ ] Add a `dataState` mechanism (route map or context) (1.5h) · [ ] Banner reads it; Overview→real (1h) · [ ] "partial" variant for inline-demo'd KPIs (1.5h)
**Deliverable**: Banner driven by per-page data state.
**Acceptance**: [ ] Overview banner gone · [ ] mock pages still bannered

### Phase 1 — ARG-NOW features (real with no new connection)

#### T-101: Shared real-agents hook/endpoint — P0, 3h, deps T-002
A single `/api/agents` (real) backed by the ARG inventory query, cached, normalized to the `Agent`/`UnifiedAgent` shape. All ARG-NOW pages consume it. **Acceptance**: returns real agents with owner/env/auth/model/sharing.
#### T-102: Inventory real — P1, 4h, deps T-101
Filter/sort/search over real agents; agent detail drawer reads real fields. Retire banner. **Acceptance**: lists real agents; default-env filter works.
#### T-103: Risky Patterns real — P1, 4h, deps T-101
Detect from real ARG fields: anonymous/no-auth, generative-orchestration (autonomous), entire-tenant shared, maker-cred, risky connector. Retire banner. **Acceptance**: each pattern flags correctly on real agents (or honest "none found").
#### T-104: Compliance real — P1, 6h, deps T-101
Evaluate the rule pack against real agent fields; violations + lifecycle in Supabase; agent + tenant score. Retire banner. **Acceptance**: violations reflect real config; score computed from real data.
#### T-105: Maturity real — P1, 5h, deps T-104
Partial-capped scoring from real signals (auth coverage, owner coverage, sharing exposure, DLP if available). Never returns "full" from telemetry. Retire banner. **Acceptance**: scores cite residual manual burden; derived from real counts.
#### T-106: Sprawl + Maker View real — P1, 8h, deps T-101
Sprawl: real default-env agents + Supabase migration state. Maker View: filter real agents by signed-in owner (needs app auth — Entra SSO). Retire banners. **Acceptance**: migration state persists; maker sees only own agents.

### Phase 2 — Conversation KPIs: real transcript intelligence (the headline ask)

#### T-201: Native KPI aggregates real — P1, 3h
Wire `kpis.getAggregates` to real Dataverse `msdyn_conversationkpis` per env (impl exists; remove mock-env hack, use real env list from ARG). **Acceptance**: deflection/escalation/sessions per agent are real (or honest empty).
#### T-202: Transcript fetch (PII-safe pipeline) — P1, 4h, deps T-201
Pull `conversationtranscript` content per agent for a bounded window; process **in-memory only**, never persist raw text. **Acceptance**: transcripts streamed + discarded; only derived signals kept.
#### T-203: Intent/sentiment signal extraction — P1, 6h, deps T-202
Lexicon + lightweight classifier (optionally an Azure OpenAI batch on a sample): detect **gratitude** ("thanks","thank you","that helped"), **resolution** ("solved","resolved","that worked","perfect"), **escalation** ("talk to a human","speak to an agent","representative"), **frustration/negative**, **abandonment**. Aggregate to per-agent: resolution rate, CSAT proxy, escalation rate, frustration rate. Store only the counts. **Acceptance**: a seeded "thank you / problem solved" transcript yields the right signals; numbers reconcile.
#### T-204: Conversation KPIs UI real — P2, 3h, deps T-203
Render the real signals (resolution/CSAT/escalation/frustration trends + per-agent table). Retire banner. **Acceptance**: real signals shown; PII note; honest empty when no transcripts.

### Phase 3 — Cost + Capacity honest (P1–P2, 10h)
T-301 Cost connector (Licensing API + CSV fallback) OR, until wired, an honest **"Cost not connected — connect the PPAC Licensing API or import the credit CSV"** empty state. **Stop rendering fake money.** T-302 Capacity from real env credit where available. **Acceptance**: no un-labelled fake $ anywhere; real or honest-empty.

### Phase 4 — Health + Alerts real (P2, 16h)
T-401 App Insights KQL (error/latency/failed sessions) where wired; honest "not connected" otherwise. T-402 ingestion writes real metric history to Supabase. T-403 Alert engine over real baselines — no alerts until ≥7d history. **Acceptance**: health real-or-empty; zero fabricated alerts.

### Phase 5 — Lifecycle / Gates / Settings real (P2, 14h)
T-501 Lifecycle stage + prod-entry checklist in Supabase. T-502 Release Gates evaluate YAML policies vs real agents + signed decisions. T-503 Settings persist real config (tenant/app-reg/tokens/thresholds/source toggles). **Acceptance**: state persists; gates run on real agents.

### Phase 6 — Honesty pass (P1, 6h)
T-601 Flip every page's `dataState` to real/partial; **delete the global DEMO banner** once no page is pure-mock. T-602 Final sweep: grep for `mock` imports in `app/`; any remaining → honest-empty. **Acceptance**: no page renders mock-as-real; banner removed; `grep mock app/` clean except explicit demo toggles.

---

## Dependency Map
| Task | Depends On | Blocks |
|---|---|---|
| T-001 | none | T-002 |
| T-002 | T-001 | T-003, T-101 |
| T-101 | T-002 | T-102..T-106, T-502 |
| T-104 | T-101 | T-105 |
| T-201 | T-101 (env list) | T-202 |
| T-202 | T-201 | T-203 |
| T-203 | T-202 | T-204 |
| T-601 | all page tasks | — |

## Critical Path
```
T-001 (2h) → T-002 (6h) → T-101 (3h) → T-104 (6h) → T-105 (5h) → ... 
Restructure + ARG-NOW core ≈ 42h; with KPIs (Phase 2) ≈ 58h; full ≈ 104h.
With 20% buffer: ~125h. v-real-landing (Phase 0) ships in ~8h.
```

## Risk Register
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-1 | Removing the banner before a page is truly real re-creates the "scared by fake data" incident | M | H | Per-page `dataState`; banner only flips when the page is real (T-003 gate) |
| R-2 | Transcript content = PII | H | H | In-memory only, store aggregate signal counts, never raw text (T-202) |
| R-3 | MVP tenant has 0 agents → "real" pages look broken/empty | H | M | Design honest real-but-empty states, not fake fillers |
| R-4 | Cost/Health sources not wired for a long time | M | M | Honest "not connected" states are the deliverable, not fake numbers |
| R-5 | Maturity/compliance scoring overclaims from telemetry | M | M | Partial-cap principle enforced (T-105) |
| R-6 | Intent lexicon misses non-English / nuance | M | L | Start EN lexicon + optional Azure OpenAI sample classification; label as heuristic |

## Decision Log
| # | Decision | Date | Rationale |
|---|---|---|---|
| D-1 | Delete Live; Overview is the real landing | 2026-06-12 | One real entry point; Live was redundant |
| D-2 | Honest "not connected" > fake data, everywhere | 2026-06-12 | The Cost scare; governance tools must never fake numbers |
| D-3 | Conversation KPIs = native aggregates + transcript intent/sentiment | 2026-06-12 | The owner's bar: detect thank-you/resolution/escalation, not just a number |
| D-4 | Transcripts aggregate-only (signal counts), never persist content | 2026-06-12 | PII |
| D-5 | Prioritize ARG-NOW features (7 pages real, no new connection) | 2026-06-12 | Fastest path to a mostly-real app |
| D-6 | Per-page `dataState` drives the DEMO banner | 2026-06-12 | Retire the banner safely, page by page |

## Open Questions
- [ ] App auth (Entra SSO) for Maker View role-awareness — in scope now or later?
- [ ] Cost: wait for the Licensing API, or ship CSV-import first?
- [ ] Intent detection: lexicon-only (fast/free) vs Azure OpenAI sample classification (richer, costs tokens) for v1?

## Success Criteria
- [ ] **Overview is the landing page and shows real ARG data** (no Live page)
- [ ] 7 ARG-NOW pages (Inventory, Sprawl, Compliance, Risky Patterns, Maturity, Maker View, Overview) render **real** data
- [ ] **Conversation KPIs detect real signals** — a "thank you / problem solved" transcript produces resolution + gratitude counts
- [ ] **Zero un-labelled fake numbers** anywhere — every page is real or honest "not connected"
- [ ] **DEMO banner deleted** (no page is pure-mock-as-real)
- [ ] `grep "@/lib/mock/seed" app/` returns only explicit demo toggles, not load-bearing pages
