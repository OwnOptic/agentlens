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

`ai-plugin.json` declares no `auth` block, which means the MCP server is treated as
anonymous. That is fine while the server is local or in development.

**Before production**, secure the endpoint with Entra SSO:

1. Run `scripts/provision-agent-mcp-app.ps1` to create `AgentLens-MCP`, expose the
   `access_as_user` scope, and pre-authorize the Microsoft 365 host clients.
2. Configure the MCP server to validate the inbound token audience `api://<mcp-app-id>`.
3. Add the matching `auth` block to the runtime in `ai-plugin.json`, or regenerate the
   plugin through Agents Toolkit (**Add an Action** -> **Start with an MCP Server** ->
   **Microsoft Entra SSO**), which writes the vault reference for you.

Reference: [Build a plugin for a declarative agent from an MCP server](https://learn.microsoft.com/microsoft-365/copilot/extensibility/build-mcp-plugins).

## Editing the agent's behaviour

`declarativeAgent.json` -> `instructions` is the agent's system prompt. It encodes four
non-negotiables. Keep them if you change the wording:

1. **Honesty first.** Never invent a number. If a source is not connected, say so.
2. **Always call the action** rather than answering from model knowledge.
3. **Aggregate only.** Never surface individual conversation content or personal data.
4. **Read-only.** The agent never changes anything in the tenant.

Changing `instructions` or `conversation_starters` requires repackaging and re-uploading.
Changing an MCP **tool** does not, thanks to dynamic tool discovery.
