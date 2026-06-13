# AgentLens - Deployment Runbook

**Version**: 1.0 | **Date**: 2026-06-12 | **Owner**: Elliot Margot

This runbook covers deploying AgentLens to Azure using Bicep + Azure Developer CLI (`azd`). Follow the four steps in order. The two admin-consent steps (step 2) are the only manual gates.

---

## Prerequisites

Before starting, ensure the following are installed and authenticated:

| Tool | Version | Install |
|------|---------|---------|
| Azure CLI (`az`) | >= 2.58 | https://learn.microsoft.com/cli/azure/install-azure-cli |
| Azure Developer CLI (`azd`) | >= 1.9 | https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd |
| Node.js | >= 20 LTS | https://nodejs.org |
| PowerShell | >= 7 | https://github.com/PowerShell/PowerShell |

Log in before proceeding:

```bash
az login
azd auth login
```

You will need:
- An Azure subscription where you can create a resource group and resources
- A user account that is **Global Administrator** (or Application Administrator + User Access Administrator) in the target Entra tenant, for step 2

---

## Step 1 - Provision app registrations

Run the provisioning script to create both Entra app registrations:

```powershell
./scripts/provision-app-registrations.ps1 `
  -TenantId     "<your-tenant-id>" `
  -AppUrl       "https://agentlens-prod.azurewebsites.net" `
  -KeyVaultName "kv-agentlens-prod"
```

The script accepts exactly three parameters: `-TenantId`, `-AppUrl`, and the
optional `-KeyVaultName` (when supplied, secrets are stored in Key Vault
automatically). It is idempotent - safe to re-run with the real `-AppUrl` once
you know the deployed URL.

The script creates:
- **AgentLens-Reader** (service principal for data reads): ARM, Graph `User.Read.All`, Dataverse `user_impersonation`
- **AgentLens-WebApp** (SSO app registration): OpenID Connect, redirect URIs for localhost + App Service, app roles Admin/Maker

At the end the script prints the values you will need for step 3:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID` (Reader SP)
- `AZURE_CLIENT_SECRET` (Reader SP secret, goes to Key Vault in step 4)
- `AZURE_AD_CLIENT_ID` (WebApp registration)
- `WEBAPP_CLIENT_SECRET` (WebApp secret, goes to Key Vault in step 4)

Save these values. The script does NOT write them anywhere - they are displayed once.

---

## Step 2 - Admin consent + Power Platform Administrator role

Two manual approvals are required after the script completes. Both require a **Global Administrator** (or delegated Application Administrator + User Access Administrator).

### 2a - Grant admin consent for API permissions

1. Go to: **Azure Portal** > **Microsoft Entra ID** > **App registrations** > **AgentLens-Reader**
2. Click **API permissions** in the left menu
3. Click **Grant admin consent for \<your tenant name\>**
4. Confirm the dialog

This grants the application-level `User.Read.All` (Graph) and `user_impersonation` (Dataverse) permissions.

### 2b - Assign Power Platform Administrator directory role

This is required for the AgentLens-Reader SP to enumerate environments via Azure Resource Graph (`PowerPlatformResources`).

1. Go to: **Azure Portal** > **Microsoft Entra ID** > **Roles and administrators**
2. Search for and open **Power Platform Administrator**
3. Click **+ Add assignments**
4. Search for **AgentLens-Reader** (the service principal)
5. Select it and click **Add**

Without this role the Overview and Discovery pages will show "not connected / needs Power Platform Administrator role" (honest error state, not a crash).

---

## Step 3 - Deploy with azd up

From the repo root, run:

```bash
azd up \
  --parameter baseName=agentlens-prod \
  --parameter azureTenantId=<your-tenant-id> \
  --parameter azureClientId=<reader-sp-client-id> \
  --parameter azureAdClientId=<webapp-client-id>
```

For client tenant deployments with Azure PostgreSQL (see D-021 below), add:

```bash
  --parameter deployPostgres=true \
  --parameter pgAdminPassword=<secure-password>
```

`azd up` will:
1. Create a resource group named `rg-agentlens-prod` (or prompt you for a name)
2. Deploy via `infra/main.bicep`:
   - App Service Plan (Linux B1)
   - Web App with Node 20 LTS and system-assigned managed identity
   - Azure Key Vault (RBAC mode, purge protection enabled)
   - Role assignment: Key Vault Secrets User -> webapp identity
   - Optionally: Azure PostgreSQL Flexible Server B1ms
3. Build the Next.js app (`npm run build`, standalone output)
4. Deploy the standalone bundle to App Service

Expected output:

```
SUCCESS: Your up workflow to provision and deploy to Azure completed in X minutes.

Outputs:
  appUrl          = https://app-agentlens-prod.azurewebsites.net
  keyVaultUri     = https://kv-agentlens-prod.vault.azure.net/
  keyVaultName    = kv-agentlens-prod
  webAppName      = app-agentlens-prod
```

The app will show a "Setup" page immediately after deploy - the Key Vault secrets are not yet populated so all checks will show "missing". Proceed to step 4.

---

## Step 4 - Populate Key Vault secrets

Set each secret using the Azure CLI. Replace `<value>` with the actual secret. The Key Vault name is in the `azd up` output.

