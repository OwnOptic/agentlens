# Contributing

Read [README.md](README.md) first, then this. If you are an AI coding assistant
working in this repo: read both end to end before writing code.

## The rule everything else serves

**AgentLens never fabricates data.** It is a governance product. An administrator
retires agents based on its output. One invented number and none of it can be
trusted again.

Concretely, in any code you add:

- Every figure returned must come from an API response in the same call, or be
  derived from one by arithmetic whose inputs and method ship in the same
  payload. Per-agent cost is metered messages x a stated rate, and the rate and
  its source travel with the number. A derived figure with an invisible constant
  behind it is a fabricated figure.
- If a source cannot be read, return `not_connected` or `partial` and say which
  source and why. Never substitute an estimate, an average, a sample or a
  placeholder.
- Zero is a real answer. Unknown is a different real answer. Never render one as
  the other — this is the single most common way to get it wrong, and it usually
  looks like a harmless `?? 0`.
- Do not fill a gap to make output look complete. Incomplete and honest beats
  complete and wrong, every time.

If a requirement seems to need invented data, the requirement is wrong. Say so.

## Shape of the code

```
src/lib/result.ts      the ToolResult contract: ok / partial / notConnected / failed
src/lib/tokens.ts      the ONLY place credentials are handled
src/connectors/*       one file per upstream API. Returns data or a reason. Never throws
                       past its own boundary for an expected failure
src/domain/*           pure derivation over data already read. No I/O
src/tools/*            compose connectors into an answer, and report every source
```

A new tool goes in `src/tools/`, is added to the `TOOLS` array in
`src/index.ts`, and needs no agent repackaging — Copilot discovers tools at
runtime.

Every tool must:

- Return a `ToolResult` with an accurate `sources[]`.
- Keep a `notConnected` branch for missing credentials or permissions. It is not
  scaffolding to delete; it is the runtime behaviour in a real tenant.
- Carry a `remediation` that names the actual next step, not a generic hint.
- Cap large responses. Copilot has a response size limit — summarise and report
  the truncation rather than silently dropping rows.

## What not to add

- **A tool that writes to the tenant.** Not "just" a tag, not "just" a share.
  Read-only is the product's core claim and the reason it passes security review.
- **Raw conversation content, or any end user's identity.** Usage comes from a
  pre-aggregated KPI table on purpose. If a feature seems to need transcript
  text, redesign the feature.
- **A fallback that returns sample data when a source fails.** The previous
  version of this codebase had one. It is why `not_connected` exists.
- **A per-agent cost derived from the tenant total.** Azure does not attribute
  spend per agent, so dividing the invoice by the agent count is inventing.
  Per-agent cost comes from per-agent metered consumption priced at a stated
  rate - a different thing, and the only sanctioned way to produce one.
- **A second hardcoded price anywhere.** `src/domain/rates.ts` is the only place
  a rate may live, and it exists to make the rate visible. If you find yourself
  writing `* 0.01` in a connector or a tool, that is the bug this file is about.
- **Adding metered consumption to billed spend.** They measure different things.
  Prepaid capacity absorbs consumption that never reaches an invoice, so summing
  them double-counts and the total means nothing.
- **A hardcoded tenant ID, subscription ID, client ID, secret or URL.**
  Environment only.
- **A wider permission to make a feature easier.** If a feature needs write
  access or a broader role, raise it rather than granting it.

## Testing

Fast loop, no Copilot needed:

```bash
npm run type-check
npm run inspect                 # build + MCP Inspector, call each tool directly
curl http://localhost:3000/health
```

**Always test the unhappy path.** Unset `AZURE_CLIENT_SECRET` and confirm every
tool reports the source as not connected rather than producing numbers. That
failure mode is the product's core promise, so it is the one that has to work.

Then unset `PPAC_BILLING_POLICY_ID` specifically: `value_and_cost` must still
return adoption and billed spend with per-agent cost absent, and
`consolidation_plan` must drop its savings line from the brief entirely rather
than printing a hedged or zero one.

Then test the second unhappy path, which is subtler: set *bogus* credentials.
Tokens fail to acquire, and the tools must still refuse to report "0 agents".

### Verifying the undocumented endpoint

Per-agent consumption comes from an endpoint Microsoft does not document - it
backs the admin center UI, and `src/connectors/consumption.ts` is written against
a shape observed in one tenant. Before trusting a cost figure in a new tenant:

```bash
AZURE_TENANT_ID=... AZURE_CLIENT_ID=... AZURE_CLIENT_SECRET=... \
PPAC_BILLING_POLICY_ID=... npm run verify:consumption
```

It prints the response SHAPE - field names, types, how many rows carry each -
and diffs it against what the connector reads. The only value it prints is the
set of distinct `modelMeter` strings, because pricing turns on the literal
`premium` and a change there would silently misprice every agent. Exit 0 means
the shape matches, 1 a mismatch, 2 it could not check.

If it reports unexpected fields, read them: Copilot Studio billing has been
moving toward billed *sessions*, and a new field may be the current unit while
`messageCount` quietly becomes legacy.

Before shipping a change to a tool, verify it end to end through the actual agent
in Copilot, not only through Inspector.

## Things that will bite you

- **`az ad app update` cannot set the nested `api{}` object.** PATCH Microsoft
  Graph instead — already handled in `scripts/provision-agent-mcp-app.ps1`.
- **Power Platform DLP access is not an API permission.** The SP must be
  registered with `New-PowerAppManagementApp`, by an administrator, in a user
  context. A service principal cannot register itself.
- **Dataverse access is per environment.** An Application User plus a security
  role in each one. A tenant-level permission does nothing here.
- **`CopilotPackages.Read.All` is licence gated** (Agent 365). Treat its absence
  as partial, never as an error.
- **ARG returns an empty result set, not a 403,** when the Power Platform
  Administrator role is missing. Empty and forbidden look identical on the wire.
- **The auth config Application ID URI** must be appended to the app's
  `identifierUris` or token acquisition fails in a way that looks like a
  client-side bug. Entra's UI shows only the first URI.
