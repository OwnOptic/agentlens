# Install, step by step

Every step, what it does, the exact command, how to check it worked, and what
breaks if you skip it.

Three ways to use this:

- **Let Claude drive it.** Open the repo with Claude Code and say *"install
  AgentLens and guide me."* It follows [CLAUDE.md](../CLAUDE.md), runs the
  scriptable steps, and stops at each gate with the click-path. You do six
  things; it does the rest.
- **Run the script.** `./scripts/install.ps1 -TenantId <guid> -DryRun` first,
  then without `-DryRun`. Same sequence, same gates.
- **Do it by hand.** Every command below stands alone.

**Prerequisites:** Azure CLI, Node 20+, PowerShell 7+ (only for the `.ps1`
scripts). In the tenant: Global Administrator once for consent, Power Platform
Administrator, and Owner or User Access Administrator on the subscription.

**A gate (marked 🔒) is a step Microsoft requires a signed-in human for.** There
are six. Everything else is scriptable.

---

## Cost, honestly

Scale-to-zero means the **Container App** costs nothing while idle. It does not
mean the deployment is free:

| Resource | Idle cost |
|---|---|
| Container App, `minReplicas: 0` | nothing between requests |
| Container Registry (Basic) | a few dollars a month, billed whether or not you pull |
| Log Analytics | free up to the monthly ingestion allowance; a quiet server stays well under |

Check current rates on the Azure pricing pages rather than trusting these
descriptions. The registry is the one that surprises people, since the app
itself genuinely does drop to zero.

---

## Step 1 — `AgentLens-Reader` app registration 

**What it does.** Creates the one identity that reads your tenant, adds Graph
`User.Read.All`, attempts admin consent, and mints a client secret.

```powershell
./scripts/provision-reader-app.ps1 -TenantId <tenant-guid>
```

Add `-KeyVaultName <vault>` to store the secret in Key Vault instead of printing
it.

**Verify.**

```bash
az ad app list --display-name AgentLens-Reader --query "[0].appId" -o tsv
```

**If you skip it.** Nothing else works — this is the identity every tool reads
through.

**Note.** The secret is valid for two years and is created in `--append` mode, so
re-running never invalidates a secret a running deployment is using. Put the
expiry in a calendar.

---

## Step 2 🔒 — Graph admin consent

**What it does.** Grants `User.Read.All` tenant-wide. Step 1 attempts this
automatically; it only succeeds if you were signed in as a Global Administrator.

**Do this.** Open the app's API permissions and confirm the green ticks:

```
https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/<reader-app-id>
```

Or, as a Global Administrator:

```bash
az ad app permission admin-consent --id <reader-app-id>
```

**Verify.** No "Not granted" warnings on the API permissions blade.

**If you skip it.** Owner IDs never resolve to names, so **every agent is
reported as an orphan** — a wrong-looking finding rather than a missing one.

---

## Step 3 — Azure RBAC: Reader and Cost Management Reader

**What it does.** Lets the service principal query Azure Resource Graph and read
billed spend.

```bash
SP=$(az ad sp show --id <reader-app-id> --query id -o tsv)

az role assignment create --assignee-object-id "$SP" \
  --assignee-principal-type ServicePrincipal \
  --role Reader --scope /subscriptions/<subscription-id>

az role assignment create --assignee-object-id "$SP" \
  --assignee-principal-type ServicePrincipal \
  --role "Cost Management Reader" --scope /subscriptions/<subscription-id>
```

**Verify.**

```bash
az role assignment list --assignee "$SP" --scope /subscriptions/<subscription-id> -o table
```

**If you skip it.** No Resource Graph access at all, and `value_and_cost`
reports billed spend as not connected while still returning usage.

---

## Step 4 🔒 — Power Platform Administrator directory role

**What it does.** Grants the service principal visibility of Power Platform
resources through Resource Graph and the admin API.

**Do this.**
[Entra roles](https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles)
→ *Power Platform Administrator* → **Assignments** → **Add** → `AgentLens-Reader`.

**Verify.** Once the server is running, `sweep_inventory` returns a non-zero
Copilot Studio count in a tenant that has agents.

