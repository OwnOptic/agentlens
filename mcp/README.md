# AgentLens MCP server

The backend for the [AgentLens declarative agent](../agent/README.md). It exposes five
read-only governance tools to Microsoft 365 Copilot.

**Status: scaffold.** The server runs, registers all five tools, and answers Copilot
correctly. Every tool currently reports `not_connected` with the reason and the fix.
Implementing a tool means replacing that branch with real data. See
[IMPLEMENTATION.md](IMPLEMENTATION.md).

```
user -> declarative agent (../agent)
     -> AgentLens-MCP        validates the inbound token (Entra SSO)
     -> THIS SERVER          five read-only tools
     -> AgentLens-Reader     client credentials
     -> Azure Resource Graph | Microsoft Graph | Power Platform Governance API
        | Dataverse (aggregate only) | Azure Cost Management
```

## The five tools

| Tool | Returns | Sources |
|---|---|---|
| `sweep_inventory` | Every agent across the four stores, owners, orphans, duplicate clusters | ARG, Graph |
| `dlp_posture` | DLP policy per environment, compliance score, risky patterns | PP Governance API |
| `value_and_cost` | Aggregate usage joined with real spend, promote/improve/consolidate/retire | Dataverse, Cost Management |
| `consolidation_plan` | Duplicate clusters, improvement plan, branded PDF | derived |
| `agent_map` | Mermaid diagram of the estate | derived |

## Why the scaffold is safe to deploy as-is

AgentLens is a governance tool, so its credibility depends on never reporting a number
it did not read. Every tool returns a `ToolResult` carrying an explicit per-source
status. An unimplemented tool returns:

```json
{
  "status": "not_connected",
  "summary": "The sweep_inventory tool is not implemented yet in this deployment, so no data is available. No figures can be reported.",
  "sources": [{ "source": "Azure Resource Graph", "status": "not_connected" }],
  "remediation": "Wire this tool to discoverAllAgents() in lib/connectors/discovery.ts."
}
```

The agent's instructions require it to relay that plainly rather than invent a figure.
So a half-implemented deployment is honest, not broken.

**When you implement a tool, keep the `not_connected` branch.** It still fires when
credentials or permissions are genuinely missing at runtime.

## Run it locally

```bash
cd mcp
npm install
cp .env.example .env     # leave MCP_AUDIENCE blank for local dev
npm run dev              # http://localhost:3000/mcp
```

Check it is alive and see what is configured:

```bash
curl http://localhost:3000/health
```

Inspect the tools interactively:

```bash
npm run build
npm run inspect          # MCP Inspector
```

With `MCP_AUDIENCE` blank the server is **unauthenticated**. That is fine on localhost
and matches the agent package's `auth: { "type": "None" }`. Never expose it publicly in
that state.

## Reuse the console's connectors, do not rewrite them

The Next.js console in this repo already implements every API call these tools need,
including auth, retry and paging. The single biggest mistake would be writing fresh
Azure Resource Graph or Dataverse clients here.

| Need | Already exists |
|---|---|
| Four-store sweep | `lib/connectors/discovery.ts` -> `discoverAllAgents()` |
| ARG inventory | `lib/connectors/argInventory.ts` -> `argInventory.listAgents()` |
| DLP policies | `lib/connectors/dlp.ts` -> `fetchTenantDlpPolicies()` |
| Compliance scoring | `lib/compliance/scoring.ts`, `riskyPatterns.ts`, `rules.ts` |
| Usage KPIs | `lib/connectors/kpis.ts`, `transcripts.ts` |
| Cost | `lib/connectors/cost.ts`, `costManagement.ts`, `lib/cost/projections.ts` |
| SP tokens | `lib/auth/tokenService.ts` -> `getArmToken()`, `getGraphToken()`, `getDataverseToken()` |

Two integration options, pick one and record the choice here:

- **A. Import directly.** Compile the MCP against the repo root so `@/lib/*` resolves.
  One implementation, no drift. Best when the MCP and the console deploy together.
- **B. Call the console's API routes.** `app/api/discover`, `/api/dlp`, `/api/cost`,
  `/api/kpis` already return this data. Best when the MCP deploys standalone.

## Deploy

Copilot requires a public **https** endpoint. Azure Container Apps scale-to-zero fits the
usage profile (a governance agent is queried occasionally, not continuously) and stays
inside the free grant. The console's `Dockerfile` and `infra/` are a working reference.

Before going public:

1. Set `MCP_TENANT_ID` and `MCP_AUDIENCE` so tokens are validated.
2. Create the Entra SSO auth config and repackage the agent with
   `MCP_AUTH_REFERENCE_ID`. See [../agent/README.md](../agent/README.md#authentication).
3. Confirm `/health` reports `authEnabled: true`.

## Security posture

- **Read-only.** No tool writes to the tenant. Do not add one that does.
- **Aggregate only.** Transcript data is counts and rates. No message content, no end
  user identities. Only an agent owner's name may be returned.
- **No secrets in source.** Everything tenant-specific comes from the environment.
- **Least privilege.** All permissions live on `AgentLens-Reader`; this server holds none
  of its own. See the root README section 6.
