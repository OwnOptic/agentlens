# AgentLens — Deployment-Readiness Plan (Key Vault, App Registrations, DLP Guidance, UX)
Date: 2026-06-12 | Owner: Elliot Margot | Status: Draft
Objective: AgentLens deploys to a client tenant or Witivio-internal Azure with **one command**, all secrets in **Azure Key Vault** behind a **managed identity**, users sign in via **Entra SSO**, the required **app registrations are scripted + surfaced in-app**, and a new **DLP guidance page** encodes per-environment-type policy recommendations with a live tenant comparison.

---

## Executive Summary
AgentLens works, but it runs on a hand-pasted 90-minute ARM token in `.env.local`, has no sign-in, and deploys nowhere. This plan productionizes it in four phases: (1) **Secrets & hosting** — Azure App Service with a system-assigned managed identity reading every secret from Key Vault, the service-principal client-credentials flow replacing the pasted token, and a Bicep/azd template making deployment one command; (2) **App registrations** — the two Entra apps (data-reader SP + webapp SSO) defined, scripted via az CLI, and surfaced on an in-app Setup page with live connected/missing checks; (3) **DLP guidance** — a new Govern page recommending Business/Non-Business/Blocked strategies per environment archetype (default-env lockdown, dev, sandbox/UAT, prod, trial, governance env), grounded in the ITER governance work, with a live BAP-API comparison of the tenant's actual policies; (4) **UX** — transparency primitives on every page, skeletons, responsive sidebar, a real Settings page. Phase 1+2 = the deployable product; 3 = the differentiating governance content; 4 = polish.

## Scope
**In scope:** Key Vault + managed identity + App Service (Bicep/azd); SP client-credentials replacing MVP_ARM_TOKEN; Entra SSO (NextAuth) with admin/maker roles; app-reg provisioning script + in-app Setup page; DLP guidance page with live BAP comparison; UX pass (InfoTips everywhere, skeletons, responsive, real Settings).
**Out of scope:** OSS publish (R-010 still open); multi-tenant SaaS; Cost/Health live wiring (separate plans); writing to client environments (read-only stance stands).
**Assumptions:** An Azure subscription is available (Witivio or client); someone with Global Admin can grant admin consent + the PP-admin role to the SP (the one human gate); Supabase acceptable for Witivio-internal — for client tenants see D-021.

## Stakeholders
| Name | Role | RACI | Availability |
|---|---|---|---|
| Elliot Margot | Builder/Owner | R+A | ~6–8 h/wk |
| Tenant Global Admin (client or Witivio IT) | Consent grantor | C (one-time approvals) | external wait |
| Witivio (internal hosting) / client IT | Hosting owner | I | external |

---

## Plan Overview

### Phases
| # | Phase | Tasks | Effort | Calendar | Milestone |
|---|-------|-------|--------|----------|-----------|
| 1 | Secrets, identity & hosting | 6 | 26h | Wk 1–3 | **One-command deploy; zero plaintext secrets; SSO on** |
| 2 | App registrations: script + Setup page | 4 | 16h | Wk 3–4 | **Install = run script + grant consent; Setup page shows live status** |
| 3 | DLP guidance page | 3 | 14h | Wk 5–6 | **Per-env DLP recommendations + live tenant gap check** |
| 4 | UX & real Settings | 4 | 14h | Wk 6–7 | Transparency everywhere; responsive; Settings real |

### Stats
- Total tasks: 17 | Total steps: ~70
- Total effort: 70h (**with 20% buffer: ~84h**)
- Critical path: **~38h** (T-101→T-102→T-103→T-105→T-201→T-203)
- External waits: 2 (admin consent + PP-admin role grant; Azure subscription access)

---

## Detailed Plan

### Phase 1 — Secrets, identity & hosting (deployment-ready core)

