# Deployment runbook

The short version is in the [README](../README.md#deploy-it): `azd up`, then
package the agent with the URL it prints. This is the long version, in the order
an administrator actually hits the walls.

## Prerequisites

| Tool | Why |
|---|---|
| [Azure Developer CLI](https://aka.ms/azd) | `azd up` |
| [Azure CLI](https://aka.ms/installazurecli) | provisioning scripts, manual paths |
| Docker | building the image (azd uses it) |
| Node 20+ | local runs, packaging the agent |
| PowerShell 7+ | the two provisioning scripts |

You also need, in the target tenant: **Global Administrator** (once, for admin
consent), **Power Platform Administrator** (to grant the directory role and to
run `New-PowerAppManagementApp`), and **Owner or User Access Administrator** on
the subscription (to assign Cost Management Reader).

## Step 1 — the reader app registration

```powershell
./scripts/provision-reader-app.ps1 -TenantId <guid>
```

Creates **AgentLens-Reader**, adds and admin-consents Graph `User.Read.All`,
creates a client secret, and prints the environment block plus five manual steps.

Optionally store the secret in Key Vault instead of the output:

```powershell
./scripts/provision-reader-app.ps1 -TenantId <guid> -KeyVaultName <vault>
```

Then set `KEY_VAULT_URI` and give the Container App's managed identity the
**Key Vault Secrets User** role.

## Step 2 — the grants that cannot be scripted

Do these now. Each one you skip becomes a `not_connected` source later, with the
fix attached — the agent will tell you, but it is faster to do them up front.

**2a. Power Platform Administrator directory role** → AgentLens-Reader.
[Entra roles](https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles)
→ Power Platform Administrator → Assignments → Add.

Without it, Azure Resource Graph returns **zero rows and no error**. That is
indistinguishable from a tenant with no agents, which is exactly why this step is
first.

**2b. Reader** on the subscription → AgentLens-Reader. Needed for ARG at all.

**2c. Cost Management Reader** on the subscription (or billing scope) →
AgentLens-Reader. Without it `value_and_cost` returns usage and marks cost not
connected.

**2d. Power Platform admin management application.** In a *user* context — a
service principal cannot register itself:

```powershell
Install-Module Microsoft.PowerApps.Administration.PowerShell -Scope CurrentUser
Add-PowerAppsAccount
New-PowerAppManagementApp -ApplicationId <reader-app-id>
```

Without it `dlp_posture` gets a 403, which it reports as a 403 — never as
"no policies exist".

**2e. Note the pay-as-you-go billing policy ID.** Power Platform admin center
-> Billing policies. Set it as `PPAC_BILLING_POLICY_ID` and per-agent message
consumption and per-agent cost light up. A tenant on prepaid capacity packs has
no billing policy, and no API exposes per-agent consumption for it - leave the
variable unset and the tools report per-agent cost as unavailable rather than
zero.

Then confirm the endpoint behind it actually looks the way this code expects -
it is undocumented, so this takes ten seconds and saves a wrong number:

```bash
AZURE_TENANT_ID=<guid> AZURE_CLIENT_ID=<reader> AZURE_CLIENT_SECRET=<secret> \
PPAC_BILLING_POLICY_ID=<policy> npm run verify:consumption
```

Run it with `PPAC_BILLING_POLICY_ID` unset and it lists the policy IDs it can
see, which is the easiest way to find yours. It prints field names and types
only - no tenant data - so the output is safe to paste into an issue.

**2f. Application User in each Dataverse environment.** Power Platform admin
center → Environment → Settings → Users + permissions → Application users → New
app user → AgentLens-Reader → assign a read role. List those org URLs in
`DATAVERSE_ORG_URLS`.

**2g. (Optional) `CopilotPackages.Read.All`** on the reader app, if the tenant is
licensed for Agent 365. Without it the M365 registry store reports not connected
and the rest of the sweep still returns.

## Step 3 — deploy the MCP server

The declarative agent has no code in it. This is the endpoint its action points
at, and where all five tools run.

### 3a. The one-command path

```bash
az containerapp up \
  --name agentlens-mcp \
  --resource-group <rg> \
  --location <region> \
  --source . \
  --target-port 3000 \
  --ingress external
```

Builds the image from the repo, creates the registry, environment and app
implicitly, and prints the FQDN. Add `/mcp` to it for `AGENTLENS_MCP_URL`.

Then the configuration, with the client secret held as a secret rather than a
plain environment variable:

```bash
az containerapp secret set --name agentlens-mcp --resource-group <rg> \
  --secrets azure-client-secret=<reader-secret>

az containerapp update --name agentlens-mcp --resource-group <rg> \
  --set-env-vars \
    AZURE_TENANT_ID=<guid> \
    AZURE_CLIENT_ID=<reader-app-id> \
    AZURE_CLIENT_SECRET=secretref:azure-client-secret \
    AZURE_SUBSCRIPTION_ID=<guid> \
    DATAVERSE_ORG_URLS=https://contoso.crm4.dynamics.com \
    PPAC_BILLING_POLICY_ID=<billing-policy-guid>
```

Optional: `COPILOT_RATE_STANDARD` and `COPILOT_RATE_PREMIUM` to price per-agent
consumption at your own rates. Unset falls back to the published list price,
labelled as such in every result.

### 3b. The repeatable path, for multiple client tenants

`infra/` is the same deployment as bicep, when you want it reviewable and
reproducible rather than assembled by a CLI:

```bash
azd auth login
azd env set AZURE_TENANT_ID <guid>
azd env set AZURE_CLIENT_ID <reader-app-id>
azd env set AZURE_CLIENT_SECRET <reader-secret>
azd env set AZURE_SUBSCRIPTION_ID <guid>
azd env set DATAVERSE_ORG_URLS https://contoso.crm4.dynamics.com
azd env set PPAC_BILLING_POLICY_ID <billing-policy-guid>
# Optional: your own rates. Unset falls back to published list price, labelled.
azd env set COPILOT_RATE_STANDARD 0.01
azd env set COPILOT_RATE_PREMIUM 0.025
azd up
```

What it provisions, all in one resource group:

| Resource | Note |
|---|---|
| Container Registry (Basic) | holds the image |
| Log Analytics workspace | container logs, 30-day retention |
| Container Apps environment | |
| Container App | ingress on 3000, **minReplicas 0** |
| User-assigned identity | AcrPull on the registry, so no admin credentials |

Both paths produce the same running server. CI compiles the bicep on every push,
so a template error surfaces before you run it — but neither path has been run
against a live subscription yet, so treat the first deployment as the real test.

Scale-to-zero is the point: the app costs nothing while idle, and a governance
agent is idle most of the time. First call after idling pays a cold start of a
few seconds.

Verify:

```bash
curl https://<app>.azurecontainerapps.io/health
# {"status":"ok","authEnabled":false,"readerConfigured":true,...}
```

`readerConfigured: true` means the credentials arrived. `authEnabled: false` is
expected until step 5.

## Step 4 — package and sideload the agent

```bash
export AGENT_APP_ID="<stable-guid>"       # generate once, never regenerate
export AGENTLENS_MCP_URL="https://<app>.azurecontainerapps.io/mcp"
npm run package:agent
```

Upload `agent/build/agentlens-agent.zip` at
<https://m365.cloud.microsoft/chat> → Agents → Add agent → Upload custom agent.

Ask a conversation starter and check the numbers against the Power Platform
admin center.

## Step 5 — secure the endpoint

Until this step the server accepts any caller who knows the URL.

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://<app>.azurecontainerapps.io/mcp
```

Then create the Entra SSO auth config (Agents Toolkit or the Teams developer
portal), re-run the script with `-SsoApplicationIdUri`, set `MCP_TENANT_ID` and
`MCP_AUDIENCE` on the Container App, and repackage the agent with
`MCP_AUTH_REFERENCE_ID`. Detail: [agent/README.md](../agent/README.md#authentication).

Confirm `/health` now reports `authEnabled: true`.

## Updating

```bash
azd deploy          # rebuild + push + new revision
```

Environment-variable-only changes can be made in the portal; the server reads
them per call, so a revision restart is enough.

## Rollback

Container Apps keeps previous revisions:

```bash
az containerapp revision list --name <app> --resource-group <rg> -o table
az containerapp ingress traffic set --name <app> --resource-group <rg> \
  --revision-weight <previous-revision>=100
```

## Teardown

```bash
azd down --purge
```

The two app registrations are not created by azd and survive. Delete them in
Entra if you are done with them.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/health` shows `readerConfigured: false` | Env vars missing on the revision, or `AZURE_CLIENT_SECRET` not resolving. Check the secret ref |
| Sweep returns 0 Copilot Studio agents, no error | Step 2a not done |
| Every agent is an orphan | `User.Read.All` not admin-consented |
| `dlp_posture` 403 | Step 2d not done |
| Dataverse environments listed as unreadable | Step 2f not done for those environments |
| No per-agent cost, only a tenant total | `PPAC_BILLING_POLICY_ID` unset, or the tenant is on prepaid capacity packs rather than pay-as-you-go |
| Per-agent cost looks wrong | It is metered messages x a rate. Check the rate in the result's `rateBasis`, and set `COPILOT_RATE_*` to your own |
| Copilot cannot reach the server | Ingress must be external, https, and the URL must end `/mcp` |
| Sign-in loop after step 5 | `MCP_AUDIENCE` must equal the auth config's Application ID URI, and that URI must be in the app's `identifierUris`. Entra's UI shows only the first one |
| Cold start feels slow | Expected at `minReplicas: 0`. Set it to 1 if you would rather pay to avoid it |