**If you skip it — read this one.** Azure Resource Graph returns **zero rows and
no error**. A tenant you are not allowed to see is indistinguishable on the wire
from a tenant with no agents. This is the single most consequential step to miss,
and the reason the sweep reports per-store status separately from per-store
counts.

---

## Step 5 🔒 — Register as a Power Platform admin management app

**What it does.** Unlocks the DLP policy read. This is **not** an Entra API
permission, which is why it cannot be granted like one.

**Do this**, in a *user* context — a service principal cannot register itself:

```powershell
Install-Module Microsoft.PowerApps.Administration.PowerShell -Scope CurrentUser
Add-PowerAppsAccount
New-PowerAppManagementApp -ApplicationId <reader-app-id>
```

**Verify.** `dlp_posture` returns policies instead of a 403.

**If you skip it.** `dlp_posture` reports HTTP 403 with the exact cmdlet to run.
It never reports "no policies exist" — a 403 and an empty tenant are different
findings.

---

## Step 6 🔒 — Application User per Dataverse environment

**What it does.** Lets the server read the aggregate conversation KPI table in
each environment you want usage from.

**Do this.** Power Platform admin center → Environment → **Settings** → **Users +
permissions** → **Application users** → **New app user** → `AgentLens-Reader` →
assign a role with read access. Repeat per environment.

Then list those org URLs in `DATAVERSE_ORG_URLS` (comma-separated).

**Verify.** `value_and_cost` lists the environment under `reached` rather than
`failed`.

**If you skip it.** Those environments are reported as unreadable — **not** as
zero usage. No agent in them gets a verdict.

---

## Step 7 — Note the pay-as-you-go billing policy ID

**What it does.** Unlocks per-agent message consumption and therefore per-agent
cost.

**Do this.** Power Platform admin center → **Billing policies** → copy the ID.
Set it as `PPAC_BILLING_POLICY_ID`.

**Verify.** After deploying:

```bash
AZURE_TENANT_ID=<t> AZURE_CLIENT_ID=<c> AZURE_CLIENT_SECRET=<s> \
PPAC_BILLING_POLICY_ID=<policy> npm run verify:consumption
```

Run it with `PPAC_BILLING_POLICY_ID` unset and it lists the policies it can see —
the easiest way to find yours.

**If you skip it.** No per-agent cost anywhere, and `consolidation_plan` omits
its savings line entirely rather than estimating one.

**If the tenant has no billing policy** it is on prepaid capacity packs. No API
exposes per-agent consumption for those. Leave the variable unset; those agents
are reported as **unmeasured, not free**.

---

## Step 8 — Deploy the MCP server

**What it does.** Builds the image from this repo and runs it on a public https
endpoint. This is what Copilot calls on every question.

```bash
az containerapp up \
  --name agentlens-mcp \
  --resource-group <rg> \
  --location <region> \
  --source . \
  --target-port 3000 \
  --ingress external
```

