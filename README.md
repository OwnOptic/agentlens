# AgentLens v2

**A standalone, install-light governance & observability webapp for Microsoft Copilot Studio agents.**

AgentLens surfaces every Copilot Studio agent across a Power Platform tenant in one dashboard - inventory, cost, capacity, compliance, maturity, health - with proactive alerting, policy-as-code release gates, and an AI assistant grounded on your real tenant data. It runs as a Next.js web app (not a Power Platform solution), reads through **one Entra app registration**, and installs in minutes with no Dataverse import into your environments.

> Status: **v2 beta.** The full surface is built and runs on realistic demo data; the **Live (MVP)** page and **Ask AI** answer over **real tenant data** via Azure Resource Graph. See [Data sources](#data-sources--honesty).

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

See [docs/PLAN.md](docs/PLAN.md) for the full design, phases, decisions, and risks.

## Quick start

```bash
npm install
cp .env.example .env.local      # then fill in the values below
npm run dev                     # http://localhost:3000
```

The app runs out of the box on **demo data**. To light up the live + AI features, set the env vars below.

## Configuration (`.env.local`)

| Variable | Purpose | Needed for |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | App data store | persistence |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Service principal (ARG/Graph) | live inventory in prod |
| `MVP_ARM_TOKEN` | A management.azure.com token (dev shortcut for the Live page) | Live (MVP) page |
| **`AZURE_OPENAI_ENDPOINT`** | `https://<resource>.openai.azure.com` | **Ask AI** |
| **`AZURE_OPENAI_API_KEY`** | Azure OpenAI **secret key** | **Ask AI** |
| **`AZURE_OPENAI_DEPLOYMENT`** | chat deployment (e.g. `gpt-4o`) | **Ask AI** |
| `AZURE_OPENAI_API_VERSION` | API version (default `2024-08-01-preview`) | Ask AI |
| `CRON_SECRET` | guards `/api/ingest` | scheduled ingestion |
| `TEAMS_WEBHOOK_URL` | alert delivery | alerts |

### Ask AI (Azure OpenAI)

The **Ask (AI)** page sends your question to `/api/ask`, which fetches **real tenant data** (Azure Resource Graph) as grounding context and asks **Azure OpenAI** to answer - using only that data, no hallucinated agents or numbers. Auth is **secret-key** (`api-key` header). To enable it, paste your Azure OpenAI endpoint, key, and deployment name into `.env.local`. Without them, the page shows a "configure Azure OpenAI" message.

## Data sources & honesty

- **Live (MVP)** and **Ask AI** → real tenant data via Azure Resource Graph.
- **All other pages** → realistic demo seed data (clearly the case until connectors are pointed at your tenant).
- Cost is labelled **estimated** (live licensing deferred). Maturity auto-scoring is **partial-capped** (telemetry never asserts full compliance). Conversation KPIs are **aggregate-only** (no message content).

## Tech

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · Zustand · Recharts · lucide-react · Supabase · `@azure/msal-node` · Azure OpenAI.

## License

Private (pending IP-ownership clearance). Not yet open-source.
