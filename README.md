# AgentLens

AgentLens is a standalone Next.js governance and observability dashboard for
Microsoft Copilot Studio agents.  It connects to your Power Platform tenant
through one Entra service principal, surfaces every agent across all environments
in one view (inventory, compliance, maturity, release gates, AI assistant), and
installs without importing a Dataverse solution.

> **Honesty principle.** The app runs on demo data out of the box and says so.
> Every page that requires a live connection shows an honest "not connected"
> state rather than fabricating numbers.  Real data flows once the two app
> registrations and env vars are configured.

---

## Quick start

```bash
git clone https://github.com/YOUR-ORG/agentlens.git
cd agentlens
npm install
npm run dev        # http://localhost:3000  - demo data, no credentials needed
```

The app is fully navigable on demo data.  Nothing breaks without credentials;
pages that need live connections display a setup prompt.

---

## Production deploy

See **[docs/PLAN-DEPLOY.md](docs/PLAN-DEPLOY.md)** for the four-step path:

1. Run the provisioning script (app registrations + Key Vault secrets).
2. Deploy to Azure App Service with a system-assigned managed identity.
3. Point the managed identity at the Key Vault (`Key Vault Secrets User` role).
4. Set the non-secret app settings (`AZURE_TENANT_ID`, `NEXTAUTH_URL`, etc.).

---

## App registrations

Two Entra app registrations are required.

| Registration | Purpose |
|---|---|
| **AgentLens-Reader** | Service principal for data reads (Azure Resource Graph, Microsoft Graph).  Uses client credentials; the Power Platform Administrator directory role grants ARG inventory access. |
| **AgentLens-WebApp** | Entra SSO for the web app (next-auth).  Issues ID tokens; no API permissions needed.  Two roles: `admin` and `maker`. |

Provision both with one script:

```powershell
.\scripts\provision-app-registrations.ps1 `
    -TenantId    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -AppUrl      "https://agentlens.azurewebsites.net" `
    -KeyVaultName "agentlens-kv"
```

The script is idempotent (safe to re-run).  It prints the four manual steps
that cannot be automated (Power Platform Administrator role assignment, admin
consent verification, user role assignment, managed identity Key Vault access).

Full permission matrix, least-privilege justification, and security reviewer
FAQ: **[docs/APP-REGISTRATIONS.md](docs/APP-REGISTRATIONS.md)**.

---

## Security model

- **Secrets** - all in Azure Key Vault; the App Service reads them via managed
  identity.  No secret in code, no secret in app settings, `.env.local` is
  gitignored.
- **Read-only posture** - AgentLens never writes to client Power Platform
  environments.  The only permissions are `User.Read.All` (Graph) and the
  PP-Admin directory role (ARG reads).
- **SSO** - users sign in via Entra; role assignment (`admin`/`maker`) is
  required before access is granted.
- **Data egress** - limited to the app's own Supabase DB and the configured
  Teams webhook URL.  No message content is read or stored.

---

## Why AgentLens

| | AgentLens | Copilot Studio Kit | Native PPAC / Agent 365 |
|---|---|---|---|
| Form | Standalone web app | Dataverse managed solution | Microsoft admin surfaces |
| Install | 1 app reg + ARG read | 45 MB solution + deps + Code Apps + connections | Built-in |
| Proactive **alerting** (Teams/email) | ✅ | ❌ | ❌ |
| **Migration tracker** (default-env sprawl) | ✅ | ❌ | partial |
| **Policy-as-code** release gates | ✅ | ❌ | ❌ |
| Honest **maturity** assessment | ✅ | ❌ | ❌ |
| **Ask AI** over your tenant | ✅ | ❌ | ❌ |

The durable wedge is the **standalone form + proactive + stateful** pieces the in-platform tools don't combine.

## Features (15 pages)

**Monitor** — Live (MVP, real ARG data) · Overview (exec dashboard) · Inventory · Sprawl + Migration tracker · Cost + Capacity · Alerts · Conversation KPIs · Health
**Govern** — Compliance (rules + violations + score) · Risky Patterns · Maturity (0-4, partial-capped) · Release Gates (policy-as-code, signed decisions)
**Tools** — Lifecycle · Maker View · **Ask (AI)** · Settings

## Architecture

- **Inventory backbone — Azure Resource Graph.** One `PowerPlatformResources` query returns the whole tenant's agents with owner, environment, sharing, model, auth, channels, and connector counts. No per-environment fan-out, no per-env app user. (Verified live against a real tenant.)
- **Cost — PPAC Licensing API** (+ CSV fallback). *Deferred in this build; Cost page is estimate-only.*
- **Store — Supabase (Postgres)** for history, baselines, migration state, violations, and gate decisions.
- **Ask AI — Azure OpenAI** (secret-key), grounded on live ARG data.
- **Auth — one Entra service principal** with Power Platform Admin role + admin-consented Graph; app login via Entra SSO.

See [docs/PLAN-DEPLOY.md](docs/PLAN-DEPLOY.md) for the full deployment plan and [docs/PLAN.md](docs/PLAN.md) for design decisions and risks.

## Configuration (`.env.local`)

| Variable | Purpose | Needed for |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | App data store | persistence |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | AgentLens-Reader SP credentials | live inventory |
| `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` | AgentLens-WebApp SSO | Entra sign-in |
| `AUTH_SECRET` | next-auth JWT signing key | Entra sign-in |
| `NEXTAUTH_URL` | Public app URL | Entra sign-in |
| `KEY_VAULT_URI` | Key Vault endpoint | production (replaces all secrets above) |
| **`AZURE_OPENAI_ENDPOINT`** | `https://<resource>.openai.azure.com` | **Ask AI** |
| **`AZURE_OPENAI_API_KEY`** | Azure OpenAI secret key | **Ask AI** |
| **`AZURE_OPENAI_DEPLOYMENT`** | chat deployment (e.g. `gpt-4o`) | **Ask AI** |
| `AZURE_OPENAI_API_VERSION` | API version (default `2024-08-01-preview`) | Ask AI |
| `CRON_SECRET` | guards `/api/ingest` | scheduled ingestion |
| `TEAMS_WEBHOOK_URL` | alert delivery | alerts |

Copy `.env.example` to `.env.local` for the full annotated reference.

## Data sources & honesty

- **Live (MVP)** and **Ask AI** - real tenant data via Azure Resource Graph.
- **All other pages** - realistic demo seed data (clearly labelled until connectors are pointed at your tenant).
- Cost is labelled **estimated** (live licensing deferred). Maturity auto-scoring is **partial-capped** (telemetry never asserts full compliance). Conversation KPIs are **aggregate-only** (no message content).

## Tech

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · Zustand · Recharts · lucide-react · Supabase · `@azure/msal-node` · Azure OpenAI.

## License

Private (pending IP-ownership clearance). Not yet open-source.