```bash
KV=kv-agentlens-prod  # replace with your vault name from step 3 output

# Service principal secret (from step 1)
az keyvault secret set --vault-name $KV --name AZURE-CLIENT-SECRET --value "<reader-sp-secret>"

# Azure OpenAI API key
az keyvault secret set --vault-name $KV --name AZURE-OPENAI-API-KEY --value "<openai-key>"

# Supabase service key (Witivio-internal) OR omit and set DATABASE-URL (client tenant, see D-021)
az keyvault secret set --vault-name $KV --name SUPABASE-SERVICE-KEY --value "<supabase-service-key>"

# Cron route bearer token (generate: openssl rand -base64 32)
az keyvault secret set --vault-name $KV --name CRON-SECRET --value "<random-secret>"

# NextAuth JWT signing secret (generate: openssl rand -base64 32)
az keyvault secret set --vault-name $KV --name AUTH-SECRET --value "<random-secret>"

# Webapp SSO client secret (from step 1)
az keyvault secret set --vault-name $KV --name WEBAPP-CLIENT-SECRET --value "<webapp-sp-secret>"
```

After setting all secrets, open the app URL and navigate to the Setup page. Each check should turn green within 1-2 minutes (see Key Vault reference propagation delay note below).

---

## Local development path

Create `.env.local` at the repo root (gitignored):

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

Minimum required for local dev (no Key Vault needed):

```env
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-reader-sp-client-id
AZURE_CLIENT_SECRET=your-reader-sp-secret
AZURE_AD_CLIENT_ID=your-webapp-client-id
WEBAPP_CLIENT_SECRET=your-webapp-secret
AUTH_SECRET=any-32-char-random-string
NEXTAUTH_URL=http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key
AGENTLENS_ORG_URLS=https://yourorg.crm.dynamics.com
```

Run:

```bash
npm install
npm run dev
```

For local dev pointing at the production Key Vault (uses `az login` credential via `DefaultAzureCredential`):

```env
KEY_VAULT_URI=https://kv-agentlens-prod.vault.azure.net/
# Leave all secret env vars unset - they resolve from Key Vault
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_AD_CLIENT_ID=...
NEXTAUTH_URL=http://localhost:3000
```

---

## Data storage decision table (D-021)

| Deployment context | Recommended storage | Bicep param | Notes |
|---|---|---|---|
| **Witivio-internal** (mvp tenant, internal tooling) | Supabase (US) | `deployPostgres=false` (default) | Fastest to set up; Witivio controls the Supabase project |
| **Client tenant - EU data residency required** | Azure PostgreSQL Flexible Server | `deployPostgres=true` | In the same Azure region as the App Service; no data leaves the tenant subscription |
| **Client tenant - no specific residency constraint** | Either | Your choice | Supabase simpler; Azure PG if client IT prefers Azure-only |

When `deployPostgres=true`, the Bicep outputs a `databaseUrlHint` with the connection string template. Add the password and set it as a Key Vault secret:

```bash
az keyvault secret set --vault-name $KV --name DATABASE-URL \
  --value "postgresql://agentlens_admin:<password>@pg-agentlens-prod.postgres.database.azure.com:5432/agentlens?sslmode=require"
```

Then set `DATABASE_URL` as an app setting pointing at the Key Vault reference (update `infra/modules/webapp.bicep` or set it manually via the portal).

---

## Key Vault reference propagation delay

After populating secrets in Key Vault, App Service app settings that use `@Microsoft.KeyVault(SecretUri=...)` references are NOT updated instantly. The App Service must re-read the references from Key Vault. This can take **1 to 5 minutes**.

If the Setup page shows "missing" for a secret you just set:
1. Wait 2 minutes
2. Restart the web app: `az webapp restart --name app-agentlens-prod --resource-group rg-agentlens-prod`
3. Refresh the Setup page

---

## Troubleshooting

### R-101 - Power Platform Administrator role

**Symptom**: Overview or Discovery page shows "not connected" or "insufficient permissions" despite correct `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.

**Cause**: The AgentLens-Reader SP does not have the **Power Platform Administrator** Entra directory role (or the equivalent in a GCC/sovereign cloud).

**Fix**: Complete step 2b above. This is an admin-only action - the SP principal ID is shown in the Azure portal under App registrations > AgentLens-Reader > Overview.

---

### Key Vault access denied

**Symptom**: App logs show `403 Forbidden` or `Access denied` when reading secrets. Setup page shows "error" for Key Vault checks.

**Cause**: The webapp's system-assigned managed identity does not have the **Key Vault Secrets User** role on the vault. This should be deployed by the Bicep, but can fail if the identity was not yet created when the role assignment ran.

**Fix**:

```bash
# Get the webapp's managed identity principal ID
PRINCIPAL=$(az webapp show \
  --name app-agentlens-prod \
  --resource-group rg-agentlens-prod \
  --query identity.principalId -o tsv)

KV_ID=$(az keyvault show \
  --name kv-agentlens-prod \
  --resource-group rg-agentlens-prod \
  --query id -o tsv)

az role assignment create \
  --assignee $PRINCIPAL \
  --role "Key Vault Secrets User" \
  --scope $KV_ID
```

---

### Standalone build issues

**Symptom**: App Service returns 500 or shows "Application Error" after deploy.

**Cause**: Next.js standalone output requires static files to be copied alongside `server.js`.

**Fix**: The `azure.yaml` postdeploy hook copies `.next/static` and `public` into `.next/standalone`. If deploying without `azd`, run manually:

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# Then zip and deploy .next/standalone/
```

Verify locally:
```bash
cd .next/standalone
node server.js
# Should start on port 3000
```

---

### App starts but CSP blocks scripts/styles

**Symptom**: Browser console shows Content Security Policy violations; pages render blank or unstyled.

**Cause**: The CSP in `next.config.mjs` may need adjustment for specific third-party resources you add.

**Fix**: Edit the `Content-Security-Policy` header in `next.config.mjs`. Current policy allows `self` + `unsafe-inline` (required for Tailwind). If you add an external font or analytics script, add its origin to the appropriate directive.
