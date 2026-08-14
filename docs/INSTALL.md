# Install, step by step

Every step, what it does, the exact command, an **immediate** check that proves it
worked, and what breaks if you skip it. No step's verification depends on a later
step.

Three ways to use this:

- **Let Claude drive it.** Open the repo with Claude Code and say *"install
  AgentLens and guide me."* It follows [CLAUDE.md](../CLAUDE.md), runs the
  scriptable steps, and stops at each of the **two** gates with the click-path.
- **Run the script.** `./scripts/install.ps1 -TenantId <guid> -DryRun` first,
  then without `-DryRun`. Same sequence, same gates.
- **Do it by hand.** Every command below stands alone.

---

## Phase 0 - before you start (read all of this first)

Half of a failed install is a prerequisite discovered mid-flight. Collect
everything here first and the rest is mechanical.

### Tools on the machine that runs the install

| Tool | Why | Verify |
|---|---|---|
| Azure CLI (`az`) | every identity and deploy step | `az account show` shows the **right tenant** |
| Node.js 20+ | packaging and validation | `node -v` |
| PowerShell 7+ | only for the `.ps1` scripts; every step also lists the raw command | `pwsh -v` |

Docker is **not** needed: the container image builds server-side in Azure.

### Who must be available

| Person / role | Needed for |
|---|---|
| **Global Administrator** | admin consent (step 2) and the Entra SSO auth config (step 10) |
| **Owner** or **User Access Administrator** on the subscription | role assignments (step 3) |
| Whoever signs in to run the install | steps 4, 5 and 6 run in that user's context and are scripted |

### Licences - decide this before you start, not at step 12

| Licence | Without it |
|---|---|
| **Microsoft 365 Copilot** (per user) | the agent uploads but **will not run**. This is the wall, not a bug. |
| Agent 365 | the M365 Agent Builder store reports `not_connected` (403). The other three stores still work. |

### Tenant switches to check now

- **Custom app upload** must be enabled: Teams admin center -> Teams apps ->
  Setup policies -> *Upload custom apps* = On. If it is off, step 12 is rejected
  outright, after everything else is done.
- **The default environment is special.** Being Power Platform Administrator does
  NOT make you a System Administrator inside the default environment's data
  plane (every user there is Basic User + Environment Maker). If you want the
  default environment assessed, grant yourself System Administrator on it first:
  PPAC -> Environments -> the default -> Settings -> Users + permissions ->
  Users -> yourself -> Manage security roles.

### Values to collect

| Value | Where |
|---|---|
| Tenant ID | `az account show --query tenantId -o tsv` |
| Subscription ID | `az account show --query id -o tsv` |
| Region + resource group name | your choice, e.g. `westeurope`, `rg-agentlens` |
| Dataverse org URLs | PPAC -> Environments -> each environment's URL |
| Billing policy ID (optional) | PPAC -> Billing policies. No policy = prepaid capacity = per-agent cost is **unmeasured, not free** |

### The two gates

Only **two** steps genuinely require a signed-in human in a browser. Everything
else, including admin consent, the Power Platform Administrator role, the
management-app registration and the Dataverse application users, is scriptable
and scripted below.

| Gate | Why no script can do it |
|---|---|
| **Entra SSO auth config** (inside step 10) | no public API; Teams developer portal or Agents Toolkit only |
| **Uploading the zip** (step 12) | a UI action in Microsoft 365 Copilot |

### Cost, honestly

Scale-to-zero means the **Container App** costs nothing while idle. The
deployment is not free: the Container Registry (a few dollars a month) and Log
Analytics (free tier covers a quiet server) persist. Check current rates rather
than trusting these descriptions.

---

## Phase A - identity

### Step 1 - `AgentLens-Reader` app registration

**What it does.** Creates the one identity that reads your tenant, adds Graph
`User.Read.All` (application), and mints a client secret.

```powershell
./scripts/provision-reader-app.ps1 -TenantId <tenant-guid>
```

Add `-KeyVaultName <vault>` to store the secret in Key Vault instead of printing it.

**Verify now.**

```bash
az ad app list --display-name AgentLens-Reader --query "[0].appId" -o tsv
```

**If you skip it.** Nothing else works - this is the identity every tool reads through.

**Note.** The secret is created in `--append` mode with a two-year expiry.
Nothing warns you before it expires: **put the date in a calendar now.**

### Step 2 - Graph admin consent

