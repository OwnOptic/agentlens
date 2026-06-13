# Project Plan: AgentLens Robustness, Improvement & Streamlining
Date: 2026-06-13 | Owner: Elliot Margot | Status: EXECUTED (Phases 0-6 landed 2026-06-13)
Objective: Take AgentLens from "builds and demos cleanly" to "robust, honest, and safe to hand a client" by closing every defect found in a full-codebase audit, without weakening the honesty-first principle.

## Execution status (2026-06-13)

All seven phases were executed and pushed to OwnOptic/agentlens main. Each landed
with tsc clean + `next build` (41 routes) + vitest (37/37) + `az bicep build` (0
errors) + empty-.env runtime smoke (all pages 200).

| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 0 - Deploy-breakers & P0 security | DONE | T-001/002/601 earlier; T-003..006 in `32816c6` | uniform API auth, secret-free JWT, lazy signing fail-fast, timing-safe cron |
| 1 - Honesty integrity | DONE | `4db1a12` | demo badges on all mock pages, AI honest-stub, no mock-as-real |
| 2 - Connector robustness | DONE | `4db1a12` | fetchODataAll pagination, timeouts, allSettled, real token expiry |
| 3 - Governance correctness | DONE | `8fb6766` | live-data compliance, one evaluator, parser fixes, real Setup wizard |
| 4 - UX robustness | DONE | `4db1a12` | error states, hydration fixes, skeletons, sign-in feedback |
| 5 - Streamlining | DONE* | `4db1a12`,`8fb6766` | helper consolidation, dead-code removal, rate-limiter pruning. *T-502 (refactor bespoke pages to ui primitives) intentionally deferred - Phase 1/4 already modernised those pages; a full refactor would be churn for low value. |
| 6 - Deploy polish & docs | DONE | `8fb6766` | Bicep cycle fixed earlier; cross-platform standalone copy, health check, optional App Insights, Postgres AAD |

Tooling added: runnable unit suite (`vitest.config.ts` + `npm test`).
Residual (tracked, not blocking): live `azd up` against a real subscription is
unverified (needs an Azure account); the in-memory stores (compliance violations,
gate decisions, rate limiter) remain process-local by design - replace with the
DB before multi-instance production. The 2 formerly-skipped parser tests now pass.

---

## Executive Summary

Eight parallel reviewers audited every source file (~60 files, ~16k LOC) across 8 subsystems: auth/security, data connectors, API routes, pages/UI, governance domain logic, maturity/alerts/setup, infra/IaC, and reporting/ingestion/AI. They produced ~190 findings. This plan groups them into 7 priority-ordered phases.

**The headline:** the app compiles, type-checks, and runs, but it is **not yet deployment-safe for a client**. Three classes of problem dominate:
1. **`azd up` is broken** - a circular dependency in `infra/main.bicep` fails Bicep compilation (verified), and several env vars the code reads are never wired into the App Service.
2. **API auth is inconsistently enforced** - only 3 of 18 API routes call `requireSession`; the rest return real or mock tenant data to any caller (the page-level middleware does not protect JSON endpoints for non-browser clients).
3. **Several "real" features are silently mock** - the weekly report, AI summaries, and NL query always serve stub data; several pages show fabricated cost/health numbers with no demo badge.

The core governance engine also evaluates **name-string heuristics instead of the live ARG data** that the discovery layer already fetches - the single biggest correctness gap.

**Verification note (claims checked against the known-good build):** I independently verified the highest-severity contested findings. CONFIRMED: Bicep cycle (P0), `/api/compliance` ack/resolve always-404 (P1), missing `/api/config/*` routes (P1). DEBUNKED: a claimed "duplicate export default" in `health/page.tsx` (it is a single valid default export; the build passes). DOWNGRADED: `EmptyState` "will crash" P2 -> P3 (wrong `import React from 'lucide-react'` is a dead import; the file never references `React.*` and the automatic JSX runtime does not need it).

### Severity rollup (post-verification)

| Lane | P0 | P1 | P2 | P3 | Notes |
|------|----|----|----|----|-------|
| Auth/security | 2 | 6 | 8 | 4 | client-secret-in-JWT, /api/live unguarded |
| Connectors | 1 | 9 | 7 | 4 | systemic: no pagination, no timeouts |
| API routes | 6 | 9 | 6 | 3 | guard coverage 3/18; raw error leakage |
| Pages/UI | 0 | 4 | 9 | 5 | honesty badges missing; hydration risks |
| Governance | 0 | 3 | 13 | 4 | heuristic compliance; HMAC dev key |
| Maturity/Alerts/Setup | 0 | 3 | 14 | 4 | config endpoints missing; wrong probe |
| Infra/IaC | 1 | 7 | 6 | 4 | Bicep cycle; missing app settings; doc drift |
| Reporting/Ingest/AI | 0 | 4 | 11 | 4 | report always mock; HTML-report XSS |
| **Total** | **10** | **45** | **74** | **32** | ~161 actionable (+ ~30 "solid" confirmations) |

---

## Scope

**In scope:** every `.ts`/`.tsx`/`.bicep`/`.ps1` source file, the IaC, the deploy docs, and the data-honesty posture. Robustness (correctness, error handling, security), improvement (resilience, features that close real gaps), streamlining (dedup, dead code, consolidation).

**Out of scope:** new product features beyond closing audited gaps; migrating the in-memory stores to a real DB (flagged as a known limitation, not scheduled here); rewriting the hand-rolled YAML parser (tracked as an option in T-303).