For a repeatable deployment across client tenants, `infra/` has the same thing
as bicep — see [DEPLOY.md](DEPLOY.md#3b-the-repeatable-path-for-multiple-client-tenants).

**Verify.**

```bash
az containerapp show --name agentlens-mcp --resource-group <rg> \
  --query properties.configuration.ingress.fqdn -o tsv
```

**If you skip it.** The agent installs, shows its five starters, and fails every
question — its action points at nothing.

---

## Step 9 — Configure the server

**What it does.** Gives the server its credentials and scope. The client secret
goes in as a **secret**, not a plain environment variable, so it never lands in
shell history or the revision template.

```bash
az containerapp secret set --name agentlens-mcp --resource-group <rg> \
  --secrets azure-client-secret=<reader-secret>

az containerapp update --name agentlens-mcp --resource-group <rg> \
  --set-env-vars \
    AZURE_TENANT_ID=<tenant-guid> \
    AZURE_CLIENT_ID=<reader-app-id> \
    AZURE_CLIENT_SECRET=secretref:azure-client-secret \
    AZURE_SUBSCRIPTION_ID=<subscription-id> \
    DATAVERSE_ORG_URLS=https://contoso.crm4.dynamics.com \
    PPAC_BILLING_POLICY_ID=<billing-policy-guid>
```

Optional: `COPILOT_RATE_STANDARD` / `COPILOT_RATE_PREMIUM` to price consumption
at your own rates. Unset falls back to the published list price, labelled as such
in every result. Full list in [`.env.example`](../.env.example).

**Verify.**

```bash
curl https://<fqdn>/health
# {"status":"ok","authEnabled":false,"readerConfigured":true,...}
```

`readerConfigured: true` is the check. `authEnabled: false` is expected until
step 12.

**If you skip it.** Every tool reports `not_connected` with the fix attached —
honest, and useless.

---

## Step 10 — Package the agent zip

**What it does.** Substitutes the placeholders in `agent/appPackage/` and builds
the sideloadable zip. **The MCP URL is baked in at this point.**

```bash
AGENT_APP_ID=<stable-guid> \
AGENTLENS_MCP_URL=https://<fqdn>/mcp \
  npm run package:agent

npm run validate:agent
```

**Two things to get right.**

- `AGENTLENS_MCP_URL` must be the deployed FQDN **with `/mcp` on the end**. Read
  it back from Azure rather than typing it from memory.
- `AGENT_APP_ID` must be **stable**. Generate it once and reuse it forever — a
  new GUID creates a second app in the tenant instead of updating the first.
  `scripts/install.ps1` caches it in `.agentlens-install.json`.

**Verify.** `npm run validate:agent` exits 0. It checks the manifest/agent id
link, length limits, icon dimensions and the MCP url against Microsoft's
published schemas — a rejected sideload gives a generic error with no line
number, so check here first.

**If the URL changes later** the zip must be rebuilt and re-uploaded. Changing an
MCP *tool* does not require this: the agent discovers tools at runtime.

---

## Step 11 🔒 — Upload the zip

**Do this.** <https://m365.cloud.microsoft/chat> → **Agents** → **Add agent** →
**Upload custom agent** → `agent/build/agentlens-agent.zip`.

**Verify.** Open AgentLens from the sidebar, approve the connection prompt, ask
*"Sweep every agent store in my tenant and flag sprawl and orphans."* Check the
count against the Power Platform admin center.

**If upload is blocked.** Custom app upload must be permitted in the tenant —
Teams admin center → **Setup policies** → *Upload custom apps*. Worth confirming
before you get here.

---

## Step 12 🔒 — Secure the endpoint

**Until this step, anyone with the URL can call your server.** It reads your
tenant, so this is not a formality.

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://<fqdn>/mcp
```

Then create the Entra SSO auth config — there is no public API, so use VS Code
with the [Agents Toolkit](https://aka.ms/M365AgentsToolkit) (**Add an Action** →
**Start with an MCP Server** → **Microsoft Entra SSO**) or the
[Teams developer portal](https://dev.teams.microsoft.com/tools). It returns an
**auth config ID** and an **Application ID URI**.

Then apply all three:

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://<fqdn>/mcp `
    -SsoApplicationIdUri "<Application ID URI>"
```

```bash
az containerapp update --name agentlens-mcp --resource-group <rg> \
  --set-env-vars MCP_TENANT_ID=<tenant-guid> MCP_AUDIENCE="<Application ID URI>"

MCP_AUTH_REFERENCE_ID="<auth config ID>" \
AGENT_APP_ID=<same-stable-guid> \
AGENTLENS_MCP_URL=https://<fqdn>/mcp \
  npm run package:agent
```

Re-upload the zip.

**Verify.** `/health` reports `authEnabled: true`, and the agent still answers in
Copilot.

**If sign-in loops.** `MCP_AUDIENCE` must equal the auth config's Application ID
URI exactly, and that URI must be in the app's `identifierUris`. Entra's UI shows
only the first URI, which hides the mismatch.

---

## What each skipped gate costs

| Skipped | The agent reports |
|---|---|
| Admin consent (2) | Every agent as an orphan |
| Power Platform Administrator (4) | Zero Copilot Studio agents, no error |
| `New-PowerAppManagementApp` (5) | `dlp_posture` 403, with the cmdlet to run |
| Application User (6) | Those environments unreadable, not zero |
| Billing policy (7) | No per-agent cost; no savings line in the plan |
| SSO auth config (12) | `authEnabled: false` — the endpoint is open |

None of these produce a wrong number. Each one produces a `not_connected` source
with the fix attached — which is the whole design, but is still worse than
having the data.
