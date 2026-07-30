# AgentLens - declarative agent

This folder is the Microsoft 365 Copilot **declarative agent**: the conversational
surface of AgentLens. It is what an administrator actually talks to.

The agent holds no data access of its own. It calls the AgentLens **MCP server**,
which authenticates as the `AgentLens-Reader` service principal and reads the five
Microsoft APIs read-only.

```
user -> declarative agent (this folder)
     -> AgentLens-MCP        (Entra SSO gate, proves who is calling)
     -> AgentLens-Reader     (client credentials, read-only)
     -> Azure Resource Graph | Microsoft Graph | Power Platform Governance API
        | Dataverse (aggregate only) | Azure Cost Management
```

## What is in here

| File | Purpose |
|---|---|
| `appPackage/manifest.json` | Microsoft 365 app manifest (v1.19). Declares the app and points at the agent. |
| `appPackage/declarativeAgent.json` | Declarative agent manifest (schema v1.8): name, description, instructions, the 5 conversation starters, and the action. |
| `appPackage/ai-plugin.json` | Plugin manifest (v2.4). Declares the MCP server as a `RemoteMCPServer` runtime with **dynamic tool discovery**. |
| `appPackage/color.png` | 192x192 colour icon. |
| `appPackage/outline.png` | 32x32 transparent outline icon. |

### Dynamic tool discovery

`ai-plugin.json` ships with an empty `functions` array and `run_for_functions: ["*"]`.
Copilot resolves the MCP server's tools at runtime by calling `tools/list`, so adding
or changing an MCP tool does **not** require repackaging and re-uploading the agent.
To pin a fixed tool set instead, see
[Dynamic tool discovery](https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery).

## Prerequisites

1. The MCP server is deployed and reachable over **https**.
2. `AgentLens-Reader` exists and has admin consent - run `scripts/provision-app-registrations.ps1`.
3. `AgentLens-MCP` exists and has admin consent - run `scripts/provision-agent-mcp-app.ps1`.
4. Your tenant allows uploading custom agents (Microsoft 365 admin center -> Integrated apps).

## Build the package

The manifests contain `${{TOKEN}}` placeholders so no environment-specific value is
ever committed. Substitute them at package time:

```bash
# Generate the app id ONCE and keep it stable - a new GUID creates a new app.
#   PowerShell: [guid]::NewGuid()
export AGENT_APP_ID="<your-stable-guid>"
export AGENTLENS_MCP_URL="https://agentlens-mcp.<region>.azurecontainerapps.io/mcp"

node scripts/package-agent.mjs
```

Output: `agent/build/agentlens-agent.zip`.

> `archiver` is only needed for the zip step (`npm i -D archiver`). Without it the
> script stages `agent/build/appPackage/` and you zip the folder **contents** yourself.

## Sideload and test

1. Go to <https://m365.cloud.microsoft/chat>.
2. **Agents** -> **Add agent** -> **Upload custom agent** -> pick the zip.
3. Open AgentLens from the left sidebar.
4. Ask: *"Sweep every agent store in my tenant and flag sprawl and orphans."*
5. Approve the connection prompt the first time.
6. Confirm the numbers are **your tenant's**, not samples.

Alternatively, open the repo in VS Code with the
[Microsoft 365 Agents Toolkit](https://aka.ms/M365AgentsToolkit) and use its
provision / preview flow.

## Authentication

`auth` is a **required** property of the plugin runtime. The committed `ai-plugin.json`
ships with:

```json
"auth": { "type": "None" }
```

which is correct **for development only** - the MCP server is treated as anonymous.
Valid types are `None`, `OAuthPluginVault` and `ApiKeyPluginVault`.

### Switching to Microsoft Entra SSO (production)

Secrets and tenant-specific IDs are never committed. The auth config ID is injected at
package time, which flips the runtime to:

```json
"auth": { "type": "OAuthPluginVault", "reference_id": "<auth config ID>" }
```

Microsoft's flow has four steps
([docs](https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso)):

**Step 1 - register the Entra app that secures the MCP server.**
`scripts/provision-agent-mcp-app.ps1` does this (`AgentLens-MCP`). Note its client ID.

**Step 2 - create the Entra SSO auth config.** This record lives in the *Microsoft
Enterprise token store*, not in Entra. It produces an **auth config ID** and an
**Application ID URI**. Either:
- VS Code + [Agents Toolkit](https://aka.ms/M365AgentsToolkit) -> **Add an Action** ->
  **Start with an MCP Server** -> **Microsoft Entra SSO** -> supply the client ID. It
  creates the config and updates the manifest for you; or
- [Teams developer portal](https://dev.teams.microsoft.com/tools) -> **Tools** ->
  **Microsoft Entra SSO client ID registration**. The **Base URL** must match the
  `url` in `ai-plugin.json` exactly.

**Step 3 - update the Entra app registration.** Re-run the provisioning script with the
URI from step 2; it applies all three requirements:

```powershell
./scripts/provision-agent-mcp-app.ps1 -TenantId <guid> -McpUrl https://... `
    -SsoApplicationIdUri "<Application ID URI from step 2>"
```

| Requirement | Value |
|---|---|
| `identifierUris` | must include the auth config's Application ID URI |
| Web redirect URI | `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect` |
| Expose an API -> client application | `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` (Microsoft Enterprise token store) |

> That last GUID is the **only** client that needs pre-authorization. Copilot acquires
> the token through the Enterprise token store. This is not the Teams tab-SSO client-ID
> list - that pattern does not apply here.

**Step 4 - validate the token on the MCP server.** Accept the SSO Application ID URI as
the token **audience**. If you also validate the calling client, allow
`ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`. Reject everything else. If the server uses the
[on-behalf-of flow](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
to reach another API needing consent, return `401 Unauthorized` so the agent prompts the
user to sign in.

Then repackage with the auth config ID:

```bash
MCP_AUTH_REFERENCE_ID="<auth config ID>" \
AGENT_APP_ID="<guid>" \
AGENTLENS_MCP_URL="https://..." \
node scripts/package-agent.mjs
```

The script prints which auth mode it packaged, so you cannot ship `None` by accident.

> Troubleshooting sign-in failures (audience mismatch, wrong `reference_id`, base URL
> mismatch): [Troubleshoot MCP and API plugin authentication](https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting).
> Enable developer mode to surface auth errors in the agent's debug card.

## Editing the agent's behaviour

`declarativeAgent.json` -> `instructions` is the agent's system prompt. It encodes four
non-negotiables. Keep them if you change the wording:

1. **Honesty first.** Never invent a number. If a source is not connected, say so.
2. **Always call the action** rather than answering from model knowledge.
3. **Aggregate only.** Never surface individual conversation content or personal data.
4. **Read-only.** The agent never changes anything in the tenant.

Changing `instructions` or `conversation_starters` requires repackaging and re-uploading.
Changing an MCP **tool** does not, thanks to dynamic tool discovery.