**Assumptions:** part-time capacity (~6-8h/week); the repo stays private; the two-app-registration model stands; honesty-first is non-negotiable.

---

## Plan Overview

| # | Phase | Theme | Tasks | Effort | Priority |
|---|-------|-------|-------|--------|----------|
| 0 | Deploy-breakers & P0 security | make azd up work + close auth holes | 6 | 16h | P0 |
| 1 | Honesty integrity | no mock masquerading as real | 3 | 10h | P1 |
| 2 | Connector robustness | pagination, timeouts, token lifecycle | 5 | 16h | P1 |
| 3 | Governance engine correctness | real data, fix routing/probes | 6 | 22h | P1-P2 |
| 4 | UX robustness | error states, hydration, skeletons | 4 | 8h | P2 |
| 5 | Streamlining | dedup, dead code, consolidation | 4 | 13h | P2-P3 |
| 6 | Deploy polish & docs | doc drift, hardening, observability | 3 | 12h | P1-P2 |

### Stats
- Total tasks: 31 | Total effort: 97h (with 20% buffer: **116h** ≈ 15-19 weeks part-time)
- Critical path (Phase 0 deploy + security): ~16h, unblocks a safe handover
- Findings consolidated: ~161 actionable across 31 tasks
- External dependencies: a real tenant to validate Bicep + connector pagination; Global Admin for app-reg consent verification

---

## Detailed Plan

## PHASE 0 - Deploy-breakers & P0 security (16h, P0)
> Nothing ships to a client until this phase is green. After it, `azd up` works and no API leaks tenant data unauthenticated.

### T-001: Fix the Bicep circular dependency
**Phase**: 0 | **Owner**: Elliot | **Effort**: 1.5h | **Priority**: P0
**Depends on**: none | **Blocked by**: none

**Description**: `infra/main.bicep` cannot compile. The `kv` module consumes `webApp.outputs.principalId` while `webApp` consumes `kv.outputs.keyVaultUri` and declares `dependsOn: [kv]` - a true cycle Bicep rejects. The "Bicep handles this" comment is wrong. This is why `azd up` has never actually been run end-to-end.

**Steps**:
- [ ] Remove `webAppPrincipalId` param and the `Key Vault Secrets User` role-assignment resource from `infra/modules/keyvault.bicep`; add a `keyVaultId` output (30m)
- [ ] In `main.bicep`, add a standalone `Microsoft.Authorization/roleAssignments@2022-04-01` resource scoped to the vault, `dependsOn: [kv, webApp]`, using role GUID `4633458b-17de-408a-b874-0445c86b69e6` and `webApp.outputs.principalId` (30m)
- [ ] `az bicep build --file infra/main.bicep` to confirm zero cycle errors; `az deployment group what-if` against a test RG (30m)

**Deliverable**: compiling Bicep that deploys without a cycle.
**Acceptance criteria**:
- [ ] `az bicep build` succeeds with 0 errors
- [ ] `what-if` shows webapp + kv + role assignment all planned
**Risks**: role assignment needs the RG-scoped deployment to have RBAC write; mitigate by documenting the deployer needs Owner/User Access Administrator on the RG.

### T-002: Wire every required app setting into the webapp
**Phase**: 0 | **Owner**: Elliot | **Effort**: 2h | **Priority**: P1
**Depends on**: T-001 | **Blocked by**: none

**Description**: The code reads env vars the IaC never sets, so a fresh deploy fails at runtime: `AZURE_OPENAI_ENDPOINT/DEPLOYMENT/API_VERSION` (azureOpenAI.ts), `SUPABASE_URL` (supabaseClient.ts throws without it), `TEAMS_WEBHOOK_URL` (alerts), and `DATABASE_URL` when `deployPostgres=true`.

**Steps**:
- [ ] Add params + plain app settings for the 3 Azure OpenAI vars and `SUPABASE_URL` (non-secret) (45m)
- [ ] Add `TEAMS_WEBHOOK_URL` as a KV reference to secret `TEAMS-WEBHOOK-URL` (15m)
- [ ] Add a `deployPostgres`-conditional `DATABASE_URL` KV reference to secret `DATABASE-URL`; pass `deployPostgres` into the webapp module (45m)
- [ ] Cross-check every `process.env.*` read in `lib/**` against the appSettings array (15m)

**Deliverable**: webapp.bicep whose app settings are a superset of what the code reads.
**Acceptance criteria**:
- [ ] grep of `process.env.` vars vs appSettings shows no gap for prod-required vars
- [ ] DEPLOY.md step 4 lists every `az keyvault secret set` needed
**Risks**: secret-name vs env-var-name drift (see T-601); do T-601 in the same PR.

### T-003: Apply requireSession to every API route + role checks on mutations
**Phase**: 0 | **Owner**: Elliot | **Effort**: 4h | **Priority**: P0
**Depends on**: none | **Blocked by**: none

**Description**: Only `/api/ask`, `/api/dlp`, `/api/setup-status` call `requireSession`. The other 15 routes return tenant data (real or mock) to any caller; middleware only redirects browsers, not JSON/curl/SSRF clients, and in auth-optional mode passes everything. Mutating routes (compliance ack/resolve, gates POST/DELETE, alerts run/PATCH) additionally need an admin-role check.

**Steps**:
- [ ] Add the 3-line `requireSession` guard to: overview, discover, conversation-intel, live, compliance (GET+POST), gates (GET+POST+DELETE), alerts (all verbs), cost, maturity (GET+POST), report, health, agents, kpis (1.5h)
- [ ] Guard `/api/ingest` GET (config probe) behind session or reduce it to `{status}` only (15m)
- [ ] Add `requireRole(guard, 'admin')` helper in guard.ts; apply to all POST/DELETE/PATCH mutations (1h)
- [ ] Add a per-route test or a smoke script asserting 401 (auth-enabled, no cookie) for each (1h)