#### T-101: Finish the service-principal token flow (kill MVP_ARM_TOKEN)
**Phase**: 1 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: none · **Blocked by**: AgentLens-Reader SP existing (can reuse T-201's script later; create manually for now)
**Description**: Replace the hand-pasted user ARM token with runtime client-credentials in `lib/auth/tokenService.ts` (already scaffolded). Tokens acquired per audience at runtime, cached in memory, never stored.
**Steps**:
- [ ] Implement `acquireTokenByClientCredential` for ARM, Graph, Dataverse, OpenAI-adjacent audiences via `@azure/msal-node` (1.5h)
- [ ] Route all connectors (overview/discovery/ask/transcripts) through `getToken(audience)` with `MVP_ARM_TOKEN` as a dev-only fallback (1.5h)
- [ ] Per-audience expiry cache + 401-retry-once logic (1h)
**Deliverable**: Connectors run on SP credentials; pasted token only a documented dev shortcut.
**Acceptance criteria**:
- [ ] With AZURE_CLIENT_ID/SECRET/TENANT_ID set, Overview + Discovery return live data with no MVP_ARM_TOKEN present
- [ ] Token cache hit on second call (no duplicate token requests)
**Risks**: SP needs the PP-admin directory role for ARG `PowerPlatformResources` — verify early (this is the known R-006); fall back to documented role-grant instructions.

#### T-102: Key Vault secret layer
**Phase**: 1 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P0 · **Depends on**: T-101
**Description**: A config module that resolves every secret from Key Vault in production (DefaultAzureCredential → managed identity) and `.env.local` in dev. Secrets: `AZURE-CLIENT-SECRET`, `AZURE-OPENAI-API-KEY`, `SUPABASE-SERVICE-KEY`, `CRON-SECRET`, `TEAMS-WEBHOOK-URL`.
**Steps**:
- [ ] `lib/config/secrets.ts`: `getSecret(name)` — Key Vault via `@azure/keyvault-secrets` + `DefaultAzureCredential` when `KEY_VAULT_URI` set, else `process.env` (1.5h)
- [ ] In-memory cache with TTL; startup validation listing which secrets resolved from where (1h)
- [ ] Migrate all `process.env` secret reads to `getSecret`; non-secret config (tenant id, org URLs) stays app settings (1.5h)
**Deliverable**: Single secret-resolution path; no secret read bypasses it.
**Acceptance criteria**:
- [ ] `grep -rn "process.env.AZURE_OPENAI_API_KEY\|SUPABASE_SERVICE_KEY" lib/ app/` → only inside `secrets.ts`
- [ ] App boots in both modes (env-only dev, Key Vault prod) with a logged source map
**Risks**: DefaultAzureCredential chain confusion locally — document `az login` as the local credential.

#### T-103: Bicep/azd infrastructure template
**Phase**: 1 · **Owner**: Elliot · **Effort**: 6h · **Priority**: P0 · **Depends on**: T-102
**Description**: One-command Azure deployment: App Service plan (Linux, Node 20) + web app with **system-assigned managed identity**, Key Vault with RBAC, role assignment **Key Vault Secrets User** to the identity, app settings using `@Microsoft.KeyVault(SecretUri=...)` references. `azd up` or `az deployment` from the repo.
**Steps**:
- [ ] `infra/main.bicep`: plan, webapp (Node 20, `npm run build`/`start`), Key Vault (RBAC mode, purge protection), role assignment (2h)
- [ ] App settings: Key Vault references for secrets + plain settings for tenant id/org URLs/KEY_VAULT_URI (1h)
- [ ] `azure.yaml` for azd; deployment docs in `docs/DEPLOY.md` (dev vs prod paths) (1.5h)
- [ ] Test deploy to a Witivio/MVP subscription; smoke-test `/` and `/api/overview` (1.5h)
**Deliverable**: `azd up` (or `az deployment sub create`) produces a running, secretless AgentLens.
**Acceptance criteria**:
- [ ] Fresh resource group → working app in one command
- [ ] Azure portal shows zero plaintext secrets in app settings (all `@Microsoft.KeyVault` references)
**Risks**: Next.js standalone output on App Service — set `output: 'standalone'` and test; Key Vault reference propagation delay (~minutes) — document.
**Notes**: Container Apps is the alternative if App Service Node hosting misbehaves; keep Bicep modular.

#### T-104: Webapp Entra SSO (NextAuth) + roles
**Phase**: 1 · **Owner**: Elliot · **Effort**: 6h · **Priority**: P0 · **Depends on**: T-102 · **Blocked by**: AgentLens-WebApp app reg (T-201 script or manual)
**Description**: The app itself requires sign-in. NextAuth (Auth.js) with the Entra ID provider; `admin` and `maker` app roles from the app registration; middleware protects all routes; maker role scopes Maker View (and later RLS).
**Steps**:
- [ ] NextAuth route handler + Entra provider (client id/secret from Key Vault), session strategy JWT (2h)
- [ ] `middleware.ts`: redirect unauthenticated → sign-in; expose session to client (1h)
- [ ] App roles `Admin`/`Maker` in the manifest; map to session; gate Maker View + Settings (2h)
- [ ] Sign-in page + user chip in the sidebar footer (1h)
**Deliverable**: No page or API reachable without Entra sign-in.
**Acceptance criteria**:
- [ ] Anonymous request to `/` and `/api/overview` → 302/401
- [ ] Admin sees everything; Maker sees the maker surface
**Risks**: NextAuth + App Router edge cases — pin versions; redirect URIs must include localhost AND the App Service URL.

#### T-105: API route hardening
**Phase**: 1 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-104
**Description**: Server routes validate session (or CRON secret for `/api/ingest`), rate-limit Ask AI, and never echo tokens/secrets in errors.
**Steps**: [ ] session check helper on all `/api/*` (1h) · [ ] Ask AI per-user rate limit (45m) · [ ] error sanitizer — no header/token leakage (45m) · [ ] security headers (CSP, frame-deny) in `next.config` (30m)
**Deliverable**: Hardened API surface.
**Acceptance criteria**: [ ] Unauthenticated API calls rejected · [ ] Error bodies contain no secret material
**Risks**: Over-tight CSP breaking Recharts — test.

#### T-106: Data-store decision for client deployments
**Phase**: 1 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P1 · **Depends on**: T-103
**Description**: Supabase (US, third-party) is fine for Witivio-internal but likely fails client DPO review (R-012/D-010). Add an **Azure Database for PostgreSQL** option to the Bicep (same Postgres SQL, swap connection string) and document the choice per deployment type.
**Steps**: [ ] optional Bicep module for Azure Postgres Flexible Server (1.5h) · [ ] connection abstraction honoring `DATABASE_URL` (1h) · [ ] decision table in DEPLOY.md (Witivio→Supabase ok; client→Azure PG in-region) (30m)
**Deliverable**: Residency-compliant storage path for client tenants.
**Acceptance criteria**: [ ] App runs against either backend with one connection-string change
**Risks**: Supabase-specific client features (RLS helpers) — keep DB usage plain-Postgres-compatible.

### Phase 2 — App registrations: script + in-app Setup

#### T-201: App-registration provisioning script
**Phase**: 2 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P0 · **Depends on**: none (parallel with Phase 1) · **Blocked by**: Global Admin for consent (external wait)
**Description**: `scripts/provision-app-registrations.ps1` (az CLI) creating both apps and printing exactly what needs a human:
- **AgentLens-Reader** (data SP): ARM `.default` (ARG), Graph `User.Read.All` (application), Dataverse `user_impersonation` per env, optional `CopilotPackages.Read.All` (Agent 365 — license-gated). Prints: "grant admin consent" + "assign **Power Platform Administrator** role to this SP" (the ARG gate).
- **AgentLens-WebApp** (SSO): openid/profile/email delegated, redirect URIs (localhost + App Service URL), app roles Admin/Maker, client secret → straight into Key Vault.
**Steps**: [ ] reader app + permissions + secret→KV (1.5h) · [ ] webapp + redirect URIs + app roles + secret→KV (1.5h) · [ ] consent/role-grant instructions output with portal deep-links (1h) · [ ] idempotency (re-run safe) (1h)
**Deliverable**: One script = both registrations; manual steps reduced to two admin clicks.
**Acceptance criteria**: [ ] Fresh tenant: script + consent + role grant → app fully live · [ ] Re-run makes no duplicates
**Risks**: Tenant policies blocking app creation — document the manual portal path as fallback.

#### T-202: Permission matrix doc
**Phase**: 2 · **Owner**: Elliot · **Effort**: 2h · **Priority**: P1 · **Depends on**: T-201
**Description**: `docs/APP-REGISTRATIONS.md`: every permission, why it's needed, which feature dies without it, least-privilege notes (read-only posture), and what a client security team will ask.
**Deliverable**: The doc a client DPO/security reviewer reads.
**Acceptance criteria**: [ ] Every scope in the script appears in the doc with a justification

#### T-203: In-app Setup page (live permission checks)
**Phase**: 2 · **Owner**: Elliot · **Effort**: 6h · **Priority**: P0 · **Depends on**: T-101, T-201
**Description**: Extend Settings with a **Setup** surface mirroring the Overview sources table but deeper: each required registration/permission/role probed live (ARG query OK? Graph users read OK? Dataverse reachable? Agent 365 403-license vs OK? Key Vault resolving? SSO configured?) with connected/missing/action-needed status + fix instructions. This is the install wizard a client admin walks through.
**Steps**: [ ] `/api/setup-status` running the probe battery (2.5h) · [ ] Setup UI with per-check status, InfoTips, copy-paste fix commands (2.5h) · [ ] link from the DEMO banner + empty states ("connect this in Setup") (1h)
**Deliverable**: Self-diagnosing setup surface.
**Acceptance criteria**: [ ] Each probe shows accurate live status · [ ] A failing check shows the exact command/portal action to fix
**Risks**: Probes triggering throttling — cache results for ~5min.

#### T-204: First-run experience
**Phase**: 2 · **Owner**: Elliot · **Effort**: 3h · **Priority**: P2 · **Depends on**: T-203
**Description**: Fresh deploy with nothing configured lands the admin on Setup with a guided checklist (script → consent → role → vault → done), not on an empty dashboard.
**Acceptance criteria**: [ ] Unconfigured instance redirects admin to Setup with the checklist at step 1

### Phase 3 — DLP guidance page (Govern → "DLP Advisor")

#### T-301: DLP recommendation content model
**Phase**: 3 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P1 · **Depends on**: none
**Description**: Encode the per-archetype DLP recommendations as structured data (`lib/dlp/recommendations.ts`) — this is the ITER-grounded know-how:
- **Default env**: lock down hard — block all non-core (social/consumer: WhatsApp, Facebook, X/Twitter, Instagram, Dropbox, Box, Google family, FTP/SFTP, RSS, Twilio, Slack, Mailchimp, OpenAI-consumer, HTTP family, Direct Line unauthenticated); Business = MS core only (Dataverse, SharePoint, Teams, Outlook, Office 365 group). Pair with `disableShareWithEveryone` tenant lever. Note: making default a Managed Environment can have massive license cost (the ITER ~360k lesson) — DLP-first is the cheap lever.
- **Dev**: permissive business + sandbox connectors; HTTP allowed with review; consumer still blocked.
- **Sandbox/UAT**: mirror prod policy exactly (parity testing).
- **Prod**: strict business-only allowlist; explicit per-connector approval; HTTP-with-Entra-ID allowed ONLY for governed first-party calls (the CS-Kit/PowerShield lesson — blocking `shared_webcontents` breaks governance tooling itself).
- **Trial**: time-boxed permissive, auto-expire reminder.
- **Governance env** (e.g. a Copilot Studio Kit env): business = MS core + Power Platform for Admins + HTTP-with-Entra-ID (api.bap/api.flow/licensing hosts) — the tooling needs the admin APIs.
- Copilot-Studio-specific: Direct Line channel security, agent connector classification, runtime-vs-install enforcement (`AppForbidden` surfaces at RUNTIME — the kit lesson).
**Deliverable**: Structured recommendation pack with per-item reasoning strings (for InfoTips).
**Acceptance criteria**: [ ] Every archetype has classification strategy + connector examples + reasoning · [ ] The HTTP-with-Entra-ID and runtime-enforcement gotchas are explicit

#### T-302: Live tenant DLP comparison (BAP API)
**Phase**: 3 · **Owner**: Elliot · **Effort**: 5h · **Priority**: P1 · **Depends on**: T-101, T-301
**Description**: Read the tenant's actual DLP policies via the BAP Governance API (`api.bap.microsoft.com/providers/PowerPlatform.Governance/v1/...` — the same host PowerShield patches), map policies→environments, and diff against the recommendation: flag **default env with no policy**, envs uncovered by any policy, consumer connectors not blocked, prod≠UAT parity.
**Steps**: [ ] BAP DLP connector (`lib/connectors/dlp.ts`) listing policies + per-env scope + connector groups (2h) · [ ] gap engine: recommendation vs actual per env archetype (2h) · [ ] honest not-connected state when the SP lacks BAP access (1h)
**Deliverable**: Live gap analysis.
**Acceptance criteria**: [ ] Real tenant policies render with env coverage · [ ] A default env without a policy is flagged critical
**Risks**: BAP API shape drift / SP access — degrade to recommendations-only with a "connect to compare" note.

#### T-303: DLP Advisor page UI
**Phase**: 3 · **Owner**: Elliot · **Effort**: 4h · **Priority**: P1 · **Depends on**: T-301, T-302
**Description**: New Govern page "DLP Advisor": archetype cards (pick your env type → see the recommended policy with InfoTips on every reasoning), the live comparison table (your envs vs recommended posture, gap badges), and an export (copy the connector block-list).
**Deliverable**: The page — Elliot's governance workshop content, productized.
**Acceptance criteria**: [ ] Each archetype renders recommendations with reasoning InfoTips · [ ] Live section shows real policies or honest not-connected · [ ] Nav: Govern → DLP Advisor
**Notes**: This is unique content no native tool ships — the differentiator page.

### Phase 4 — UX & real Settings

#### T-401: Transparency primitives everywhere — P1, 4h, deps none
InfoTip + DataSourceBadge on Inventory, Sprawl, Compliance, Risky Patterns, Maturity, Gates (what each metric means + source + state). **Acceptance**: every page has a data-source badge and ⓘ on non-obvious metrics.
#### T-402: Loading skeletons + consistent empty states — P2, 4h
Replace spinner-text with skeleton cards/tables; one `EmptyState` component (icon, message, "connect in Setup" link). **Acceptance**: no bare "Loading..." text remains.
#### T-403: Responsive sidebar + mobile pass — P2, 3h
Drawer sidebar under `lg:`, tables → horizontal scroll, header wrap. **Acceptance**: usable at 390px width.
#### T-404: Real Settings page — P1, 3h, deps T-102, T-203
Settings shows live config: Key Vault URI + secret resolution status (named, not values), source toggles, thresholds persisted to DB, link to Setup. **Acceptance**: settings reflect actual runtime config; no mock fields.

---

## Dependency Map
| Task | Depends On | Blocks | Parallel With | Wait |
|------|-----------|--------|---------------|------|
| T-101 | none | T-102, T-203, T-302 | T-201, T-301 | SP role grant |
| T-102 | T-101 | T-103, T-104, T-404 | — | — |
| T-103 | T-102 | T-106, deploy | T-104 | Azure sub access |
| T-104 | T-102 | T-105 | T-103 | WebApp reg |
| T-105 | T-104 | — | T-106 | — |
| T-201 | none | T-202, T-203 | T-101 | **Admin consent (external)** |
| T-203 | T-101, T-201 | T-204, T-404 | T-301 | — |
| T-301 | none | T-302, T-303 | Phase 1 | — |
| T-302 | T-101, T-301 | T-303 | — | — |

## Critical Path
```
T-101 (4h) → T-102 (4h) → T-103 (6h) → T-104 (6h) → T-105 (3h)  = 23h  [deployable, SSO'd, secretless]
+ T-201 (5h, parallel) → T-203 (6h)                              = ~38h cumulative [client-installable]
With 20% buffer: ~46h to "hand a client the install".
External wait to absorb early: admin consent + PP-admin role grant for the SP (start T-201 week 1).
```

## Timeline (~6–8h/wk)
| Week | Tasks | Milestone |
|------|-------|-----------|
| Wk 1 | T-101, T-201 (start consent wait) | SP flow live; registrations scripted |
| Wk 2 | T-102, T-103 | Key Vault + one-command deploy |
| Wk 3 | T-104, T-105 | **SSO on; hardened; deployment-ready** |
| Wk 4 | T-202, T-203, T-204 | **Setup page; client-installable** |
| Wk 5 | T-301, T-302 | DLP content + live comparison |
| Wk 6 | T-303, T-401 | **DLP Advisor shipped**; transparency pass |
| Wk 7 | T-402, T-403, T-404, T-106 | Polish; client-residency storage option |

## Risk Register
| # | Risk | L | I | Mitigation | Owner |
|---|------|---|---|------------|-------|
| R-101 | SP can't access ARG without PP-admin role; some tenants refuse role grants to SPs | M | H | Verify in week 1 (T-101); fallback = delegated-token mode documented; surface clearly in Setup page | Elliot |
| R-102 | Admin-consent friction at clients (Graph application perms) | H | M | T-201 prints exact consent links; permission matrix doc (T-202) preempts security review | Elliot |
| R-103 | Secrets leak via repo/app settings during migration | L | H | Key Vault references only; secret-scan before each push; `.env.local` gitignored (already) | Elliot |
| R-104 | NextAuth/App Router integration bugs burn time | M | M | Pin Auth.js version; spike in a branch first | Elliot |
| R-105 | Supabase residency rejected by client DPO | M | M | T-106 Azure Postgres option in Bicep | Elliot |
| R-106 | BAP DLP API shape undocumented/drifts | M | L | Degrade to recommendations-only; pin observed shapes with snapshot tests | Elliot |
| R-107 | Key Vault reference propagation delays confuse first deploys | M | L | Document the delay; Setup page probes show live resolution status | Elliot |

## Decision Log
| # | Decision | Date | Rationale |
|---|----------|------|-----------|
| D-018 | (carried) Live cost deferred; no fake money | 2026-06-12 | Honesty principle |
| D-019 | Hosting = Azure App Service + system-assigned managed identity + Key Vault RBAC references | 2026-06-12 | Zero plaintext secrets; simplest Microsoft-native path; Container Apps as fallback |
| D-020 | Webapp auth = NextAuth (Auth.js) with Entra ID provider; app roles Admin/Maker | 2026-06-12 | Standard Next.js SSO; roles drive maker scoping |
| D-021 | Storage: Witivio-internal → Supabase OK; client tenants → Azure Database for PostgreSQL in-region | 2026-06-12 | Residency/DPO (R-105); plain-Postgres compatibility keeps both |
| D-022 | Two app registrations (Reader SP + WebApp SSO), never one combined | 2026-06-12 | Least privilege; data perms ≠ sign-in perms; cleaner consent story |
| D-023 | DLP Advisor ships recommendation-first, live-comparison-second | 2026-06-12 | Content is valuable standalone; BAP read may be unavailable in some tenants |

## Open Questions
- [ ] Witivio Azure subscription or Elliot's MVP sub for the reference deployment?
- [ ] Will client tenants grant the PP-admin directory role to an SP, or do we need a delegated-admin mode as a first-class option? (R-101)
- [ ] Custom domain + TLS for the Witivio-internal instance (agentlens.witivio.com)?
- [ ] DLP Advisor: include the PowerShell lockdown script export (from the ITER default-env guide) as a downloadable artifact?

## Success Criteria
- [ ] `azd up` on a fresh subscription → running AgentLens with **zero plaintext secrets** anywhere (portal-verifiable)
- [ ] All tokens acquired at runtime via the SP; `MVP_ARM_TOKEN` gone from production paths
- [ ] **Entra sign-in required** on every page/API; Admin/Maker roles enforced
- [ ] Fresh client install = run one script + two admin approvals + `azd up`; **Setup page shows all-green**
- [ ] **DLP Advisor** live: 6 archetype recommendations with reasoning + live tenant comparison (or honest not-connected)
- [ ] Every page carries data-source transparency (badge + InfoTips); no bare loading text; usable on mobile
- [ ] A client security reviewer can answer "what can this app access and why" from docs/APP-REGISTRATIONS.md alone
