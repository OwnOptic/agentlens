# Working in this repo

Read [README.md](README.md) for what AgentLens is, and
[CONTRIBUTING.md](CONTRIBUTING.md) before changing any code - especially the
honesty contract, which is the reason most of this codebase looks the way it
does.

---

## If the user asks you to install AgentLens

This is the common case: someone clones the repo and says *"install this and
guide me."* You drive. They do only the handful of things Microsoft requires a
signed-in human for.

**Full reference for every step: [docs/INSTALL.md](docs/INSTALL.md).** It
documents what each step does, what it needs, how to verify it worked, and what
breaks without it. Read it before starting.

### How to run the install

1. **Check the ground first.** `az --version`, `az account show`, `node -v`. If
   `az` is missing or signed into the wrong tenant, say so and stop - do not
   guess a tenant.
2. **Dry run, and show it.** `./scripts/install.ps1 -TenantId <t> -DryRun`
   prints every command it would run and every gate it would stop at. Show the
   user what is about to happen to their tenant before it happens.
3. **Run it for real**, or run the equivalent `az` commands yourself if
   PowerShell is unavailable - `docs/INSTALL.md` lists the exact command for
   every step, so you are never improvising against someone's tenant.
4. **At each gate, stop.** Give the user the exact click-path or command, wait,
   then verify the gate actually cleared before continuing. Do not carry on
   hoping.
5. **Re-run to resume.** The script is idempotent and caches non-secret state in
   `.agentlens-install.json`. A second run picks up where the first stopped.

### The two gates - what you cannot do for them

| Gate | Why it is theirs |
|---|---|
| Entra SSO auth config | No public API - Agents Toolkit or Teams developer portal only |
| Uploading the zip | UI action in Microsoft 365 Copilot |

Everything else you do - INCLUDING four steps older docs called gates, all
scriptable when the signed-in session has the right role (see INSTALL.md for
the exact commands):

- **Graph admin consent** - `az ad app permission admin-consent` as a Global
  Administrator; verify by READING `servicePrincipals/<sp>/appRoleAssignments`.
- **Power Platform Administrator** - `POST /roleManagement/directory/roleAssignments`
  (works even when the directory role is not activated in a fresh tenant).
- **The Power Platform management app** - `New-PowerAppManagementApp` is only a
  wrapper around `PUT https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/adminApplications/<appId>?api-version=2020-10-01`,
  run in a signed-in USER az session (an SP cannot register itself).
- **Dataverse Application Users + the minimal role** - the Dataverse Web API
  (`POST /systemusers`, create the `AgentLens Reader` role, `AddPrivilegesRole`,
  associate). Never assign System Administrator.

One genuinely manual pre-step when the DEFAULT environment is in scope: the
installer must grant themselves System Administrator on it in PPAC first -
Power Platform Administrator does not confer data-plane rights there and no
public API exposes the grant.

### Getting the zip right

This is the part that most often goes wrong, and the part the user is relying on
you for. The zip embeds the MCP URL at package time:

```bash
AGENT_APP_ID=<stable-guid> \
AGENTLENS_MCP_URL=https://<fqdn>/mcp \
  npm run package:agent
```

- The URL must be the **deployed FQDN with `/mcp` on the end**. Read it back
  from Azure rather than assuming:
  `az containerapp show --name <app> --resource-group <rg> --query properties.configuration.ingress.fqdn -o tsv`
- `AGENT_APP_ID` must stay **stable across re-packages**. A new GUID creates a
  second app in the tenant instead of updating the first. The script caches it;
  if you are packaging by hand, reuse the one in `.agentlens-install.json`.
- **Always run `npm run validate:agent` after packaging.** A rejected sideload
  gives a generic error with no line number; this names the broken field first.
- Hand the user `agent/build/agentlens-agent.zip` and the upload click-path.

If the MCP URL changes later, the zip must be rebuilt and re-uploaded - the URL
is baked in. Changing an MCP *tool* does not require this, because the agent
discovers tools at runtime.

### Reporting honestly

The same rule the product follows applies to how you report the install:

- Verify each step landed rather than assuming the command succeeded. `/health`
  is the single best check: `authEnabled` and `readerConfigured` are facts.
- If a step failed or a gate is still open, say so plainly and say what it costs
 - each open gate maps to a specific source the agent will report as
  `not_connected`.
- Never tell the user the install is complete while a gate is open. Say which
  tools will work and which will not.

---

## If the user asks you to change the code

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. The short version:

- Never fabricate a figure. Every number comes from an API response in the same
  call, or is derived by arithmetic whose inputs and rate ship in the same
  payload.
- Zero and unknown are different answers. Never render one as the other.
- `src/domain/rates.ts` is the only place a price may exist.
- Read-only: no tool writes to the tenant.

Before pushing: `npm run type-check`, `npm test`, `npm run validate:agent`. CI
runs all three plus a `docker build` and a bicep compile.