**What it does.** Grants `User.Read.All` tenant-wide. Scriptable when the
signed-in session is a Global Administrator:

```bash
az ad app permission admin-consent --id <reader-app-id>
```

Consent can lag replication by ~30 seconds; retry once before concluding it failed.

**Verify now** (read the grant back from Graph rather than trusting the exit code):

```bash
SP=$(az ad sp show --id <reader-app-id> --query id -o tsv)
az rest --method get --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP/appRoleAssignments" \
  --query "value[].resourceDisplayName" -o tsv     # must include: Microsoft Graph
```

**If you skip it.** Owner IDs never resolve to names, so **every agent is
reported as an orphan** - a wrong-looking finding rather than a missing one.

### Step 3 - Azure RBAC: Reader and Cost Management Reader

```bash
SP=$(az ad sp show --id <reader-app-id> --query id -o tsv)
az role assignment create --assignee-object-id "$SP" --assignee-principal-type ServicePrincipal \
  --role Reader --scope /subscriptions/<subscription-id>
az role assignment create --assignee-object-id "$SP" --assignee-principal-type ServicePrincipal \
  --role "Cost Management Reader" --scope /subscriptions/<subscription-id>
```

**Verify now.** `az role assignment list --assignee "$SP" --scope /subscriptions/<subscription-id> -o table`

**If you skip it.** No Resource Graph access at all, and billed spend reports
`not_connected`. (If `az role assignment` itself errors with `MissingSubscription`
on your machine, see [INSTALL-TROUBLESHOOTING.md](INSTALL-TROUBLESHOOTING.md) -
the assignment can be made as a raw ARM PUT.)

---

## Phase B - tenant access

### Step 4 - Power Platform Administrator directory role

**What it does.** Grants the service principal visibility of Power Platform
resources through Resource Graph and the admin API. Scriptable - and note the
role is often **not activated** in a fresh tenant, so the classic
`directoryRoles/.../members/$ref` call fails; this endpoint works regardless:

```bash
az rest --method post --url "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments" \
  --headers "Content-Type=application/json" \
  --body "{\"principalId\":\"$SP\",\"roleDefinitionId\":\"11648597-926c-4cf3-9c36-bcebb0ba8dcc\",\"directoryScopeId\":\"/\"}"
```

**Verify now, standalone - do not wait for the server.** Query ARG as the
service principal and use the **sibling-query** pattern: in an empty tenant the
agents count is honestly zero, so the proof the permission works is that a
sibling type returns rows.

```bash
TOKEN=$(curl -s -X POST "https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token" \
  -d "client_id=<reader-app-id>" --data-urlencode "client_secret=<secret>" \
  -d "scope=https://management.azure.com/.default" -d "grant_type=client_credentials" | jq -r .access_token)
curl -s -X POST "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"PowerPlatformResources | summarize c=count() by type"}'
# GOOD: rows for connectors/environments, whatever the agent count.
# BAD: an empty data array, or AccessDenied.
```

**If you skip it - read this one.** Microsoft documents that Azure Resource
Graph can return **zero rows and no error** without this role - a tenant you
are not allowed to see, indistinguishable from a tenant with no agents. Live
testing (2026-08) observed an explicit `AccessDenied` instead at every
privilege level tried, so current behaviour appears loud - but the verify
above assumes nothing either way: a zero is only trusted when a sibling query
returns rows on the same token.

### Step 5 - register the reader as a Power Platform admin management app

**What it does.** Unlocks the DLP policy read. This is not an Entra permission.
The PowerShell module (`New-PowerAppManagementApp`) is only a wrapper - the
scriptable call, run in a **user** session (an SP cannot register itself):

```bash
az rest --method put --resource "https://api.bap.microsoft.com/" \
  --url "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/adminApplications/<reader-app-id>?api-version=2020-10-01"
```

**Verify now.** The call echoes `{"applicationId": "<reader-app-id>"}`. Full
check once the server is up: `dlp_posture` returns policies, not 403.

**If you skip it.** `dlp_posture` reports HTTP 403 with the exact fix. It never
reports "no policies exist" - a 403 and an empty tenant are different findings.

### Step 6 - Application User + minimal role, per Dataverse environment

**What it does.** Lets the server read the aggregate KPI table and the bots
table in each environment listed in `DATAVERSE_ORG_URLS`. Two parts, both
scriptable against the Dataverse Web API in your user session, per environment:

