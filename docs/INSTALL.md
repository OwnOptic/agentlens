# AgentLens v2 Installation Guide

Complete step-by-step guide to deploy AgentLens in your tenant.

**Estimated time:** 15-20 minutes  
**Difficulty:** Intermediate (requires Azure portal and app registration knowledge)

---

## Prerequisites

- **Tenant Admin** access to your Entra ID (Microsoft Entra)
- **Power Platform Admin** role (to list environments and agents)
- **Node.js 18+** (local development only; skip if deploying directly to a platform)
- An active **Azure subscription** (for hosting the web app)

---

## Step 1: Deploy the Web App

### Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/YOUR-ORG/agentlens.git
cd agentlens
npm install
npm run build
npm start
```

The app will run at `http://localhost:3000`.

### Production Deployment

Choose your hosting platform:

#### Option A: Vercel (Easiest)

1. Push your code to GitHub
2. Visit [vercel.com](https://vercel.com) and sign in with GitHub
3. Click "Add New... > Project" and select the `agentlens` repo
4. Vercel auto-detects Next.js; no additional config needed
5. Paste your environment variables (see Step 4) into the project settings
6. Deploy

#### Option B: Azure App Service

1. Create a new App Service in the Azure Portal
2. Configure deployment from GitHub (or push manually via git)
3. Ensure runtime is set to Node.js 18+
4. Add environment variables via Configuration > Application Settings
5. Start the app

#### Option C: Docker

Build and push the container:

```bash
docker build -t agentlens:latest .
docker push YOUR-REGISTRY/agentlens:latest
```

Then deploy to your container platform (AKS, Azure Container Instances, etc.).

### Secure with Entra ID

The app should be protected with Entra ID Single Sign-On (SSO). Configuration depends on your hosting platform:

- **Vercel:** Use a Vercel authentication add-on or middleware  
- **Azure App Service:** Enable App Service Authentication > Azure AD  
- **Self-hosted:** Integrate MSAL.js (or similar) into the Next.js auth middleware

For simplicity in Step 4, we assume your app is already running at a public HTTPS URL (e.g., `https://agentlens.contoso.com`).

---

## Step 2: Create an Entra App Registration

AgentLens reads agents and metrics via an Entra service principal. This step registers that principal and grants it permissions.

### Create the App Registration

1. Go to **[Azure Portal](https://portal.azure.com) > Entra ID > App registrations > + New registration**

2. Fill in:
   - **Name:** `AgentLens` (or your choice)
   - **Supported account types:** `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI:** Leave blank for now (we'll add it if you use interactive auth)

3. Click **Register**

4. Note the **Application (client) ID** and **Directory (tenant) ID** — you'll need these in Step 4.

### Grant API Permissions

1. In the app registration, go to **API permissions > + Add a permission**

2. Search for and add **Azure Resource Graph (Microsoft.ResourceGraph)**:
   - Click **Application permissions**
   - Check `ResourceGraph.Read.All`
   - Click **Add permissions**

3. Add **Microsoft Graph**:
   - Click **Delegated permissions**
   - Search for and check `User.Read` (for identity resolution)
   - Click **Add permissions**

4. **Grant admin consent:**
   - Back on the API permissions page, click **Grant admin consent for [Your Tenant]**
   - Confirm the prompt

### Create a Client Secret (for server-to-server calls)

1. Go to **Certificates & secrets > + New client secret**
2. Set expiration to 24 months
3. Click **Add**
4. Copy the secret value **immediately** (you cannot retrieve it later)
5. Store it securely in your deployment platform's secrets manager (Vercel, Azure Key Vault, etc.)

> **Important:** Never commit the client secret to Git. Use environment variables or secrets management.

---

## Step 3: Configure Environment Variables

Create a `.env.local` file (for local dev) or configure via your deployment platform's settings panel:

```env
# Entra / Azure
NEXT_PUBLIC_TENANT_ID=<your-tenant-id>
NEXT_PUBLIC_CLIENT_ID=<app-registration-client-id>
AGENTLENS_CLIENT_SECRET=<client-secret>

# App URL
NEXT_PUBLIC_APP_URL=https://agentlens.contoso.com

# Optional: Supabase (for persistent metrics storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Optional: Feature flags
FEATURE_ALERTS_ENABLED=true
FEATURE_METRICS_INGESTION=true
```

### Environment Variable Reference

| Variable | Type | Required | Purpose |
|----------|------|----------|---------|
| `NEXT_PUBLIC_TENANT_ID` | string | Yes | Your Entra tenant ID (from app registration) |
| `NEXT_PUBLIC_CLIENT_ID` | string | Yes | App registration Client ID |
| `AGENTLENS_CLIENT_SECRET` | string | Yes | Client secret (server-side only, never exposed to client) |
| `NEXT_PUBLIC_APP_URL` | string | Yes | Base URL of this deployment (e.g., `https://agentlens.contoso.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | string | No | Supabase project URL (for time-series metrics storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | string | No | Supabase service role key (required if Supabase is enabled) |
| `FEATURE_ALERTS_ENABLED` | string | No | Enable Teams/email alerts (default: `true`) |
| `FEATURE_METRICS_INGESTION` | string | No | Enable metrics ingestion job (default: `true`) |

---

## Step 4: Optional – Run the Provision Script

The provision script is **optional** for v2. It is useful if you need to:
- Add a read-only application user to specific Power Platform environments (legacy deep-scan)
- Verify the service principal has Dataverse permissions

If you're using Azure Resource Graph (the recommended path), skip this step.

### If You Want to Provision Deep-Scan Access

Run the provision script:

```bash
npx ts-node scripts/provision-app-user.ts \
  --tenant-id <your-tenant-id> \
  --client-id <client-id> \
  --environments "contoso-prod.crm.dynamics.com,contoso-dev.crm.dynamics.com" \
  --dry-run false
```

**Options:**
- `--tenant-id` - Your Entra tenant ID
- `--client-id` - App registration Client ID
- `--environments` - Comma-separated list of Dataverse environment FQDNs
- `--dry-run` - Set to `true` to preview; `false` to apply

**What it does:**
1. Authenticates as the service principal (client credentials)
2. Adds the principal as an application user to each environment
3. Assigns a least-privilege read-only security role
4. Is idempotent (safe to run multiple times)

---

## Step 5: Verify and Launch

### Local Testing

1. Start the app:
   ```bash
   npm run dev
   ```

2. Open `http://localhost:3000` in your browser

3. You should see the AgentLens dashboard with mock data (if no live tenants are configured)

4. Go to **Settings > Setup Wizard** and enter your tenant ID and app registration details

### Production Verification

1. Ensure the app is running at your deployed URL
2. Verify Entra ID SSO is enforcing authentication
3. Go to **Settings > Setup Wizard** and test the connection
4. Check that agents appear on the **Inventory** page
5. Verify alerts are generating on the **Alerts** page

---

## Troubleshooting

### "Failed to connect to Azure Resource Graph"

- **Cause:** Client secret is missing or invalid, or app registration lacks ARG permission
- **Solution:**
  1. Verify `AGENTLENS_CLIENT_SECRET` is set in your environment
  2. Check that `Azure Resource Graph` is listed in the app registration's API permissions
  3. Confirm admin consent was granted
  4. Try re-authenticating: clear browser cookies and re-login

### "No agents found"

- **Cause:** Environments may not have any Copilot Studio agents, or the service principal lacks visibility
- **Solution:**
  1. Verify you have created at least one Copilot Studio agent in your tenant
  2. Check that the service principal has **Power Platform Admin** role (or equivalent)
  3. Use **Settings > Deep Scan** to manually check agent inventory

### "Settings page is blank"

- **Cause:** Missing environment variables or configuration database
- **Solution:**
  1. Verify all `NEXT_PUBLIC_*` variables are set
  2. Check browser console for errors (F12 > Console tab)
  3. Ensure Supabase is configured if you're using persistent settings storage

---

## Next Steps

1. **Configure Alerts** - Go to Settings > Setup Wizard and add a Teams webhook for proactive notifications
2. **Set Up Governance Rules** - Go to Govern > Compliance and create custom rules
3. **Assess Maturity** - Go to Govern > Maturity and run an assessment
4. **Define Release Gates** - Go to Govern > Release Gates and create policies

See the [Architecture Guide](ARCHITECTURE.md) for a deeper dive into how AgentLens works.

---

## Support

- **Issues:** Check the [GitHub Issues](https://github.com/YOUR-ORG/agentlens/issues) page
- **Documentation:** See [docs/](../docs/) for guides and architecture
- **Questions:** Contact your Copilot governance team

---

**Version:** v2.0.0-beta  
**Last Updated:** 2026-06-12