**Deliverable**: uniform auth across the API surface.
**Acceptance criteria**:
- [ ] Every route under `app/api` except `auth/*` calls requireSession as its first statement
- [ ] All state-mutating handlers assert the admin role
- [ ] Auth-optional mode still passes (dev user) - empty-.env smoke test green
**Risks**: breaking the dev experience; mitigate by keeping auth-optional dev-admin passthrough.

### T-004: Stop persisting the client secret in the JWT; fix role default
**Phase**: 0 | **Owner**: Elliot | **Effort**: 1.5h | **Priority**: P0
**Depends on**: none | **Blocked by**: none

**Description**: `authOptions.jwt` writes `token._clientSecret = secret` into the user-facing JWT cookie - a credential that should never live in a session token. Separately, the `session` callback still defaults missing roles to `['admin']` (the `jwt` callback was already fixed to `['viewer']`), and roles are accepted without an allowlist.

**Steps**:
- [ ] Remove `token._clientSecret` (and the field from `types/next-auth.d.ts`); leave a comment that `resolveClientSecret()` warms the module cache (20m)
- [ ] Change the `session` callback fallback `['admin']` -> `['viewer']` (10m)
- [ ] Add a `VALID_ROLES` allowlist filter in the jwt callback (20m)
- [ ] Add `session.maxAge`/`jwt.maxAge` (8h) (10m)
- [ ] Verify sign-in still maps Admin/Maker correctly (30m)

**Deliverable**: secret-free, least-privilege JWT.
**Acceptance criteria**:
- [ ] Decoded JWT contains no secret material
- [ ] A token with no roles claim yields viewer, not admin
**Risks**: none significant.

### T-005: Sanitize all error responses with safeError()
**Phase**: 0 | **Owner**: Elliot | **Effort**: 1.5h | **Priority**: P1
**Depends on**: none | **Blocked by**: none

**Description**: ~8 routes return raw `e.message`/`String(e)` (overview, live, gates, ingest, discover, conversation-intel, setup-status, maturity), which can carry tenant/subscription IDs and ARG response fragments. `safeError()` exists but is unused outside `/api/ask`.

**Steps**:
- [ ] Replace raw error echoes with `safeError(e)` in every route catch block (45m)
- [ ] Apply `safeError` to the Graph-token error log in `alerts/dispatch.ts` and the KV/OpenAI probe detail leakage in `setup/probes.ts` (30m)
- [ ] Change `/api/overview` error status from 200 to 502 (15m)

**Deliverable**: no raw exception text crosses the network boundary.
**Acceptance criteria**:
- [ ] grep for `e.message`/`String(e)` in route/dispatch returns only safeError-wrapped sites
**Risks**: over-redaction (see T-504 for the hex-regex tightening).

### T-006: Harden the gate-signing & cron secret
**Phase**: 0 | **Owner**: Elliot | **Effort**: 2h | **Priority**: P1
**Depends on**: none | **Blocked by**: none

**Description**: `policy/signing.ts` silently falls back to a hardcoded public dev key when `GATE_SIGNING_KEY` is absent (anyone can forge signatures), and the signed payload excludes `reasons` (a DB-level attacker can swap block->pass evidence while the signature stays valid). `/api/ingest` compares `CRON_SECRET` with `!==` (timing oracle).

**Steps**:
- [ ] Fail-fast at module load if `GATE_SIGNING_KEY` is absent and `NODE_ENV` is not dev/test (30m)
- [ ] Add a SHA-256 of sorted `reasons` as a 6th canonical-payload field; update verify + tests (1h)
- [ ] Replace the `CRON_SECRET` compare with `crypto.timingSafeEqual` (length-checked) (30m)

**Deliverable**: tamper-evident decisions + side-channel-free cron auth.
**Acceptance criteria**:
- [ ] Tampering with `reasons` invalidates the signature (new test)
- [ ] Missing signing key throws in production, not a silent forge-able fallback
**Risks**: existing signed decisions become invalid (acceptable - they are mock/dev).

---

## PHASE 1 - Honesty integrity (10h, P1)
> The user was previously alarmed by mock cost data looking real. This phase guarantees every fabricated number is visibly labelled.

### T-101: DataSourceBadge on every mock page; fix misleading copy
**Effort**: 3h | **Priority**: P1 | **Depends on**: none

**Description**: `cost`, `health`, `agents/[id]`, `lifecycle`, `maker-view` render fabricated figures with no page-level demo signal (they rely solely on the layout DemoBanner). `health`'s subtitle actively claims "Data sourced from Application Insights" while serving mock.

**Steps**:
- [ ] Add `<DataSourceBadge state="demo" source="sample data" />` to the PageHeader of all five pages (1h)
- [ ] Rewrite the health subtitle to "Connect App Insights to see live data" + per-stat InfoTips (1h)
- [ ] Adopt `PageHeader` on lifecycle/maker-view (currently bare `<h1>`) (1h)

**Acceptance**: every page showing numbers has a visible live/demo badge; no copy claims a live source that is not wired.

### T-102: Honest dataSource flag across mock APIs + AI stubs + seed guard
**Effort**: 4h | **Priority**: P1 | **Depends on**: none

