# AgentLens

A Microsoft 365 Copilot agent that audits the AI agents in your tenant.

You ask it a question in Copilot chat. It reads your tenant read-only and answers
with real numbers, or tells you exactly which source it could not reach and why.

> **Sweep every agent store in my tenant and flag sprawl and orphans.**

```
you  ->  AgentLens declarative agent   (agent/)     what you talk to in Copilot
     ->  AgentLens MCP server          (src/)       five read-only tools
     ->  AgentLens-Reader              (one SP)     client credentials, read-only
     ->  Azure Resource Graph | Microsoft Graph | Power Platform admin +
         governance APIs | Dataverse (aggregate only) | Azure Cost Management
```

Two pieces, one repo. The agent package is the conversational surface; the MCP
server is everything behind it.

---

## Contents

- [What it answers](#what-it-answers)
- [The one rule](#the-one-rule)
- [Run it locally in five minutes](#run-it-locally-in-five-minutes)
- [Deploy it](#deploy-it)
- [Package and sideload the agent](#package-and-sideload-the-agent)
- [Access: what to grant, and what breaks without it](#access-what-to-grant-and-what-breaks-without-it)
- [Securing the server](#securing-the-server)
- [Configuration](#configuration)
- [Repo layout](#repo-layout)
- [Troubleshooting](#troubleshooting)

---

## What it answers

Five tools, all read-only.

| Tool | Answers | Reads |
|---|---|---|
| `sweep_inventory` | Every agent across the four stores, with owners, orphans and duplicate clusters | Azure Resource Graph, Microsoft Graph, Power Platform admin API |
| `dlp_posture` | Which environments no DLP policy covers, and what that exposes | Power Platform governance + admin APIs |
| `value_and_cost` | Which agents are actually used, what the tenant really spends, and a verdict per agent | Dataverse (aggregate), Azure Cost Management |
| `consolidation_plan` | Duplicate clusters, which agent to keep, and a plan you can send to owners | derived from the sweep |
| `agent_map` | A Mermaid diagram of the estate | derived from the sweep |

The four agent stores it sweeps: **Copilot Studio**, **M365 Agent Builder**,
**Azure AI Foundry**, **Microsoft Fabric**.

`value_and_cost` gives each agent one of four verdicts — promote, improve,
consolidate, retire — derived from real session counts, real escalation rates,
and whether the agent duplicates another. An agent whose usage could not be read
gets no verdict, and says so.

---

## The one rule

**AgentLens never fabricates data.**

An administrator makes retire-or-keep decisions from this output, and a security
reviewer will ask what it can change. Both collapse if a single number is
invented. So:

- Every figure comes from an API response in the same call.
- A source that cannot be read returns `not_connected` or `partial`, naming the
  source, the reason, and the fix.
- **Zero and unknown are different answers.** A store that could not be read is
  never rendered as "0 agents". `agent_map` draws it as a dashed *not connected*
  node for the same reason.
- Nothing is estimated to make output look complete.

Three consequences you might otherwise read as missing features:

- **No per-agent cost.** Azure Cost Management does not attribute spend to an
  individual agent. Dividing the tenant total by the agent count would be an
  invention, so the real total is reported alongside the agents with zero usage —
  which is the actionable finding anyway.
- **No saving figure in the consolidation plan.** Same reason. It reports how
  many agents can be merged away, which is a real number.
- **No sample or demo mode.** With no credentials the agent says every source is
  not connected. That is the honest answer, and it is the first thing worth
  testing.

---

## Run it locally in five minutes

No Azure access needed for this part — you are checking the server runs and the
tools refuse to invent anything.

```bash
npm install
cp .env.example .env      # leave everything blank for now
npm run dev               # http://localhost:3000/mcp
```

```bash
curl http://localhost:3000/health
# {"status":"ok","authEnabled":false,"readerConfigured":false,"tools":[...]}
```

Now call the tools interactively:

```bash
npm run inspect           # builds, then opens MCP Inspector
```

Call `sweep_inventory`. With nothing configured you should get:

```json
{
  "status": "not_connected",
  "summary": "The AgentLens-Reader service principal is not configured, so no store could be read. No agent counts can be reported.",
  "remediation": "Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET ..."
}
```

That is the product working correctly. Fill in `.env` with real reader
credentials (see [Access](#access-what-to-grant-and-what-breaks-without-it)) and
the same call returns your tenant.

> With `MCP_AUDIENCE` blank the server is **unauthenticated**. Fine on localhost,
> never in public. See [Securing the server](#securing-the-server).

---

## Deploy it

One command. It provisions a Container App that **scales to zero**, which suits a
governance agent — you ask it questions a few times a week, and it costs nothing
in between.

```bash
azd auth login
azd up
```

`azd` asks for an environment name and a region, then prints:

```
AGENTLENS_MCP_URL = https://ca-agentlens-xxxx.azurecontainerapps.io/mcp
AGENTLENS_HEALTH_URL = https://ca-agentlens-xxxx.azurecontainerapps.io/health
```

Keep that first URL — it is the one value the agent package needs.

To pass the reader credentials in at provision time, set them first:

```bash
azd env set AZURE_TENANT_ID <tenant-guid>
azd env set AZURE_CLIENT_ID <reader-app-id>
azd env set AZURE_CLIENT_SECRET <reader-secret>
azd env set AZURE_SUBSCRIPTION_ID <subscription-guid>
azd env set DATAVERSE_ORG_URLS https://contoso.crm4.dynamics.com
azd up
```

They can also be added later in the portal under the Container App's environment
variables — the server reads them at call time, so a revision restart is enough.

Confirm it is alive:

```bash
curl https://<your-app>.azurecontainerapps.io/health
```

<details>
<summary>Without azd, or into an existing environment</summary>

```bash
az containerapp up \
  --name agentlens-mcp \
  --resource-group <rg> \
  --location <region> \
  --source . \
  --target-port 3000 \
  --ingress external \
  --env-vars AZURE_TENANT_ID=<t> AZURE_CLIENT_ID=<c> AZURE_SUBSCRIPTION_ID=<s>
```

Then set the secret separately so it is never in shell history or the revision
template:

```bash
az containerapp secret set --name agentlens-mcp --resource-group <rg> \
  --secrets azure-client-secret=<value>
az containerapp update --name agentlens-mcp --resource-group <rg> \
  --set-env-vars AZURE_CLIENT_SECRET=secretref:azure-client-secret
```

Copilot requires a public **https** endpoint, so localhost works only with
Inspector.
</details>

---

## Package and sideload the agent

The manifests hold `${{TOKEN}}` placeholders so nothing tenant-specific is ever
committed. They are filled in at package time.

```bash
# Generate this GUID ONCE and keep it stable - a new GUID creates a new app.
#   PowerShell: [guid]::NewGuid()
export AGENT_APP_ID="<your-stable-guid>"
export AGENTLENS_MCP_URL="https://<your-app>.azurecontainerapps.io/mcp"

npm run package:agent
# -> agent/build/agentlens-agent.zip
```

Then:

1. Go to <https://m365.cloud.microsoft/chat>.
2. **Agents** → **Add agent** → **Upload custom agent** → pick the zip.
3. Open AgentLens from the sidebar, approve the connection prompt.
4. Ask: *"Sweep every agent store in my tenant and flag sprawl and orphans."*
5. Check the numbers against the Power Platform admin center. They should match.

The script prints which auth mode it packaged, so you cannot ship an
unauthenticated build by accident.

**Adding or changing an MCP tool does not require repackaging.** `ai-plugin.json`
ships with an empty `functions` array and `run_for_functions: ["*"]`, so Copilot
discovers tools at runtime via `tools/list`. Changing the agent's *instructions*
or *conversation starters* does require a repackage.

---

## Access: what to grant, and what breaks without it

One app registration does all the reading:

```powershell
./scripts/provision-reader-app.ps1 -TenantId <guid>
```

It creates **AgentLens-Reader**, adds `User.Read.All`, admin-consents it, and
prints the manual steps that cannot be scripted. Those steps matter — each one
you skip turns into a `not_connected` source with the fix attached, rather than a
wrong number.

| Grant | Enables | Without it |
|---|---|---|
| **Power Platform Administrator** directory role | Copilot Studio + Agent Builder sweep, environment list | ARG returns zero rows with no error — indistinguishable from an empty tenant, which is why the tool checks the role explicitly |
| **Reader** on the subscription | Azure Resource Graph queries | The Power Platform store reports not connected |
| **Graph `User.Read.All`** (admin-consented) | Owner names instead of object IDs | Every agent looks like an orphan |
| **Cost Management Reader** on the subscription | Real spend and forecast in `value_and_cost` | Usage is returned, cost is marked not connected — never blended |
| **`New-PowerAppManagementApp`** for the reader app | DLP policy read | `dlp_posture` returns not connected with the exact cmdlet. A 403 is never reported as "no policies exist" |
| **Application User** in each Dataverse environment | Aggregate session/deflection/escalation KPIs | Those environments are listed as unreadable, not as zero usage |
| **`CopilotPackages.Read.All`** (Agent 365 licence) | The M365 agent registry store | That one store reports not connected; the rest of the sweep still returns |

The last one is licence-gated, so its absence is normal and is treated as
partial, never as an error.

---

## Securing the server

`MCP_AUDIENCE` blank means **anyone who finds the URL can call it**. Before the
server is public, register the app that guards it and validate inbound tokens.

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://<host>/mcp
```

Then create the Entra SSO auth config (VS Code + [Microsoft 365 Agents
Toolkit](https://aka.ms/M365AgentsToolkit), or the [Teams developer
portal](https://dev.teams.microsoft.com/tools)), re-run the script with the
resulting Application ID URI, and set `MCP_TENANT_ID` + `MCP_AUDIENCE` on the
Container App. Repackage the agent with the auth config ID:

```bash
MCP_AUTH_REFERENCE_ID="<auth config id>" \
AGENT_APP_ID="<guid>" AGENTLENS_MCP_URL="https://..." npm run package:agent
```

`/health` reports `authEnabled: true` once it is on. Full walkthrough:
[agent/README.md](agent/README.md#authentication).

**Posture**

- **Read-only.** No tool writes to the tenant. Do not add one that does.
- **Aggregate only.** Usage is counts and rates from a pre-aggregated analytics
  table. No message content is ever read, logged or returned. No end user is ever
  identified. The only personal data emitted is an agent *owner's* name — an
  accountable party, not a data subject.
- **No secrets in source.** Everything tenant-specific comes from the
  environment, optionally via Key Vault (`KEY_VAULT_URI`).
- **Least privilege.** All permissions sit on `AgentLens-Reader`. The server
  holds none of its own.

---

## Configuration

Every variable is optional in the sense that the server always starts — what is
missing shows up as a not-connected source with a fix. See
[`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `MCP_TRANSPORT` / `PORT` | `http` (default, required by Copilot) or `stdio` for Inspector |
| `MCP_TENANT_ID` / `MCP_AUDIENCE` | Inbound token validation. Both blank = unauthenticated |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | The reader service principal |
| `AZURE_SUBSCRIPTION_ID` | Scope for Resource Graph and Cost Management |
| `AZURE_COST_SCOPE` | Optional. Read cost at a billing account or management group instead |
| `DATAVERSE_ORG_URLS` | Comma-separated org URLs for aggregate usage |
| `FOUNDRY_PROJECT_ENDPOINT` | Optional. Include Azure AI Foundry agents in the sweep |
| `KEY_VAULT_URI` | Optional. Read `AZURE_CLIENT_SECRET` from Key Vault instead |

---

## Repo layout

```
src/
  index.ts          express + MCP transports, /health
  lib/              config, inbound auth, tokens, secrets, the result contract
  connectors/       one file per upstream API
  domain/           estate, duplicate clustering, verdicts, types
  tools/            the five tools
agent/              the Copilot declarative agent package
infra/              bicep: registry, Container Apps env, scale-to-zero app
scripts/            package the agent, provision the app registrations
docs/               architecture, deployment, app registrations
```

Development: `npm run dev` (watch), `npm run type-check`, `npm run build`,
`npm run inspect`. Contribution rules — especially what not to add — are in
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every tool says "service principal is not configured" | `AZURE_*` unset on the server, or the Container App revision predates them |
| Sweep returns 0 Copilot Studio agents with no error | The reader lacks the **Power Platform Administrator** directory role. Grant it, then re-ask |
| Every agent shows as an orphan | `User.Read.All` not admin-consented — owner IDs cannot be resolved to names |
| `dlp_posture` says 403 | `New-PowerAppManagementApp` has not been run for the reader app |
| M365 store says "requires a Microsoft Agent 365 licence" | Expected without Agent 365. The other stores still report |
| Copilot cannot reach the server | The URL must be public **https** and end in `/mcp`. Check `/health` first |
| Sign-in loop after enabling SSO | Audience mismatch. `MCP_AUDIENCE` must equal the auth config's Application ID URI, and that URI must be in the app's `identifierUris` |

Enable developer mode in Copilot to see tool calls and auth errors in the debug
card.
