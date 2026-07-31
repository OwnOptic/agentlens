# Implementation guide

This file is written for whoever implements the five tools, including an AI coding
assistant. If you are that assistant: **read this file end to end before writing code.**

The scaffold is deliberately complete in structure and empty in data. Your job is to
replace five `notImplemented(...)` calls with real reads, without breaking the contract
that makes this tool trustworthy.

---

## The one rule that matters

**AgentLens never fabricates data.**

It is a governance product. An administrator will make retire-or-keep decisions from its
output, and a security reviewer will ask what it can change. Both collapse if a single
number is invented.

Concretely:

- Every figure returned MUST come from an API response in the same call.
- If a source cannot be read, return `not_connected` or `partial` and say which source
  and why. Never substitute an estimate, an average, a sample, or a placeholder.
- Zero is a real answer. "Unknown" is a different real answer. Never render one as the other.
- Do not "helpfully" fill a gap to make output look complete. Incomplete and honest beats
  complete and wrong, every time.

If a requirement seems to need invented data, the requirement is wrong. Stop and say so.

**Keep the `not_connected` branches.** They are not scaffolding to delete; they are the
runtime behaviour when permissions are missing in a real tenant.

---

## Before you write code

1. Read [README.md](README.md) in this folder, then [../agent/README.md](../agent/README.md).
2. Read `src/lib/result.ts`. Every tool returns `ToolResult`. Understand `ok`, `partial`,
   `notConnected` and when each applies.
3. Skim the connectors listed below. **They already work.** Reusing them is the difference
   between a day and a week.

| Need | Use |
|---|---|
| Sweep all four stores | `lib/connectors/discovery.ts` -> `discoverAllAgents()` |
| ARG agents + environments | `lib/connectors/argInventory.ts` -> `argInventory` |
| Owners, Agent 365 packages | `lib/connectors/graph.ts` -> `graph` |
| DLP policies | `lib/connectors/dlp.ts` -> `fetchTenantDlpPolicies()` |
| Compliance score, risky patterns | `lib/compliance/{scoring,riskyPatterns,rules}.ts` |
| Usage KPIs, transcripts | `lib/connectors/{kpis,transcripts,dataverse}.ts` |
| Spend, forecast | `lib/connectors/{cost,costManagement}.ts`, `lib/cost/projections.ts` |
| Tokens | `lib/auth/tokenService.ts` |

4. Decide integration option **A (import directly)** or **B (call the console's API
   routes)** and write the decision into `README.md`. Do not mix the two.

---

## Order of work

Implement in this order. Each step is independently shippable and testable.

### 1. `sweep_inventory` - do this first
Everything else builds on it. `src/tools/sweep-inventory.ts` carries the fullest notes
and is the reference for the pattern.

Done when: asking the agent "Sweep every agent store in my tenant" returns your real
agent counts, and the number matches what you see in the Power Platform admin center.

### 2. `dlp_posture`
Independent of the rest. Needs the Power Platform admin management app registration,
which an administrator must perform.

Done when: an environment with no DLP policy is reported as a finding, with its name.

### 3. `value_and_cost`
The most sensitive. Read the privacy rule in the file header before starting.
Usage and cost are separate sources: if one is unavailable, return `partial` with the
other, never a blended estimate.

Done when: agents with zero sessions appear with real spend attached, and no message
content appears anywhere in the response or the logs.

### 4. `consolidation_plan`
Pure derivation plus PDF rendering. No new data source.

Done when: clusters are explainable ("these four share a name stem and the same two
connectors"), and the PDF omits the savings line entirely if cost was unavailable.

### 5. `agent_map`
Simplest. Emit Mermaid source; Copilot renders it. Do not rasterise.

Done when: a store that returned no data is labelled "not connected", not "0".

---

## Definition of done, per tool

- [ ] Returns real data from a live tenant, verified against a second source (admin
      centre, portal, or `az` CLI).
- [ ] Returns `not_connected` with accurate `remediation` when credentials or permissions
      are missing. Test this by unsetting an env var.
- [ ] `sources[]` accurately reflects what was and was not reached.
- [ ] No fabricated values anywhere, including in `summary`.
- [ ] Read-only. No POST/PATCH/DELETE to any tenant API.
- [ ] No secrets logged. No transcript content logged.
- [ ] `npm run type-check` passes.
- [ ] Verified end to end through the actual agent in Copilot, not only via Inspector.

---

## Testing

**Fast loop, no Copilot needed:**

```bash
npm run build && npm run inspect     # MCP Inspector, call each tool directly
curl http://localhost:3000/health    # what is configured
```

**Real loop:** package and sideload the agent (see `../agent/README.md`), then ask the
five conversation starters in <https://m365.cloud.microsoft/chat>. Enable developer mode
to see tool calls and auth errors in the debug card.

**Always test the unhappy path.** Unset `AZURE_CLIENT_SECRET` and confirm the agent says
the source is not connected rather than producing numbers. That failure mode is the
product's core promise.

---

## Things that will bite you

- **`az ad app update` cannot set the nested `api{}` object.** PATCH Microsoft Graph
  instead. Already handled in `scripts/provision-agent-mcp-app.ps1`.
- **Power Platform DLP access is not an API permission.** The SP must be registered with
  `New-PowerAppManagementApp`, by an administrator, in a user context. A service principal
  cannot register itself.
- **Dataverse access is per environment.** An Application User plus a security role in
  each one. Adding a tenant-level permission does nothing here.
- **`CopilotPackages.Read.All` is licence gated** (Agent 365). Treat its absence as
  `partial`, never as an error.
- **Copilot requires HTTPS** and a publicly reachable endpoint. localhost works only with
  Inspector.
- **Auth config Application ID URI** must be appended to the app's `identifierUris` or
  token acquisition fails silently-ish. Entra's UI shows only the first URI.
- **Large responses.** Copilot has response size limits. For big tenants, summarise and
  paginate rather than returning every agent row.

---

## What NOT to do

- Do not add a tool that writes to the tenant. Not "just" a tag, not "just" a share.
  Read-only is the product's core claim.
- Do not return raw conversation transcript content, or any end user's identity.
- Do not hardcode a tenant ID, subscription ID, client ID, secret, or URL. Environment only.
- Do not add a fallback that returns sample data when a source fails.
- Do not widen the service principal's permissions to make a feature easier. If a feature
  needs write access or a broader role, raise it rather than granting it.
- Do not rewrite the connectors in `lib/`. Reuse them.

---

## Questions to raise rather than guess

If any of these is unclear, ask rather than assuming:

- Integration option A or B?
- Which environments are in scope for Dataverse usage data?
- Is the tenant licensed for Agent 365 (`CopilotPackages.Read.All`)?
- What is the hosting target, Container Apps or App Service?
- Should `consolidation_plan` return a signed URL or an inline resource for the PDF?
