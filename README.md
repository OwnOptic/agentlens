# AgentLens

**Single-tenant Copilot agent governance and observability webapp.**

AgentLens surfaces all Copilot Studio agents across your Power Platform environments in one dashboard. Track daily cost, usage, messages, and alerts - and apply governance controls with a fraction of the complexity of CoE Kit or Copilot Studio Kit.

## What is AgentLens?

- **Agent inventory** - See every Copilot Studio agent in every environment at a glance.
- **Daily metrics** - Message count, session count, estimated LLM cost, grouped by agent and date.
- **Governance alerts** - Budget breaches, volume spikes, new agents in default environments, model meter mismatches, orphaned/idle agents.
- **Single-tenant** - Designed for one organization (one Entra tenant) to govern its own agent fleet.

## 4-Step Install

### Step 1: Deploy the Web App

Deploy the Next.js app to your hosting platform (Vercel, Azure App Service, etc.):

```bash
npm install
npm run build
npm start
```

Or use the Vercel CLI:

```bash
vercel deploy
```

Secure the app with your preferred authentication (e.g., Entra ID Single Sign-On via MSAL).

### Step 2: Register an Entra App + Consent

Create a new app registration in Azure Entra ID:

1. Go to **Azure Portal > Entra ID > App registrations > New registration**
2. Name: `AgentLens` (or your choice)
3. Supported account types: `Accounts in this organizational directory only`
4. Redirect URI: `Web > https://<your-app-domain>/callback` (or the auth callback of your deployment)
5. After creation, go to **API permissions**:
   - Add `Dataverse` (find in "APIs my organization uses") and grant:
     - `user_impersonation` (delegated)
   - Add `Microsoft Graph` and grant:
     - `Environment.Read.All` (delegated)
6. Click **Grant admin consent for [org]** to pre-consent for all users

**Save the Client ID and Tenant ID** - you'll need these in Step 4.

### Step 3: Run the Provision Script

The provision script adds a read-only app-user (service principal) to each Power Platform environment, so AgentLens can read agents and metrics without impersonating users.

```bash
npx ts-node scripts/provision-app-user.ts \
  --tenant-id <tenant-id> \
  --client-id <client-id> \
  --environments "prod,dev,staging" \
  --dry-run false
```

Options:
- `--tenant-id` - Your Entra tenant ID
- `--client-id` - The app registration Client ID from Step 2
- `--environments` - Comma-separated list of environment FQDNs (e.g., `contoso-prod.crm.dynamics.com`)
- `--dry-run` - Set to `false` to actually add users; `true` to preview

The script:
1. Authenticates as the app registration (client credentials flow)
2. For each environment, adds the service principal as an application user
3. Assigns a least-privilege read-only security role
4. Is idempotent - running twice is safe

### Step 4: Configure Environment Variables

Create a `.env.local` file (or set via your deployment platform):

```env
NEXT_PUBLIC_TENANT_ID=<tenant-id>
NEXT_PUBLIC_CLIENT_ID=<client-id>
NEXT_PUBLIC_APP_URL=https://<your-app-domain>

# Dataverse API endpoint (example for US)
DATAVERSE_API_ENDPOINT=https://[environment-url]/api/data/v9.2

# Optional: Supabase (for metrics storage)
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Optional: feature flags
FEATURE_ALERTS_ENABLED=true
FEATURE_METRICS_INGESTION=true
```

Restart the app and verify it connects to your environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      AgentLens (Next.js)                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Client (React)                                    │ │
│  │  - Dashboard (agents, metrics, alerts)            │ │
│  │  - Environment selector                           │ │
│  │  - Governance rules UI                            │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  API Routes (Next.js /api)                         │ │
│  │  - /api/agents         (read from Dataverse)      │ │
│  │  - /api/metrics        (read from Dataverse/DB)   │ │
│  │  - /api/alerts         (read from Supabase)       │ │
│  │  - /api/ingest         (write metrics to DB)      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │                           │
         ├──── Microsoft Graph (Read: Environments)
         │
         └──── Dataverse Web API (Read: Agents & Metrics)
                  └─ Service Principal (app-user in each env)
```

### Key Components

| Layer | Role |
|-------|------|
| **Client** | React + Zustand state, TailwindCSS styling, Recharts dashboards |
| **API Routes** | Next.js route handlers; fetch from Dataverse + Supabase |
| **Dataverse** | Source of truth for agents, environments, telemetry tables |
| **Supabase (optional)** | Time-series storage for daily metrics and alerts |
| **Service Principal** | Application-user added to each env via provision script |

### Data Flow

1. **Ingestion** - Hourly job queries Copilot Studio Dataverse tables (bots, metrics) and writes summaries to Supabase
2. **Reading** - Dashboard calls `/api/agents` and `/api/metrics`, which aggregate across environments
3. **Alerts** - Scheduled job evaluates governance rules, raises alerts to Supabase
4. **UI** - Charts and tables render from the API responses

## Environment Variables

| Variable | Type | Required | Purpose |
|----------|------|----------|---------|
| `NEXT_PUBLIC_TENANT_ID` | string | Yes | Entra tenant ID |
| `NEXT_PUBLIC_CLIENT_ID` | string | Yes | Entra app registration Client ID |
| `NEXT_PUBLIC_APP_URL` | string | Yes | Base URL of this app (for MSAL redirects) |
| `DATAVERSE_API_ENDPOINT` | string | Yes | Dataverse Web API base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | string | No | Supabase project URL (for metrics storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | string | No | Supabase service role API key (server-side only) |
| `FEATURE_ALERTS_ENABLED` | string | No | Enable/disable alert system (default: `true`) |
| `FEATURE_METRICS_INGESTION` | string | No | Enable/disable metrics ingestion (default: `true`) |

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/your-org/agentlens/issues)
- Review the [Install Guide](docs/INSTALL.md) for troubleshooting
- Contact your Copilot/AI leadership