**Description**: 9 API routes return mock with no flag; `/api/report`, `lib/ai/summaries.ts`, `lib/ai/nlQuery.ts` always serve stubs (`isMock:true` internally but no live path and no startup warning); `lib/mock/seed.ts` has no prod guard and is imported at module top-level in nlQuery.

**Steps**:
- [ ] Add `dataSource: 'mock'|'live'` to every mock API response envelope (1.5h)
- [ ] Add explicit `if (process.env.AZURE_OPENAI_ENDPOINT)` live branches in summaries/nlQuery; log a prod warning when falling back to stub (1.5h)
- [ ] Add `throw if NODE_ENV==='production'` guard at the top of seed.ts; make nlQuery's seed import lazy (30m)
- [ ] Move `*FromMock` convenience exports out of `lib/reporting/*` into `lib/mock/` and replace `require()` with static import (30m)

**Acceptance**: no production code path serves mock data without a `dataSource:'mock'` flag; seed cannot be bundled into prod silently.

### T-103: Cost page - replace silent mock fallback with a visible error
**Effort**: 3h | **Priority**: P1 | **Depends on**: none

**Description**: On fetch failure the cost page silently swaps in mock data (console.error only), so a broken API renders a full, credible-looking cost dashboard. Loading is a full-screen string, not a skeleton.

**Steps**:
- [ ] Add an error state + visible warning banner when the fetch fails (1h)
- [ ] Replace the full-screen "Loading..." with PageHeader + SkeletonCard (1h)
- [ ] Apply the same error-state pattern to overview/discovery (overlaps T-401) (1h)

**Acceptance**: a failed `/api/cost` shows an error, never silent fabricated data.

---

## PHASE 2 - Connector robustness (16h, P1)
> Today the connectors silently truncate at the first page and can hang forever. This phase makes tenant data complete and bounded.

### T-201: Shared `fetchODataAll` helper (pagination + timeout + truncation)
**Effort**: 5h | **Priority**: P1 | **Depends on**: none

**Description**: Every Dataverse/BAP/Graph connector reads `body.value` and stops - no `@odata.nextLink`/`$skipToken` follow - so large tenants silently lose the tail (honesty violation). None apply a timeout except `dlp.ts`. This is the same copy-pasted gap in 6+ places.

**Steps**:
- [ ] Create `lib/connectors/odata.ts`: `fetchODataAll<T>(url, token, {timeout, maxRows})` returning `{rows, truncated}`, handling OData headers, nextLink loop, AbortSignal.timeout, and a maxRows cap (2h)
- [ ] Add an ARG variant handling `$skipToken` for `discovery`/`argInventory` (1h)
- [ ] Migrate discovery, argInventory, kpis, transcripts, cost, dataverseDeepScan to the helper; surface `truncated` on the result (2h)

**Acceptance**: a >500-row environment returns all rows (or `truncated:true`); no fetch can hang past its timeout.

### T-202: discoverAllAgents - Promise.allSettled + token acquisition inside try
**Effort**: 1h | **Priority**: P0 | **Depends on**: none

**Description**: `discoverAllAgents` uses `Promise.all`; `getArmToken()`/`getGraphToken()` are awaited before each source's try/catch, so a token-acquisition throw rejects the whole sweep and returns nothing instead of a partial result.

**Steps**:
- [ ] Switch to `Promise.allSettled`, mapping rejections to `{status:'error'}` sources (30m)
- [ ] Move token acquisition inside each source's try block (30m)

**Acceptance**: one failing source never blanks the others.

### T-203: Fix the transcript bot lookup + GUID validation
**Effort**: 1h | **Priority**: P1 | **Depends on**: none

