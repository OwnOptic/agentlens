# Architecture

## The shape of it

```
Microsoft 365 Copilot
   │  user asks a question
   ▼
declarative agent  (agent/appPackage)
   │  instructions + 5 conversation starters
   │  action -> RemoteMCPServer, tools discovered at runtime
   ▼
MCP server  (src/)                       Azure Container App, scale-to-zero
   │  inbound: validates the Entra SSO token Copilot presents
   │  outbound: AgentLens-Reader, client credentials
   ▼
┌──────────────────────┬────────────────────────┬─────────────────────────┐
│ Azure Resource Graph │ Microsoft Graph        │ Power Platform admin    │
│ Copilot Studio,      │ owner names,           │ environments, and       │
│ Agent Builder        │ Agent 365 registry     │ governance: DLP policies│
├──────────────────────┼────────────────────────┴─────────────────────────┤
│ Dataverse            │ Azure Cost Management                            │
│ aggregate KPIs only  │ real billed spend + Microsoft's forecast         │
└──────────────────────┴──────────────────────────────────────────────────┘
```

Two identities, deliberately separate:

- **AgentLens-MCP** guards the door. It only proves the caller is Copilot acting
  for a signed-in user in your tenant.
- **AgentLens-Reader** does the reading. It holds every data permission, and
  nothing else in the system does.

The server itself holds no permissions. Compromising it gains an attacker
whatever the reader can read — which is read-only, and audited by Entra.

## Layers

| Layer | Path | Rule |
|---|---|---|
| Transport | `src/index.ts` | Streamable HTTP at `/mcp` for Copilot, stdio for Inspector. Stateless: a fresh server and transport per request, so it scales horizontally and restarts cleanly from zero |
| Inbound auth | `src/lib/auth.ts` | Validates the JWT audience and issuer, and that the caller is the Microsoft Enterprise token store. Blank audience = disabled, development only |
| Credentials | `src/lib/tokens.ts` | The only place secrets are touched. MSAL client credentials, one cached token per audience, expiry from MSAL rather than a guessed TTL |
| Connectors | `src/connectors/` | One file per upstream API. Each returns data **or a reason**, never a silent empty |
| Domain | `src/domain/` | Pure derivation over data already read. No I/O, so it can never invent a source |
| Tools | `src/tools/` | Compose connectors into an answer and report every source's state |

## Why there is no single inventory API

There is no one endpoint that lists the AI agents in a Microsoft tenant. They
live in four stores, each with its own API, its own admin role, and its own
failure mode:

| Store | API | Needs |
|---|---|---|
| Copilot Studio + Agent Builder | Azure Resource Graph, `PowerPlatformResources` | Reader on the subscription **and** Power Platform Administrator |
| M365 agent registry | Graph `copilot/admin/catalog/packages` (beta) | AI Administrator + `CopilotPackages.Read.All`, Agent 365 licensed |
| Azure AI Foundry | Foundry project REST `/agents` | Access to the project |
| Microsoft Fabric | Fabric Admin REST `/admin/items?type=DataAgent` | Fabric Administrator |

`src/connectors/discovery.ts` queries all four under `Promise.allSettled`, each
with its own token acquisition **inside** its own try/catch. One unreachable
store degrades that store alone; the rest of the sweep still returns.

The subtlest trap is here: **Azure Resource Graph returns an empty result set,
not a 403, when the Power Platform Administrator role is missing.** A tenant with
no agents and a tenant you are not allowed to see look identical on the wire.
That is why the sweep reports per-store status separately from per-store counts,
and why a store that was not read carries `agentCount: null` rather than `0`.

## The result contract

Every tool returns a `ToolResult` (`src/lib/result.ts`):

```ts
{
  status: 'ok' | 'partial' | 'not_connected' | 'error',
  summary: string,           // may be quoted by the model; states no unread figure
  data?: T,                  // absent when nothing could be read
  sources: SourceReport[],   // per-source connected / partial / not_connected + why
  remediation?: string       // the actual next step
}
```

`sources[]` is what makes the agent's answer defensible: it can always name what
it read and what it could not. The agent's instructions require it to relay a
`remediation` verbatim rather than paraphrase it into a generic suggestion.

## Data flow, one question end to end

*"Which agents actually deliver value, and what do they cost?"* →
`value_and_cost`:

1. **Sweep** the estate (`buildEstate`) — four stores, environment list, owner
   resolution.
2. **Read usage** from Dataverse `msdyn_conversationkpis`, per configured
   environment, aggregated by agent and day. Per-environment failures are
   collected, not swallowed.
3. **Read spend** from Azure Cost Management for the scope: month-to-date actual,
   plus Microsoft's own forecast when the forecast API answers.
4. **Cluster** duplicates by normalised name stem.
5. **Classify** each agent — promote / improve / consolidate / retire — from
   sessions, escalation rate and duplicate status. An agent with no readable
   usage gets `null` and a rationale saying so.
6. **Report**: `ok` if both sides were read, `partial` if one was, never a blend.

Cost is reported at the scope level only. Azure does not attribute spend to an
individual agent, so there is no per-agent figure to report — the tool says this
explicitly in `costAttributionNote` so the model does not fill the gap itself.

## State

There is none. No database, no cache beyond in-process tokens (5-minute expiry
buffer) and Key Vault secrets (10 minutes). Every question triggers fresh reads.

This is a deliberate trade: a governance answer that is minutes stale is a
governance answer that is wrong, and a tool asked a handful of questions a week
does not need a warm cache. It also means the container can scale to zero and
restart with nothing to rehydrate.

Nothing is ever persisted about a conversation: no transcript content, no end
user identity, no message counts per person. The usage path reads a
pre-aggregated KPI table precisely so raw transcripts are never in scope.