1. **Create the application user**: `POST {org}/api/data/v9.2/systemusers` with
   `{"applicationid":"<reader-app-id>","businessunitid@odata.bind":"/businessunits(<root-bu-id>)"}`.
2. **Create and assign a minimal read role** - do NOT hand it System
   Administrator. Create a role `AgentLens Reader` and add these privileges at
   Global depth via `AddPrivilegesRole`: `prvReadbot`, `prvReadBusinessUnit`,
   `prvReadUser`, and `prvReadmsdyn_conversationkpi` **where it exists** (the
   KPI table and its privilege only appear after the first Copilot Studio use
   in that environment; absence is normal in a fresh environment).

The PPAC click-path alternative: Environment -> Settings -> Users + permissions
-> Application users -> New app user -> `AgentLens-Reader` -> assign the role.

**Verify now**, as the service principal itself:

```bash
# with a client-credentials token scoped to {org}/.default
curl -s -o /dev/null -w "%{http_code}" {org}/api/data/v9.2/WhoAmI -H "Authorization: Bearer $DV"   # 200
curl -s -o /dev/null -w "%{http_code}" "{org}/api/data/v9.2/bots?\$top=1" -H "Authorization: Bearer $DV"  # 200
```

**If you skip it.** Those environments are reported as unreadable - **not** as
zero usage. No agent in them gets a verdict.

**Know this before you misread a result:** in an environment where Copilot
Studio has never been used, `msdyn_conversationkpis` does not exist and the
server reports the environment as *reachable with no recorded usage* - a
genuine zero, distinct from unreadable.

### Step 7 - note the pay-as-you-go billing policy ID

**What it does.** Unlocks per-agent message consumption, and therefore per-agent cost.

**Do this.** PPAC -> **Billing policies** -> copy the ID -> set it as
`PPAC_BILLING_POLICY_ID` in step 9.

**Verify.** `npm run verify:consumption` (run it with the variable unset and it
lists the policies it can see - the easiest way to find yours).

**If the tenant has no billing policy** it is on prepaid capacity. No API
exposes per-agent consumption for those. Leave the variable unset; those agents
are reported as **unmeasured, not free**.

---

## Phase C - the server

### Step 8 - deploy the MCP server

```bash
az containerapp up --name agentlens-mcp --resource-group <rg> --location <region> \
  --source . --target-port 3000 --ingress external
```

Builds in Azure - no local Docker. For repeatable multi-tenant deployments,
`infra/` has the same thing as bicep ([DEPLOY.md](DEPLOY.md)).

**Verify now.** Read the FQDN back from Azure rather than assuming:

```bash
az containerapp show --name agentlens-mcp --resource-group <rg> \
  --query properties.configuration.ingress.fqdn -o tsv
curl https://<fqdn>/health     # {"status":"ok","authEnabled":false,"readerConfigured":false,...}
```

On Windows, `az containerapp up` and `az acr build` can crash with a
`UnicodeEncodeError` while **the build continues server-side** - see
[INSTALL-TROUBLESHOOTING.md](INSTALL-TROUBLESHOOTING.md).

**If you skip it.** The agent installs, shows its five starters, and fails every
question - its action points at nothing.

### Step 9 - configure the server

The client secret goes in as a **secret**, never a plain environment variable:

```bash
az containerapp secret set --name agentlens-mcp --resource-group <rg> \
  --secrets azure-client-secret=<reader-secret>
az containerapp update --name agentlens-mcp --resource-group <rg> --set-env-vars \
  AZURE_TENANT_ID=<tenant-guid> AZURE_CLIENT_ID=<reader-app-id> \
  AZURE_CLIENT_SECRET=secretref:azure-client-secret \
  AZURE_SUBSCRIPTION_ID=<subscription-id> \
  DATAVERSE_ORG_URLS=<comma-separated-org-urls> \
  PPAC_BILLING_POLICY_ID=<billing-policy-guid>
```

**Verify now.** `curl https://<fqdn>/health` -> `readerConfigured: true`.
A Container App rolls revisions gradually - if the flag has not flipped, wait
~30 seconds for the new revision to take traffic before concluding failure.

**If you skip it.** Every tool reports `not_connected` with the fix attached -
honest, and useless.

---

## Phase D - secure, package, upload (in that order)

Securing **before** packaging means one package and one upload, and no window
where the agent is live against an open endpoint.

### Step 10 - secure the endpoint (contains gate 1 of 2)

