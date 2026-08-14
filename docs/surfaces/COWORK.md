# AgentLens for Copilot Cowork

The same governance tools, inside Microsoft 365 Copilot Cowork - the
document-centric agent workspace. One extra package, zero extra server: the
Cowork plugin points at the same MCP server and the same Entra SSO auth config
the declarative agent uses.

## What the package contains

```
cowork/appPackage/
  manifest.json                     v1.28 unified manifest (strict schema)
  tools/agentlens-tools.json        tool description CAPTURED from a live tools/list
  skills/agent-governance-review/   a Cowork skill encoding the review workflow
  color.png · outline.png           icons
```

- The connector is an `agentConnectors` entry with a `remoteMcpServer` tool
  source. Cowork REQUIRES the bundled `mcpToolDescription` file - uploads
  without it fail with HTTP 400.
- **Never hand-author the tool description.** Capture it from a live
  `tools/list` (the packager's header explains why: hand-authored descriptions
  once shipped 12 of 19 tools with wrong parameter names).
- Auth is `OAuthPluginVault` with the same auth config ID as the agent.
  **Cowork does not support API keys.**
- All five tools declare `readOnlyHint: true`. Cowork treats unannotated tools
  as destructive and demands a confirmation on every call - the annotations
  are what let a read-only tool run without nagging.
- The `agent-governance-review` skill teaches Cowork the review workflow and
  the zero-vs-unknown rule, and names each tool explicitly.

## Build it

```bash
COWORK_APP_ID=<stable-guid> \
AGENTLENS_MCP_URL=https://<fqdn>/mcp \
MCP_AUTH_REFERENCE_ID="<auth config ID>" \
  npm run package:cowork
```

Output: `cowork/build/agentlens-cowork.zip`. The same three rules as the agent
package apply: the URL must end in `/mcp` and be read back from Azure, the
auth config ID comes from the Teams developer portal registration (step 10 of
[INSTALL.md](../install/INSTALL.md)), and `COWORK_APP_ID` must stay stable forever - a
new GUID creates a second app instead of updating the first
(`scripts/install.ps1` state and `.agentlens-install.json` cache it).

## Upload it

- **Personal test:** `atk install --file-path cowork/build/agentlens-cowork.zip --scope Personal`
  (Microsoft 365 Agents Toolkit CLI).
- **Tenant:** Microsoft 365 admin center -> Manage apps -> Upload custom app.
  Then Cowork -> Sources & Skills -> Plugins: AgentLens appears under Discover.

## Same server, same guarantees

Nothing about the deployment changes: read-only service principal, Entra SSO
on the endpoint, and every source that cannot be read reported as
`not_connected` with its fix - never as zero.
