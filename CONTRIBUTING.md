# Contributing

Read [README.md](README.md) first, then this. If you are an AI coding assistant
working in this repo: read both end to end before writing code.

## The rule everything else serves

**AgentLens never fabricates data.** It is a governance product. An administrator
retires agents based on its output. One invented number and none of it can be
trusted again.

Concretely, in any code you add:

- Every figure returned must come from an API response in the same call.
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
- **A per-agent cost figure derived from the tenant total.** Azure does not
  attribute spend per agent. Dividing is inventing.
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

Then test the second unhappy path, which is subtler: set *bogus* credentials.
Tokens fail to acquire, and the tools must still refuse to report "0 agents".

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