**Description**: `transcripts.ts` selects `_bot_conversationtranscriptid_value` (the transcript's own id), not the owning bot, so every transcript collapses to one phantom agent. `dataverseDeepScan` interpolates botId into OData URLs without GUID validation.

**Steps**:
- [ ] Change select/map to `_msdyn_bot_value`; verify against the live schema (30m)
- [ ] Add a GUID-format guard before constructing Dataverse filter URLs (30m)

**Acceptance**: transcripts group by real bot; non-GUID botId is rejected early.

### T-204: tokenService - real expiry, init race, 401-retry
**Effort**: 2.5h | **Priority**: P1 | **Depends on**: none

**Description**: Token cache uses a hardcoded 60-min TTL instead of MSAL's `expiresOn` (can serve expired tokens); `getMsalApp()`/`resolveClientSecret()` have concurrent-init races (parallel cold-start requests each hit AAD); the documented "401-retry-once" does not exist.

**Steps**:
- [ ] Use `response.expiresOn` for cache expiry (30m)
- [ ] Promise-lock MSAL app + secret init (1h)
- [ ] Add `getTokenWithRetry`/`clearAudienceCache` and route a single 401-retry through it (1h)

**Acceptance**: short-lived tokens are not over-cached; a single AAD 401 self-heals.

### T-205: Timeouts + 429 handling on remaining fetches
**Effort**: 2h | **Priority**: P1 | **Depends on**: T-201

**Description**: `graph.ts` (sequential chunk loop, no 429/Retry-After), `appInsights.ts` (no timeout, no row cap), `cost.ts` (no timeout) can hang or get throttled.

**Steps**:
- [ ] Add AbortSignal.timeout to graph/appInsights/cost fetches (45m)
- [ ] Honour `Retry-After` on Graph 429 (single retry); parallelize chunks via allSettled (45m)
- [ ] Cap the App Insights KQL with `| take 10000` + `truncated` flag (30m)

**Acceptance**: no connector fetch is unbounded; Graph throttling is retried once.

---

## PHASE 3 - Governance engine correctness (22h, P1-P2)
> The product's core value is correct governance signals. Today they are largely inferred from agent name strings.

### T-301: Wire compliance/risky-pattern signals to live ARG data
**Effort**: 5h | **Priority**: P1 | **Depends on**: T-201

**Description**: `compliance/evaluator.ts buildEvalContext()` derives authMode, HTTP-connector, Direct Line channel, DLP-reviewed, and sharing-scope from name substrings. Effect: every production agent with an owner is assumed DLP-reviewed; "Customer Support Bot" always flags a Direct Line channel. The ARG `PowerPlatformResources` query already returns connectors, auth, channels, and sharing (verified live 2026-06-12) but is ignored.

**Steps**:
- [ ] Extend the `Agent` type with optional live fields (connectors, authMode, channelIds, sharingScope) populated by the ARG query (2h)
- [ ] Prefer live fields in buildEvalContext, fall back to heuristics with a `derivedFromHeuristic` flag; default the dlpReviewed/httpApproved heuristics to false (fail-safe) (2h)
- [ ] Surface the data-quality flag in the compliance UI (1h)

**Acceptance**: when ARG data is present, compliance uses it; heuristic-derived rows are visibly marked.

### T-302: Fix compliance ack/resolve routing (always 404 today)
**Effort**: 1h | **Priority**: P1 | **Depends on**: none

**Description**: `POST /api/compliance` dispatches on `pathname.endsWith('/ack')`/`/resolve`, but the route's path is always `/api/compliance` (no sub-route files exist), so ack/resolve never fire.

**Steps**:
- [ ] Change the contract to `{action:'ack'|'resolve', ids:[]}` in the POST body and dispatch on `action` (45m)
- [ ] Update the compliance page caller (15m)

**Acceptance**: ack/resolve mutate violation state and return 200.

### T-303: Consolidate the two expression evaluators
**Effort**: 4h | **Priority**: P2 | **Depends on**: none

**Description**: `policy/evaluator.ts` (full DSL: `||`, `!`, `>=`, `contains`...) and `compliance/evaluator.ts` (only `==`/`!=`/`&&`, with a silent-false on unrecognized clauses) are two engines where one should exist. The policy engine also has a `!(compound && expr)` negation bug and a boolean `String('true')==true` coercion; the YAML parser breaks on blank lines inside a rule block and returns an empty (pass-everything) policy on a missing `rules:` key.

**Steps**:
- [ ] Extract a shared `evalExpression(expr, ctx)` from policy/evaluator; adopt in compliance/evaluator (1.5h)
- [ ] Fix negation-of-compound and remove the boolean string-coercion fallback (1h)
- [ ] Fix the YAML blank-line break + error on zero-rule policies (1h)
- [ ] Add the missing edge-case tests (blank lines, duplicate rule ids, empty rules, negated compound) (30m)

**Acceptance**: one evaluator; new tests pass; a typo'd policy errors instead of silently passing.

### T-304: Fix risky-pattern false positives + alert type mismatches
**Effort**: 3h | **Priority**: P2 | **Depends on**: none

**Description**: `detectMakerCredential` fires for any PoC agent with an owner; `detectHttpAction` matches the substring "external"; `detectSharedEntireTenant` misses non-default envs. The alert engine emits `volume_spike` for cost events and `budget_breach` for env-overage (wrong buckets), and `existingAlertKeys` dedup is declared but never wired (alert storms on every run).

**Steps**:
- [ ] Tighten the three risky-pattern heuristics (restrict to authMode signals / drop bare "external") (1h)
- [ ] Add `env_overage` + `high_consumption` to `AlertType`; use them (45m)
- [ ] Wire `existingAlertKeys` into `evaluateAlerts` for cross-run dedup (1h)
- [ ] Add Teams-webhook timeout + single 429/503 retry in dispatch (overlaps T-205 pattern) (15m)

**Acceptance**: no substring false positives; alerts land in the right bucket and do not re-fire every run.

### T-305: Make the Setup wizard real + fix the probes
**Effort**: 5h | **Priority**: P1 | **Depends on**: none

**Description**: SetupWizard POSTs to `/api/config/verify` and `/api/config/save` which do not exist (verified) - the wizard is non-functional - and persists tenantId/clientId/webhook to `localStorage` (XSS-readable). `probeAgent365` hits the unrelated `/solutions/virtualEvents` endpoint (false "ok"); `probeSupabase` only checks the env var, not connectivity; KV/OpenAI probes leak secret names/endpoints into the browser.

**Steps**:
- [ ] Implement `app/api/config/verify` (token acquisition test) and `/save` (server-side persistence) routes, guarded (2h)
- [ ] Replace localStorage persistence with the server save endpoint (1h)
- [ ] Point the Agent 365 probe at a real licensing/Copilot endpoint (or document the limitation) (1h)
- [ ] Add a real Supabase connectivity probe; `safeError`-wrap KV/OpenAI probe details (1h)

**Acceptance**: the wizard verifies and saves; probes reflect real connectivity; no secret names/endpoints reach the browser.

### T-306: DLP recs + compliance rule-pack improvements
**Effort**: 4h | **Priority**: P2 | **Depends on**: none

**Description**: The DLP blocked-list omits high-risk enterprise connectors (Salesforce, ServiceNow, SAP, SQL Server) in the default/production archetypes even though risky-patterns flags them; recs have no last-verified metadata. The compliance rule pack is missing trial-in-prod, prod-requires-SP-auth, and the Agent 365 2026-07-01 security deadline.

**Steps**:
- [ ] Add a high-risk-enterprise blocked sublist to default/production archetypes; align with risky-patterns (1.5h)
- [ ] Add `lastVerifiedDate`/`connectorCatalogVersion` to `DlpRecommendation` + a UI disclaimer (1h)
- [ ] Add the 3 missing compliance rules; elevate prod user-delegated auth to warning (1.5h)

**Acceptance**: risky connectors are blocked in the right archetypes; new rules fire on the seed.

---

## PHASE 4 - UX robustness (8h, P2)

### T-401: Error states on client fetches (overview, discovery, cost)
**Effort**: 2h | **Priority**: P2 | **Depends on**: none
**Description**: These pages have `try/finally` with no `catch`; a network error leaves a blank page (data null, loading false, nothing rendered).
**Steps**: add an error state + error card to each; reuse the alerts page pattern.
**Acceptance**: a failed fetch shows an error card, never a blank page.

### T-402: Fix hydration risks (Date.now in render)
**Effort**: 2h | **Priority**: P2 | **Depends on**: none
**Description**: `lifecycle` (prod-checklist check), `maker-view` (`relativeDate`), `agents/[id]` (stat sublabels) call `Date.now()`/`new Date()` during render of client components -> hydration mismatch.
**Steps**: hoist to `useMemo(() => Date.now(), [])` or wrap affected nodes with `suppressHydrationWarning`.
**Acceptance**: no hydration warnings in the console on these pages.

### T-403: Skeletons + EmptyState adoption; fix EmptyState import
**Effort**: 2h | **Priority**: P2/P3 | **Depends on**: none
**Description**: `Skeleton`/`EmptyState` components exist but are barely used; bare "Loading..." strings remain; `EmptyState` wrongly imports React from `lucide-react` (dead import, harmless today).
**Steps**: fix the import; replace bare loaders with skeletons; use EmptyState for the agents/[id] Knowledge tab and empty lifecycle columns.
**Acceptance**: consistent loading/empty states; correct imports.

### T-404: Sign-in & UserChip error feedback
**Effort**: 2h | **Priority**: P2 | **Depends on**: none
**Description**: `signin/page.tsx` swallows sign-in errors silently (button just re-enables); `UserChip` treats any `/api/auth/*` fetch error as "not configured", masking transient failures in auth-enabled mode.
**Steps**: add a sign-in error note; distinguish "no provider" from "fetch failed" in UserChip with a neutral error state.
**Acceptance**: sign-in failures and auth-endpoint blips are visible, not silent.

---

## PHASE 5 - Streamlining (13h, P2-P3)

### T-501: Consolidate token/ARG/credential helpers; delete /api/live
**Effort**: 3h | **Priority**: P2 | **Depends on**: T-201, T-202
**Description**: `dlp.ts` re-implements its own MSAL flow; the `arg(token,query)` helper is copy-pasted in overview/ask/live; `hasCredentials()` is redeclared (inconsistently - kpis omits the secret check) in 5 connectors; `/api/live` duplicates `/api/overview` while using a raw token.
**Steps**: extract `lib/connectors/arg.ts`; export one `hasCoreCredentials()`; route `dlp.ts` through `getArmToken`; delete `/api/live`.
**Acceptance**: one ARG helper, one credential check, no dlp-local token flow, /api/live gone.

### T-502: Refactor bespoke pages onto ui primitives
**Effort**: 5h | **Priority**: P3 | **Depends on**: T-101
**Description**: `health` (364 lines of hand-rolled cards), `lifecycle`, `maker-view` duplicate markup that `Card`/`StatCard`/`PageHeader`/`Badge` already provide.
**Steps**: migrate each to the primitives (~150 LOC reduction on health alone).
**Acceptance**: pages use shared primitives; visual parity preserved.

### T-503: Remove dead code
**Effort**: 2h | **Priority**: P3 | **Depends on**: none
**Description**: empty `useEffect`s and a redundant re-fetch in settings; unused `unapprovedHttpConnectorCount`; `require()` instead of import in policy/evaluator (no real cycle); review whether `liveBatchResolveOwners` is reachable; unused `@/lib/types` import in provision-app-user.ts.
**Steps**: delete/replace each; verify tsc + build.
**Acceptance**: no dead `useEffect`/imports; static imports throughout.

### T-504: Rate-limiter pruning + safeError regex tightening
**Effort**: 1h | **Priority**: P2 | **Depends on**: T-005
**Description**: the in-memory rate-limit Map grows unbounded (one entry per user forever); `safeError`'s `[0-9a-f]{32,}` over-redacts 32-char GUIDs/correlation IDs; the ask-route rate-limit key collapses to a shared bucket when no email/name.
**Steps**: prune expired buckets; raise the hex pattern to 40+ chars; add IP fallback for the rate-limit key.
**Acceptance**: bounded memory; GUIDs survive sanitization; rate limit is per-IP when unauthenticated.

---

## PHASE 6 - Deploy polish & docs (12h, P1-P2)

### T-601: Fix documentation drift + standardize env var names
**Effort**: 2.5h | **Priority**: P1 | **Depends on**: T-002
**Description**: `DEPLOY.md` step 1 shows `-SubscriptionId`/`-BaseName` params the script does not accept; it references `WEBAPP_CLIENT_SECRET` while `.env.example`/APP-REGISTRATIONS.md use `AZURE_AD_CLIENT_SECRET`; `INSTALL.md` is a stale v1 doc (Vercel/Docker, wrong env names, wrong ARG permission) that forks the deploy story.
**Steps**: correct DEPLOY.md to the real script signature; standardize on `WEBAPP_CLIENT_SECRET` everywhere (update `.env.example`, drop the alias); replace INSTALL.md with a pointer to DEPLOY.md.
**Acceptance**: a client following DEPLOY.md verbatim succeeds; one canonical secret name.

### T-602: Deploy hardening + observability
**Effort**: 6h | **Priority**: P2 | **Depends on**: T-001
**Description**: `azure.yaml` postdeploy uses `sh`+`cp` (breaks on Windows azd, and the static-copy timing vs packaging is unverified); no health-check path; no App Insights/diagnostics; `WEBSITE_RUN_FROM_PACKAGE` unset; prod CSP still allows `script-src 'unsafe-inline'`.
**Steps**: make the static-copy step a cross-platform Node script in `build`; add `healthCheckPath:'/api/health'`; add optional App Insights + `APPLICATIONINSIGHTS_CONNECTION_STRING`; set `WEBSITE_RUN_FROM_PACKAGE=1`; move to nonce-based CSP (drop script unsafe-inline) and verify HMR still works.
**Acceptance**: `azd up` works on Windows and Linux; App Service health-heals; prod CSP has no script unsafe-inline.

### T-603: PostgreSQL hardening (optional path)
**Effort**: 3.5h | **Priority**: P2 | **Depends on**: T-001
**Description**: Postgres is password-only (no managed-identity auth), the firewall opens to all Azure services, and B1 App Service has no slot for zero-downtime deploys.
**Steps**: enable AAD auth + add the webapp identity as a Postgres AD admin; document the 0.0.0.0 rule; add an optional S1+staging-slot path (default off).
**Acceptance**: client tenants can run passwordless DB auth; a documented zero-downtime option exists.

---

## Dependency Map

| Task | Depends On | Blocks | Parallel With |
|------|-----------|--------|---------------|
| T-001 | none | T-002, T-602, T-603 | T-003, T-004, T-005, T-006 |
| T-003 | none | - | all of Phase 0 |
| T-201 | none | T-205, T-301, T-501 | T-202, T-203, T-204 |
| T-301 | T-201 | - | T-302..306 |
| T-501 | T-201, T-202 | - | T-502, T-503 |
| T-601 | T-002 | - | T-602, T-603 |

## Critical Path
```
T-001 (1.5h) -> T-002 (2h) -> T-601 (2.5h) -> T-602 (6h)  [deploy chain]   = 12h
T-201 (5h)   -> T-301 (5h)                    [data-correctness chain]      = 10h
Phase 0 security (T-003..006, parallelizable) ........................ ~9h
```
Minimum to a **safe client handover** = Phase 0 (16h). Minimum to **correct + honest** = Phases 0+1+2 (42h). Full plan with buffer = **116h**.

## Timeline (part-time, ~7h/week)

| Sprint | Weeks | Phase | Milestone |
|--------|-------|-------|-----------|
| 1 | 1-3 | Phase 0 | azd up works; API auth uniform; secrets safe |
| 2 | 4-5 | Phase 1 | no mock-as-real anywhere |
| 3 | 6-8 | Phase 2 | connectors complete + bounded |
| 4 | 9-12 | Phase 3 | governance evaluates real data |
| 5 | 13-14 | Phase 4 | UX hardened |
| 6 | 15-17 | Phases 5-6 | streamlined + deploy-hardened |

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|-----------|-------|
| R-001 | Bicep fix still fails on a real tenant (RBAC scope, region) | M | H | `what-if` + a throwaway RG before client deploy | Elliot |
| R-002 | Adding API guards breaks the demo/auth-optional flow | M | M | keep dev-admin passthrough; empty-.env smoke test in CI | Elliot |
| R-003 | Wiring compliance to live ARG surfaces schema gaps (fields absent on some agents) | H | M | heuristic fallback + data-quality flag (T-301) | Elliot |
| R-004 | Connector pagination changes blow past Azure API rate limits | M | M | maxRows cap + timeouts + single 429 retry | Elliot |
| R-005 | Part-time capacity slips the 17-week timeline | H | M | Phase 0 alone makes it handover-safe; later phases are incremental | Elliot |
| R-006 | Removing /api/live or renaming env vars breaks an undocumented consumer | L | M | grep for usages before deletion; standardize in one PR | Elliot |

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D-001 | Phase by risk, not by lane | a client handover is gated by Phase 0, not by finishing any one subsystem |
| D-002 | Keep heuristic compliance as a flagged fallback, not delete it | some agents lack live ARG fields; fail-safe defaults + a visible flag beats no signal |
| D-003 | Consolidate the two evaluators rather than keep both | the compliance one is strictly weaker and has a silent-false bug |
| D-004 | Do not migrate in-memory stores to a DB in this plan | large, separate effort; documented as a known limitation instead |
| D-005 | Standardize on `WEBAPP_CLIENT_SECRET` over `AZURE_AD_CLIENT_SECRET` | matches the secrets.ts ENV_MAP canonical name |

## Open Questions
- [ ] Is `/api/live` consumed by any external script, or safe to delete outright?
- [ ] For client tenants, is Supabase acceptable or must everything stay in-tenant (Azure Postgres + T-603)?
- [ ] Should the AI features (summaries/nlQuery) ship live with Azure OpenAI now, or stay honest-stub until a later milestone?

## Success Criteria
- [ ] `az bicep build` + `azd up` succeed against a clean RG; the app boots and reads its secrets from Key Vault
- [ ] Every `app/api/*` route enforces `requireSession`; mutations require admin; no raw error text leaks
- [ ] No JWT carries a secret; default role is least-privilege
- [ ] No page or API presents mock data without a `dataSource:'mock'`/demo badge
- [ ] Connectors return complete, bounded results (pagination + timeouts); a single source failure degrades gracefully
- [ ] Compliance evaluates live ARG data where available; the Setup wizard verifies and saves
- [ ] `npm run build` + `tsc` clean; empty-`.env` boot still returns 200 + honest states on every page

---

## Appendix - Full findings index (~161 actionable)

> Grouped by lane. Severity post-verification. Each maps to a task above. The 8 reviewers also confirmed ~30 SOLID patterns (e.g. the honest `sources[]` map on /api/overview, PII-safe transcript aggregation, the partial-cap maturity honesty, the Key Vault RBAC GUID + TLS hardening) - those are intentionally not listed here.

**Auth/security (-> T-003/004/005/006/204/404/504):** client-secret-in-JWT (P0); session-callback admin default (P1); /api/live unguarded + ARG error leak (P0); token TTL ignores expiresOn (P1); MSAL+secret init races (P1/P2); no 401-retry despite docs (P1); rate-limiter unbounded + over-redacting hex regex (P2); isAuthEnabled duplicated in middleware (P3); no role allowlist/session maxAge (P1/P2); sign-in/UserChip silent errors (P2); callbackUrl drops query string (P2); getSecretSourceMap mislabels env as keyvault (P2).

**Connectors (-> T-201/202/203/204/205/501):** Promise.all kills all sources (P0); no pagination on ARG/Graph/BAP/Dataverse/kpis/deepScan (P1 x6); no timeouts across connectors (P1 x5); transcript wrong bot lookup (P2); kpis missing-secret hasCredentials (P3); silent mock-vs-live ambiguity (P2 x3); botId injection (P2); dlp duplicates token flow (P3); intent lexicon conflates gratitude/resolution (P2); LLM JSON parse fragility (P2); per-env failures unreported (P2 x2).

**API routes (-> T-003/005/102/302/501):** missing guard on overview/discover/conversation-intel/live/compliance/gates/alerts (P0 x6) + cost/maturity/report/health/agents/kpis (P1 x6); raw error echoes (P1 x6); ack/resolve always-404 (P1); no dataSource flag (P2 x several); missing force-dynamic + public cache on mock cost (P2); ask no length cap + weak rate-limit key (P2); /api/live dup of overview (P2); ARG helper copy-pasted (P3); in-memory compliance store race (P2).

**Pages/UI (-> T-101/103/401/402/403/502):** no DataSourceBadge on cost/health/agents/lifecycle/maker-view (P1 x several); health subtitle claims App Insights (P1); cost silent mock fallback (P1); no catch on overview/discovery fetch (P2 x2); hydration risks (P2 x3); EmptyState wrong import (P3, downgraded); health 364-line bespoke markup (P2); tab a11y (P3); SectionTitle block-span (P3).

**Governance (-> T-006/301/303/304/306):** HMAC dev-key fallback (P1); reasons not signed (P1); compliance heuristic signals (P1); negation-of-compound bug (P2); boolean string coercion (P2); YAML blank-line + empty-rules pass (P2 x2); evalClause silent-false (P2); no OR in compliance DSL (P2); risky-pattern false positives (P2 x3); prod-gate fallback runs all policies (P2); two evaluators duplicated (P3); require() in evaluator (P3); missing parser tests (P2).

**Maturity/Alerts/Setup (-> T-005/304/305/102):** /api/config/verify+save missing (P1); SetupWizard localStorage secrets (P1); existingAlertKeys unwired (P1); alert type mismatches (P2 x2); dispatch no timeout/retry (P2); dispatch logs raw token-error body (P2); module-level secret read (P2); Agent365 probe wrong endpoint (P2); Supabase probe no connectivity check (P2); probe leaks secret names/endpoints (P2 x2); maturity unknown-control uncapped (P2); report non-null assertion (P2); cost baseline sort assumption (P2); dead useEffect + redundant fetch (P3 x2); DLP-proxy from ownerEmail (P3).

**Infra/IaC (-> T-001/002/601/602/603):** Bicep circular dependency (P0, CONFIRMED); missing app settings AZURE_OPENAI_*/SUPABASE_URL/TEAMS_WEBHOOK_URL/DATABASE_URL (P1 x4); DEPLOY.md wrong params + secret-name drift (P1 x2); INSTALL.md stale v1 (P1); azure.yaml sh-on-Windows postdeploy (P2); KV name validation (P2); Postgres password-only + open firewall (P2); B1 no slot (P2); no health check (P2); no diagnostics/App Insights (P2); prod CSP script unsafe-inline (P2); WEBSITE_RUN_FROM_PACKAGE unset (P3); provision-app-user.ts path-alias import (P3); .env.example/APP-REGISTRATIONS naming (P3 x2).

**Reporting/Ingest/AI (-> T-102/205/503):** report API always mock (P1); mock require() in ESM reporting modules (P1); HTML-report XSS via alert message (P1); orchestrator double singleton (P1); fromAny masks schema drift (P1); DB type drift estimated_cost/lifecycle (P2 x2); N full-tenant listAgents calls (P2); partial-vs-failed status (P2); azureOpenAI no timeout/retry + error-body PII (P2 x3); summaries/nlQuery permanent stub no prod path (P2 x2); loose == in mock SQL (P2); state enum vocabulary drift ack vs acknowledged (P2); maturity pillar prefix inference (P3); no mock-in-prod guard (P2); maxTokens uncapped (P3); ingestion-run persist swallow (P3).
