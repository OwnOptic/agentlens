# AgentLens

**AgentLens is a web dashboard that shows you every Microsoft Copilot Studio agent in your organisation - who built it, where it lives, whether it follows your security rules - and helps you govern them.** It installs as a normal web app (no Dataverse solution to import) and connects to your tenant through one read-only service account.

> **Honesty principle.** AgentLens never shows you a fake number dressed up as a real one. Out of the box it runs on clearly-labelled sample data so you can click around. Each page that needs a live connection shows an honest "not connected" state until you wire it up. Pages that show sample data carry a **DEMO** badge.

---

## Table of contents

1. [Who this README is for](#1-who-this-readme-is-for)
2. [What you get (feature tour)](#2-what-you-get-feature-tour)
3. [The 5-minute local demo](#3-the-5-minute-local-demo-no-azure-needed)
4. [Concepts you need to understand first](#4-concepts-you-need-to-understand-first)
5. [Prerequisites (install these once)](#5-prerequisites-install-these-once)
6. [The two app registrations explained](#6-the-two-app-registrations-explained)
7. [Production deployment - step by step](#7-production-deployment-step-by-step)
8. [Every environment variable explained](#8-every-environment-variable-explained)
9. [Verifying it works (the Setup page)](#9-verifying-it-works-the-setup-page)
10. [How the data flows (architecture)](#10-how-the-data-flows-architecture)
11. [Security model](#11-security-model)
12. [Troubleshooting (every common error)](#12-troubleshooting-every-common-error)
13. [FAQ](#13-faq)
14. [Glossary](#14-glossary)
15. [API reference](#15-api-reference)

---

## 1. Who this README is for

You do **not** need to be a senior developer. If you can copy-paste commands into a terminal and click around the Azure portal, you can run AgentLens. Every step below tells you exactly what to type and what you should see afterwards.

Three audiences:
- **"I just want to look at it"** -> do [Section 3](#3-the-5-minute-local-demo-no-azure-needed) only (5 minutes, no Azure account needed).
- **"I want it running for my company on Azure"** -> do Sections [5](#5-prerequisites-install-these-once) -> [6](#6-the-two-app-registrations-explained) -> [7](#7-production-deployment-step-by-step).
- **"I'm a developer maintaining it"** -> read everything; also see [docs/PLAN-AUDIT-ROBUSTNESS.md](docs/PLAN-AUDIT-ROBUSTNESS.md) for the known-issues backlog.

---

## 2. What you get (feature tour)

AgentLens has 17 pages, grouped into three sections in the left sidebar. **"Live"** = real data from your tenant once connected. **"Demo"** = sample data today (clearly badged); the wiring to make it live is on the roadmap.

### Monitor
| Page | What it shows | Status |
|------|---------------|--------|
| **Overview** (`/`) | Headline counts: agents, environments, agents in the default environment, orphaned agents. A live data-flow diagram and a data-source status table. | **Live** |
| **Agent Discovery** | Finds agents across 4 stores: Copilot Studio, M365 Agent Builder, Azure AI Foundry, Microsoft Fabric. Each source shows connected / not-configured / license-required. | **Live** |
| **Inventory** | Sortable table of every agent with owner, environment, model, auth. | Demo |
| **Sprawl** | Default-environment sprawl + a migration tracker. | Demo |
| **Cost** | **Real Azure spend** (Cost Management: actual MTD + forecast, incl. Power Platform / Copilot Studio PAYG meters) above a per-agent message estimate. | **Live (Azure spend)** + Demo (per-agent) |
| **Alerts** | Budget breaches, idle/orphaned agents, volume spikes. | Demo |
| **Conversation KPIs** | Real intent + sentiment analysis of agent conversations (resolution rate, escalation, CSAT proxy). PII-safe: only aggregate counts are kept. | **Live** |
| **Health** | Per-agent error rate, latency, failed sessions. | Demo |

### Govern
| Page | What it shows | Status |
|------|---------------|--------|
| **Compliance** | Rule-based posture score + violations per agent. | Demo |
| **DLP Advisor** | The recommended DLP policy for each environment type (Default, Dev, Sandbox/UAT, Production, Trial, Governance), plus a live comparison against your tenant's actual DLP policies. | **Live recommendations + live tenant comparison** |
| **Risky Patterns** | Detectors for maker-credential use, tenant-wide sharing, unapproved HTTP connectors. | Demo |
| **Maturity** | A 0-4 governance maturity score. Auto-scored controls are honestly capped at 3 (telemetry can't prove full maturity). | Demo |
| **Release Gates** | Policy-as-code gates with cryptographically signed decisions. | Demo |

### Tools
| Page | What it shows | Status |
|------|---------------|--------|
| **Lifecycle** | PoC -> Pilot -> Production promotion view. | Demo |
| **Maker View** | A maker's-eye view filtered to their own agents. | Demo |
| **Ask (AI)** | Ask plain-English questions about your tenant; answered by Azure OpenAI grounded on live data. | **Live** (needs Azure OpenAI) |
| **Settings** | The Setup page: live status checks for every connection, with copy-paste fixes. | **Live** |

> **Why AgentLens over the alternatives?** The Copilot Studio Kit is a 45 MB Dataverse solution with many dependencies; native admin centres are read-only snapshots. AgentLens is a standalone web app that adds proactive alerting, a migration tracker, policy-as-code gates, and an AI assistant over your tenant - the stateful + proactive pieces the in-platform tools don't combine.

---

## 3. The 5-minute local demo (no Azure needed)

This runs AgentLens on your own computer with sample data. Nothing connects to any tenant. Good for a first look.

**Step 1 - install Node.js 20.** Download the "LTS" installer from <https://nodejs.org>. After installing, open a new terminal and check:
```bash
node --version
```
You should see `v20.x.x` (or higher). If "command not found", restart your terminal or computer.

**Step 2 - get the code and start it.**
```bash
git clone https://github.com/OwnOptic/agentlens.git
cd agentlens
npm install          # downloads dependencies - takes 1-2 minutes
npm run dev          # starts the app
```

**Step 3 - open it.** When the terminal prints `Local: http://localhost:3000`, open that address in your browser.

**What you should see:** the Overview page loads. Live pages show an honest "not connected - add a data source" state (correct - you have no credentials yet). Demo pages show sample data with an amber **DEMO** banner. Click around the sidebar. **Nothing breaks without credentials** - that is by design.

To stop it: press `Ctrl + C` in the terminal.

---

## 4. Concepts you need to understand first

If these terms are new, read this once. It makes everything below make sense.

- **Tenant** - your organisation's Microsoft 365 / Entra (Azure AD) directory. Everything AgentLens reads belongs to your tenant.
- **App registration** - an identity for a *program* (not a person) in Entra. AgentLens uses two of them (explained in [Section 6](#6-the-two-app-registrations-explained)).
- **Service principal (SP)** - the actual account that an app registration creates inside your tenant. When we say "the Reader SP", we mean AgentLens's read-only data account.
- **Client secret** - a password for an app registration. Sensitive. We keep these in Key Vault, never in code.
- **Key Vault** - an Azure service that stores secrets securely. The app reads secrets from here in production so no password is ever written in a config file.
- **Managed identity** - a passwordless identity Azure gives your web app automatically. AgentLens's web app uses its managed identity to read secrets from Key Vault, so there is no "master password" to manage.
- **Power Platform Administrator** - a directory role. The Reader SP needs it to see all Copilot Studio agents across all environments. **Without this role, AgentLens connects fine but shows zero agents** (a common first-time surprise - see [Troubleshooting](#12-troubleshooting-every-common-error)).
- **Admin consent** - a one-time approval by a Global Admin that lets the Reader SP use the Microsoft Graph permission it requests.

---

## 5. Prerequisites (install these once)

For a **production deployment** you need four tools and two kinds of Azure access.

### Tools
| Tool | Why | Install | Verify |
|------|-----|---------|--------|
| **Node.js 20 LTS** | runs the app | <https://nodejs.org> | `node --version` -> `v20+` |
| **Azure CLI (`az`)** | creates app registrations + deploys | <https://aka.ms/installazurecliwindows> | `az version` |
| **Docker** | builds the container image (for the Container Apps path) | <https://www.docker.com/products/docker-desktop> | `docker --version` |
| **Git** | gets the code | <https://git-scm.com> | `git --version` |

> You do **not** need `azd` — deployment is plain `az` (Container Apps or `az deployment` for the Bicep path). Docker is only needed for the Container Apps path in Section 7.

### Azure access you need
- A **Global Administrator** (or someone who is) to grant admin consent and assign the Power Platform Administrator role - **one time only**.
- **Owner** or **Contributor + User Access Administrator** on an Azure subscription (to create resources and role assignments).

> If you don't have these roles yourself, that's fine - the provisioning script in Section 7 prints the exact admin steps so you can hand them to whoever does.

---

## 6. The two app registrations explained

AgentLens uses **two** separate identities. This is deliberate (least privilege - a security reviewer will expect it):

| Registration | What it is | What it can do | Secrets |
|--------------|-----------|----------------|---------|
| **AgentLens-Reader** | the data account | Reads your tenant: agents (via Azure Resource Graph), owners (via Microsoft Graph `User.Read.All`), conversation transcripts (via Dataverse). **Read-only. Never writes.** | one client secret |
| **AgentLens-WebApp** | the sign-in account | Lets your people sign in to the AgentLens website with their Microsoft account. Has **zero** data permissions. Two roles: `Admin` and `Maker`. | one client secret + a random `AUTH_SECRET` for signing sign-in tokens |

**Why two and not one?** The Reader holds powerful read access (Power Platform Admin). The WebApp is the public sign-in door. Keeping them separate means a problem with the sign-in door never exposes the powerful read account. You *can* merge them into one, but then your sign-in app would carry admin-level read access for no benefit. Keep them separate.

You do not create these by hand - the script in the next section does it for you and prints the few steps that genuinely need a human admin.

---

## 7. Production deployment - step by step

Step 1 (app registrations) is shared. Step 2 has **two hosting options** - pick one:
- **Option A - Azure Container Apps** (recommended for testing/demo): scale-to-zero, runs inside the free monthly grant = **$0**. This is the path we validated end-to-end.
- **Option B - Azure App Service + Bicep** (always-on production): managed identity + Key Vault references, one `az deployment`. Use **B1 or higher** - the **F1 Free tier cannot run this app** (its CPU quota is too small for the Next.js cold-start; it trips `QuotaExceeded`).

> Before you start: `git clone` the repo and `cd agentlens`, and run `az login` to sign in to the correct tenant.

### Step 1 - create the two app registrations

This creates both app registrations, generates their secrets, and (if you pass a Key Vault name) stores the secrets in Key Vault automatically.

```powershell
.\scripts\provision-app-registrations.ps1 `
    -TenantId     "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -AppUrl       "https://agentlens-prod.azurewebsites.net" `
    -KeyVaultName "kv-agentlens-prod"
```
- `-TenantId` - your Entra tenant ID (find it: `az account show --query tenantId -o tsv`).
- `-AppUrl` - the public URL the app will have. If you don't know it yet, use a placeholder and re-run after Step 2; the script is safe to run twice (it reuses existing registrations).
- `-KeyVaultName` - the Key Vault to store secrets in. Omit it to print the secrets to the screen instead (you then paste them into Key Vault manually).

**What you should see:** two registrations created, secrets stored, and a **"MANUAL STEPS"** section. The script cannot do these four because they require a Global Admin; do them now (the script prints clickable portal links):
1. **Assign "Power Platform Administrator"** to AgentLens-Reader. *(Skip this and AgentLens shows zero agents.)*
2. **Verify admin consent** for the Reader's Graph permission (green ticks in the portal).
3. **Assign Admin/Maker roles** to the people who should sign in. *(Sign-in is restricted to assigned users.)*
4. **(Later, after Step 2)** give the web app's managed identity access to Key Vault - the Bicep in Step 2 does this automatically, so you only do this by hand if you deployed the app some other way.

### Step 2, Option A - Azure Container Apps (recommended, $0)

Build the image (the repo ships a [Dockerfile](Dockerfile)), push it to a free registry (GitHub Container Registry), and create a scale-to-zero container app.

```bash
# 1. build the standalone image
docker build -t ghcr.io/<your-org>/agentlens:latest .

# 2. push to ghcr (needs a gh token with write:packages: gh auth refresh -s write:packages,read:packages)
gh auth token | docker login ghcr.io -u <your-gh-user> --password-stdin
docker push ghcr.io/<your-org>/agentlens:latest

# 3. one-time: register the providers + extension
az provider register -n Microsoft.App && az provider register -n Microsoft.OperationalInsights
az extension add -n containerapp

# 4. create the environment + app (scale-to-zero = $0 when idle)
az containerapp env create -n agentlens-env -g <rg> -l westeurope --logs-destination none
az containerapp create -n agentlens -g <rg> --environment agentlens-env \
  --image ghcr.io/<your-org>/agentlens:latest \
  --registry-server ghcr.io --registry-username <your-gh-user> --registry-password "$(gh auth token)" \
  --target-port 3000 --ingress external --min-replicas 0 --max-replicas 1 --cpu 0.5 --memory 1.0Gi
```
**What you should see:** the command prints an FQDN like `agentlens.<hash>.westeurope.azurecontainerapps.io`. Open it - the first request after idle cold-starts the container (a few seconds), then it's instant. For live tenant data, pass the SP env vars via `--env-vars AZURE_TENANT_ID=... AZURE_CLIENT_ID=... AZURE_SUBSCRIPTION_ID=...` (the client secret via `--secrets` + a secretref).

### Step 2, Option B - Azure App Service + Bicep (always-on)

```bash
az group create -n <rg> -l westeurope
az deployment group create -g <rg> --template-file infra/main.bicep \
  --parameters baseName=agentlens-prod azureTenantId=<tenant> azureClientId=<reader-client-id> \
               azureAdClientId=<webapp-client-id> appServiceSku=B1
```
This creates, in one go: an App Service (Linux, Node 20) with a **system-assigned managed identity**, a **Key Vault** (the identity is granted `Key Vault Secrets User` automatically), optional Azure App Insights + PostgreSQL, and wires all secrets as Key Vault references. Then deploy the app build (`npm run build && npm run postbuild:standalone`, zip `.next/standalone`, `az webapp deploy --type zip`). Defined in [infra/main.bicep](infra/main.bicep); preview with `az bicep build --file infra/main.bicep` (0 errors). **Use `appServiceSku=B1` or higher - not F1.**

### Step 3 - put the secret values into Key Vault

Step 1 already stored the two client secrets and `AUTH_SECRET` if you passed `-KeyVaultName`. Add the remaining optional secrets only for the features you want:

```bash
# Azure OpenAI key (for the Ask AI page) - optional
az keyvault secret set --vault-name kv-agentlens-prod --name AZURE-OPENAI-API-KEY --value "<your-key>"

# Supabase service key (for the analytics store) - optional
az keyvault secret set --vault-name kv-agentlens-prod --name SUPABASE-SERVICE-KEY --value "<your-key>"

# Cron secret (guards scheduled ingestion) - optional
az keyvault secret set --vault-name kv-agentlens-prod --name CRON-SECRET --value "$(openssl rand -base64 32)"

# Teams webhook (for alert notifications) - optional
az keyvault secret set --vault-name kv-agentlens-prod --name TEAMS-WEBHOOK-URL --value "<your-webhook-url>"
```
The app reads these via Key Vault references that the Bicep already wired into the App Service settings - you do **not** edit any config file. Changes propagate within ~10 minutes (or restart the app to apply immediately: `az webapp restart`).

### Step 4 - open the app and check the Setup page

Open the app URL, sign in, and go to **Settings**. The Setup page runs live checks for every connection and tells you exactly what's missing and how to fix it. See [Section 9](#9-verifying-it-works-the-setup-page).

---

## 8. Every environment variable explained

For **local development**, copy `.env.example` to `.env.local` and fill in only what you need. `.env.local` is gitignored - never commit real secrets. For **production**, these become App Service settings and Key Vault references (the Bicep handles it).

| Variable | Required? | What it's for | Where to get it |
|----------|-----------|---------------|-----------------|
| `AZURE_TENANT_ID` | for live data | your tenant | `az account show --query tenantId -o tsv` |
| `AZURE_CLIENT_ID` | for live data | the **Reader** app's client ID | printed by the Step 1 script |
| `AZURE_CLIENT_SECRET` | for live data (dev only) | the Reader app's secret | Step 1 script (prod: Key Vault `AZURE-CLIENT-SECRET`) |
| `AZURE_SUBSCRIPTION_ID` | for the live Cost page | the subscription to read spend from | `az account show --query id -o tsv` (SP needs **Cost Management Reader**) |
| `AZURE_AD_CLIENT_ID` | to enable sign-in | the **WebApp** app's client ID | Step 1 script |
| `WEBAPP_CLIENT_SECRET` | to enable sign-in | the WebApp app's secret | Step 1 script (prod: Key Vault `WEBAPP-CLIENT-SECRET`) |
| `AUTH_SECRET` | to enable sign-in | signs sign-in tokens | `openssl rand -base64 32` (Step 1 script generates one) |
| `NEXTAUTH_URL` | to enable sign-in | the app's public URL | `http://localhost:3000` locally; your real URL in prod |
| `KEY_VAULT_URI` | production | switches secret reads to Key Vault | output of `azd up` |
| `AZURE_OPENAI_ENDPOINT` | for Ask AI | your Azure OpenAI resource | Azure portal |
| `AZURE_OPENAI_API_KEY` | for Ask AI | Azure OpenAI key | Azure portal (prod: Key Vault) |
| `AZURE_OPENAI_DEPLOYMENT` | for Ask AI | model deployment name, e.g. `gpt-4o` | Azure portal |
| `AZURE_OPENAI_API_VERSION` | for Ask AI | API version (default `2024-08-01-preview`) | leave default |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | for persistence | analytics store | Supabase project settings |
| `DATABASE_URL` | if using Azure Postgres | direct Postgres connection | output of `azd up` with `deployPostgres=true` |
| `AGENTLENS_ORG_URLS` | for Conversation KPIs | comma-separated Dataverse org URLs | your Power Platform environments |
| `CRON_SECRET` | for scheduled ingestion | guards the ingest endpoint | `openssl rand -base64 32` |
| `TEAMS_WEBHOOK_URL` | for alert delivery | incoming Teams webhook | Teams channel connector |

> **Auth is optional.** Leave `AZURE_AD_CLIENT_ID` unset and the app runs without sign-in (useful for local dev). Set it (plus `AUTH_SECRET`) to require Microsoft sign-in.

---

## 9. Verifying it works (the Setup page)

Go to **Settings** in the app. The Setup page runs a battery of live checks and shows each as **ok / missing / error / license-required**, grouped by area (Identity, Data, AI, Storage, Hosting). Every failing check comes with a copy-paste fix.

What "good" looks like:
- **Identity**: "Service principal configured" = ok, "Can acquire ARM token" = ok.
- **Data**: "Azure Resource Graph probe" = ok. (If this is ok but Overview shows zero agents, the Reader is missing the Power Platform Admin role - see Troubleshooting.)
- **AI**: "Azure OpenAI configured" = ok if you wired Ask AI.
- **Storage**: "Key Vault" = ok in production.

The page never displays a secret value - only whether each secret resolves from Key Vault, an environment variable, or is missing.

---

## 10. How the data flows (architecture)

```
   YOUR TENANT                         AGENTLENS                         YOU
   -----------                         ---------                         ---
   Azure Resource Graph  ---\
   Microsoft Graph        ---+--> Reader SP (read-only) --> Web app --> Browser (SSO)
   Dataverse              ---/         |                       |
   BAP Governance API     ---/         |                       +--> Key Vault (secrets)
   Azure OpenAI  <--- grounded query --+                       +--> Supabase / Postgres (history)
```

- **Inventory backbone - Azure Resource Graph.** One query returns every agent in the tenant with owner, environment, model, auth, and sharing - no per-environment fan-out. (Verified against a real tenant.)
- **Conversation intelligence - Dataverse transcripts** analysed in-memory; only aggregate counts are stored (PII-safe).
- **Ask AI - Azure OpenAI**, grounded strictly on live tenant data (it is told never to invent numbers).
- **Secrets - Key Vault**, read by the app's managed identity. **History - Supabase or Azure PostgreSQL.**

Full design notes: [docs/PLAN.md](docs/PLAN.md). Deployment design: [docs/PLAN-DEPLOY.md](docs/PLAN-DEPLOY.md).

---

## 11. Security model

- **Secrets** live in Azure Key Vault. The App Service reads them via its managed identity. No secret is ever written in code, in a committed file, or in plaintext app settings. `.env.local` is gitignored.
- **Read-only posture.** The Reader SP only ever reads. Its permissions are `User.Read.All` (Graph) plus the Power Platform Administrator role (for Azure Resource Graph reads). It cannot modify your environments.
- **Sign-in.** Users authenticate with Entra SSO. Sign-in is restricted to users explicitly assigned the `Admin` or `Maker` role; unassigned users cannot get in.
- **Least privilege.** The sign-in app holds no data permissions; the data app is not exposed to end users.
- **Error hygiene.** Error messages are sanitised before they reach the browser so tokens and tenant identifiers never leak.
- **Data egress.** Limited to the app's own database and (if configured) a Teams webhook for alerts. Conversation content is never stored - only aggregate counts.

> **Maintainers:** a full security + robustness audit and its fix backlog live in [docs/PLAN-AUDIT-ROBUSTNESS.md](docs/PLAN-AUDIT-ROBUSTNESS.md). Review it before a client handover.

---

## 12. Troubleshooting (every common error)

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Overview shows 0 agents** but Setup says ARG is "ok" | The Reader SP doesn't have the **Power Platform Administrator** role. | Assign it (Step 1, manual step 1). Wait ~10 min for it to propagate. |
| **Setup: "Can acquire ARM token" = error** | Wrong client ID/secret, or wrong tenant. | Check `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`. Confirm `az account show` is the right tenant. |
| **Sign-in fails / "redirect URI mismatch"** | The WebApp registration's redirect URI doesn't match `NEXTAUTH_URL`. | Re-run the Step 1 script with the correct `-AppUrl`, or add the URI in the portal under the WebApp registration -> Authentication. |
| **"You don't have access" after sign-in** | The user has no Admin/Maker role assigned. | Assign a role (Step 1, manual step 3). |
| **Agent Discovery: M365 source = "license required" (403)** | That source needs an Agent 365 license. | Expected without the license. The other sources still work. |
| **Ask AI: "Azure OpenAI not configured"** | The OpenAI env vars/secret aren't set. | Set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and the `AZURE-OPENAI-API-KEY` secret. |
| **`azd up` fails with a Key Vault access error** | The managed identity role assignment hasn't propagated. | Wait a few minutes and re-run `azd deploy`. |
| **Secrets changed in Key Vault but app still uses old value** | App Service caches Key Vault references. | `az webapp restart` to force a refresh. |
| **`npm run dev` won't start** | Wrong Node version. | `node --version` must be 20+. Reinstall from nodejs.org. |
| **A page shows "DEMO" / sample numbers** | That page isn't wired to live data yet. | Expected - see the feature table in [Section 2](#2-what-you-get-feature-tour). Live pages are marked **Live**. |

Still stuck? Check the App Service log stream: `az webapp log tail --name <app-name> --resource-group <rg>`.

---

## 13. FAQ

**Do I have to import anything into Dataverse?** No. That's the point - AgentLens is a standalone web app.

**Does it change anything in my tenant?** No. It is read-only. The only things created are the two app registrations and the Azure resources you choose to deploy (a Container App, or an App Service + Key Vault).

**Can I run it without sign-in?** Yes, for local dev - leave `AZURE_AD_CLIENT_ID` unset. For production, enable sign-in.

**Where is my data stored?** Agent history goes to your Supabase project or your Azure PostgreSQL database - your choice, in your control. Conversation content is never stored, only aggregate counts.

**One instance per tenant?** Yes - that's the intended model.

**Is it open source?** Not yet - the repo is private pending IP clearance.

**How much does it cost to run?** **$0 on Azure Container Apps** (scale-to-zero + the free monthly grant) - the recommended path for testing/demo. For an always-on App Service: ~$13/mo (B1) + Key Vault (pennies), optionally Azure OpenAI (pay-per-use) and a database. **Note:** the App Service **F1 Free tier does not work** - its CPU quota is too small for the app's cold-start; use B1+ or Container Apps.

---

## 14. Glossary

| Term | Plain meaning |
|------|---------------|
| **ARG** (Azure Resource Graph) | the Azure service AgentLens queries to list every agent in one shot |
| **BAP API** | the Power Platform governance API; AgentLens reads your DLP policies through it |
| **Dataverse** | the database behind Power Platform; holds conversation transcripts |
| **DLP** | Data Loss Prevention - rules about which connectors agents may use |
| **Managed identity** | a passwordless identity Azure gives your app to read Key Vault |
| **SP / service principal** | the actual account an app registration creates in your tenant |
| **Container Apps (ACA)** | Azure's serverless container host; scale-to-zero + a free monthly grant make the demo deploy $0 |
| **ghcr** | GitHub Container Registry - free image registry the Container Apps path pulls from |
| **Standalone output** | a self-contained build of the app that runs without a build step on the server (`node server.js`) |

---

## 15. API reference

### A. The app's own endpoints (what the browser calls)

All routes live under `/api`. After the security hardening, every data route calls `requireSession`; in **demo / auth-optional mode** (no `AZURE_AD_CLIENT_ID`) the guard returns a synthetic dev-admin, so the app is fully usable without sign-in. State-changing routes additionally require the `admin` role.

| Endpoint | Called by (page) | Method(s) | Notes |
|---|---|---|---|
| `/api/overview` | Overview | GET | live ARG counts |
| `/api/discover` | Agent Discovery | GET | 4-source sweep |
| `/api/conversation-intel` | Conversation KPIs | GET | Dataverse transcripts (PII-safe, aggregate only) |
| `/api/cost` | Cost | GET | real Azure spend + per-agent estimate |
| `/api/dlp` | DLP Advisor | GET | recommendations + live tenant DLP comparison |
| `/api/compliance` | Compliance | GET, POST | POST = ack/resolve violations (admin) |
| `/api/gates` | Release Gates | GET, POST, DELETE | POST/DELETE = sign/revoke decision (admin) |
| `/api/alerts` | Alerts | GET, POST, PATCH | POST = run rules / PATCH = state (admin) |
| `/api/maturity` | Maturity | GET, POST | POST = re-score (admin) |
| `/api/health` | Health | GET | |
| `/api/ask` | Ask (AI) | POST | Azure OpenAI, rate-limited, 2000-char cap |
| `/api/setup-status` | Settings | GET | live setup probe battery |
| `/api/config/verify`, `/api/config/save` | Settings / Setup wizard | POST (+ GET source map) | |
| `/api/auth/providers`, `/api/auth/session` | UserChip (every page) | GET | NextAuth |
| `/api/auth/[...nextauth]` | sign-in / callback / csrf | GET, POST | NextAuth handler |

**Backend-only routes** (not called by the current UI): `/api/ingest` (scheduled ingestion, guarded by `CRON_SECRET`), `/api/agents`, `/api/kpis`, `/api/report` (mock-seed surfaces kept for integration), `/api/live` (legacy - superseded by `/api/overview`).

### B. External APIs the backend calls (via the service principal)

All read-only, authenticated with the AgentLens-Reader SP unless noted.

| Host | Used for | Auth / permission |
|---|---|---|
| `login.microsoftonline.com` | Entra token (MSAL client-credentials) | SP client secret |
| `management.azure.com` | Azure Resource Graph (agent/env inventory) · Cost Management (real spend) · Foundry agents | ARM token; PP-Admin role (ARG), Cost Management Reader (cost) |
| `graph.microsoft.com` | owner resolution · Agent 365 `copilotPackages` | `User.Read.All`; `CopilotPackages.Read.All` (license-gated) |
| `<org>.crm.dynamics.com` | Dataverse Web API — transcripts, KPIs, deep scan, agents | Dataverse per-environment |
| `api.bap.microsoft.com` | BAP Governance — tenant DLP policies | ARM token |
| `api.powerplatform.com` · `licensing.powerplatform.microsoft.com` | PPAC licensing / capacity | ARM token |
| `api.fabric.microsoft.com` (+ `analysis.windows.net` audience) | Fabric data agents | Fabric Administrator |
| `<resource>.openai.azure.com` | Azure OpenAI — Ask AI + conversation classifier | API key (Key Vault) |
| `<project>.supabase.co` | persistence (history) — optional | service key (Key Vault) |
| `*.webhook.office.com` (Teams) | alert delivery — optional | webhook URL (Key Vault) |

> **Data egress:** the only outbound writes are to your own database (Supabase / Azure Postgres) and the optional Teams webhook. No tenant data is sent anywhere else; conversation content is processed in-memory and never stored.

---

## For developers

- **Tech:** Next.js 14 (App Router) - TypeScript (strict) - Tailwind CSS - Zustand - Recharts - lucide-react - `@azure/msal-node` - `@azure/identity` / `@azure/keyvault-secrets` - NextAuth - Supabase - Azure OpenAI.
- **Run checks:** `npm test` (vitest unit suite), `npx tsc --noEmit` (types), `npm run build` (production build), `az bicep build --file infra/main.bicep` (infra).
- **Container:** [Dockerfile](Dockerfile) (multi-stage Next standalone) + `npm run postbuild:standalone` (copies static assets into `.next/standalone`).
- **Persistence:** gate decisions + compliance violation state persist to Supabase when configured, else an in-memory fallback (so it runs with an empty `.env`).
- **Docs:** [DEPLOY.md](docs/DEPLOY.md) (runbook) - [APP-REGISTRATIONS.md](docs/APP-REGISTRATIONS.md) (permission matrix) - [PLAN-DEPLOY.md](docs/PLAN-DEPLOY.md) (deployment design) - [PLAN-AUDIT-ROBUSTNESS.md](docs/PLAN-AUDIT-ROBUSTNESS.md) (audit + known-issues backlog, all phases executed).
- **License:** Private (pending IP-ownership clearance).