**Until this step completes, anyone with the URL can call the server.** It reads
your tenant; do not stop before this step.

**10a - the AgentLens-MCP app** (scripted; holds NO data permissions, it only
proves who is calling):

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://<fqdn>/mcp
```

**10b - GATE: the Entra SSO auth config.** No public API exists. In the
[Teams developer portal](https://dev.teams.microsoft.com/tools) (Tools ->
Microsoft Entra SSO client ID registration) or VS Code Agents Toolkit:

| Field | Value |
|---|---|
| Base URL | `https://<fqdn>/mcp` - exactly, with the `/mcp` |
| Client (application) ID | the AgentLens-MCP app id from 10a |
| Scope | the **fully qualified** scope: `api://<mcp-app-id>/access_as_user`. A bare `access_as_user` resolves against Microsoft Graph and fails later with `AADSTS650053`. |

It returns an **auth config ID** and an **Application ID URI**. Re-run the 10a
script with `-SsoApplicationIdUri "<Application ID URI>"` to append it.

**10c - point the server at the audience:**

```bash
az containerapp update --name agentlens-mcp --resource-group <rg> \
  --set-env-vars MCP_TENANT_ID=<tenant-guid> MCP_AUDIENCE="api://<mcp-app-id>"
```

**Verify now.** All three, not just the first:

```bash
curl https://<fqdn>/health                      # authEnabled: true
curl -s -o /dev/null -w "%{http_code}" -X POST https://<fqdn>/mcp ...   # no token -> 401
# a valid user token for api://<mcp-app-id> from an allowed client -> 200
```

**If sign-in loops later.** `MCP_AUDIENCE` must match what the token carries.
With `requestedAccessTokenVersion: 2` the token's `aud` is the app id GUID and
the server accepts both GUID and `api://` forms; the portal's own URI has the
form `api://auth-<guid>/<client-id>`, which is a third form - see
[INSTALL-TROUBLESHOOTING.md](INSTALL-TROUBLESHOOTING.md).

### Step 11 - package the agent zip

**The MCP URL and the auth config are baked in at this moment.**

```bash
AGENT_APP_ID=<stable-guid> \
AGENTLENS_MCP_URL=https://<fqdn>/mcp \
MCP_AUTH_REFERENCE_ID="<auth config ID from 10b>" \
  npm run package:agent
npm run validate:agent      # must exit 0
```

- `AGENTLENS_MCP_URL` must end in `/mcp`. Read the FQDN back from Azure.
- `AGENT_APP_ID` must be **stable forever**. A new GUID creates a second app in
  the tenant instead of updating the first. `scripts/install.ps1` caches it in
  `.agentlens-install.json`; reuse it for every repackage.
- `validate:agent` names the broken field; a rejected upload gives a generic
  error with no line number. Never upload without it.

**If the URL changes later** the zip must be rebuilt and re-uploaded. Changing
an MCP **tool** does not require this: the agent discovers tools at runtime.

### Step 12 - GATE: upload the zip

<https://m365.cloud.microsoft/chat> -> **Agents** -> **Add agent** ->
**Upload custom agent** -> `agent/build/agentlens-agent.zip`.

**Verify - the smoke test.** Open AgentLens, approve the one-time connection
prompt, then ask: *"Sweep every agent store in my tenant and flag sprawl and
orphans."* Check the count against the Power Platform admin center. A good
answer names each store's status; stores you did not grant report
`not_connected` with the fix, never zero.

**If upload is rejected**: custom app upload is off (Phase 0). **If the agent
uploads but never answers**: the Microsoft 365 Copilot licence (Phase 0). Both
are tenant switches, not install bugs.

---

## What each skipped step costs

| Skipped | The agent reports |
|---|---|
| Admin consent (2) | every agent as an orphan |
| Power Platform Administrator (4) | zero Copilot Studio agents, no error |
| Management app (5) | `dlp_posture` 403, with the exact call to make |
| Application User (6) | those environments unreadable, not zero |
| Billing policy (7) | no per-agent cost; no savings line in the plan |
| Securing the endpoint (10) | `authEnabled: false` - **the endpoint is open** |

None of these produce a wrong number. Each produces a `not_connected` source
with the fix attached - which is the whole design, and still worse than having
the data.

See also: [INSTALL-TROUBLESHOOTING.md](INSTALL-TROUBLESHOOTING.md) for every
error a real install has hit, and [MAINTAINING.md](MAINTAINING.md) for
everything after day one.
