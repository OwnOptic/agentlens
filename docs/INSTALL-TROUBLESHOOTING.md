# Install troubleshooting

Every entry below was hit during a real end-to-end install into a clean tenant.
Most of these either fail silently or report success while leaving something
broken - the pattern the honesty principle exists to guard against.

---

## Machine and CLI traps

### `az role assignment` fails with `MissingSubscription` - even `list`

Seen on az CLI 2.87.0 on Windows: the entire `az role assignment` command family
errors while `az role definition list` and raw ARM calls work fine. It is a CLI
defect, not a permissions problem. Workaround - make the assignment as a raw
ARM PUT:

```bash
az rest --method put \
  --url "https://management.azure.com/subscriptions/<sub>/providers/Microsoft.Authorization/roleAssignments/$(uuidgen)?api-version=2022-04-01" \
  --body '{"properties":{"roleDefinitionId":"/subscriptions/<sub>/providers/Microsoft.Authorization/roleDefinitions/<role-def-id>","principalId":"<sp-object-id>","principalType":"ServicePrincipal"}}'
```

### `az containerapp up` / `az acr build` dies with `UnicodeEncodeError: '▲'`

The az CLI's log streamer crashes on Windows cp1252 consoles when the build
prints a Unicode glyph. **The build continues server-side and usually
succeeds.** Check the real status with `az acr task list-runs` / the container
app revision list, and set `PYTHONIOENCODING=utf-8` to avoid it entirely.

### PowerShell 5.1 cannot run the `.ps1` scripts

They carry `#Requires -Version 7` so the failure is immediate and named. The
underlying reasons: PS 5.1 wraps redirected native stderr in `NativeCommandError`
(fatal under `$ErrorActionPreference='Stop'`, triggered by az's harmless
warnings and by expected "not found" probes), and `ConvertFrom-Json -AsHashtable`
is PS7+. Every step in INSTALL.md also lists the raw command, so PS7 is never a
hard blocker.

### Windows PowerShell writes a UTF-8 BOM

`Set-Content -Encoding utf8` on PS 5.1 emits a BOM, which strict JSON parsers
reject. When a script writes JSON that another tool consumes, use
`[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`
and check with `head -c 3 file | od -An -tx1` (want `7b`, not `ef bb bf`).

---

## Identity and Entra

### Power Platform Administrator: "role cannot take members"

In a fresh tenant the directory role is not activated, so
`POST /directoryRoles/.../members/$ref` 404s. Use the role-assignment API
instead - works regardless of activation:

```bash
POST https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments
{"principalId":"<sp-id>","roleDefinitionId":"11648597-926c-4cf3-9c36-bcebb0ba8dcc","directoryScopeId":"/"}
```

### Admin consent "succeeded" but the grant is not there

Consent lags Entra replication by up to ~30 seconds. Verify by READING the
grant (`servicePrincipals/<sp>/appRoleAssignments`), never by the exit code,
and retry once before concluding failure.

### Entra rejects a scope and its pre-authorization in one PATCH

`Property api.preAuthorizedApplications.delegatedPermissionIds has a Permission
Id that cannot be found` - the scope must exist before anything references it.
Two PATCHes: `identifierUris` + `oauth2PermissionScopes` first,
`preAuthorizedApplications` second.

### `AADSTS650053: asked for scope ... on resource 00000003-0000-0000-c000-000000000000`

That GUID is Microsoft Graph. A **bare** scope name in the Teams developer
portal's Scope field resolves against Graph by default. Enter the fully
qualified scope: `api://<app-id>/access_as_user`. Confirm in the Entra sign-in
logs: the **resource** column must show your app, not Microsoft Graph.

### Valid token, but the server returns 401

Three checks, in order:

1. **Audience form.** With `requestedAccessTokenVersion: 2` the token's `aud`
   is the app id **GUID**; v1 tokens carry `api://<app-id>`; the Teams portal
   mints a third form, `api://auth-<guid>/<client-id>`. The server accepts the
   GUID and `api://<app-id>` forms of whatever `MCP_AUDIENCE` is set to - set
   token version 2 on the app and the GUID path always matches.
2. **Calling client.** The server pins callers to the Microsoft Enterprise
   token store (`ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`). A token from any other
   client - including your own test client - is rejected by design. For a
   one-off test, set `MCP_ALLOWED_CLIENT_ID` to your test client and **revert
   immediately**.
3. **Revision rollover.** After changing env vars, the old revision keeps
   serving briefly. A "wrong" result immediately after an update may be the old
   revision - confirm the new one has 100 traffic before diagnosing.

### The default environment 403s the Application User creation

Power Platform Administrator does **not** grant System Administrator inside the
default environment's data plane (everyone is Basic User + Environment Maker
there). Grant yourself System Administrator on that environment in PPAC first.
No public API exposes this; it is genuinely a click.

---

## Data readings that look like failures

### `msdyn_conversationkpis` returns 404

Dataverse provisions that table on the first Copilot Studio use. A 404 in an
environment means "no Copilot Studio usage ever recorded" - the server reports
it as *reachable, no recorded usage*, distinct from unreadable. The read
privilege (`prvReadmsdyn_conversationkpi`) also does not exist until then; add
it to the `AgentLens Reader` role once the table appears.

### Cost Management returns 429

Throttling, not permissions. Visual Studio subscriptions throttle this API
hard. The role is fine if it ever returned 200; retry later, and never
conclude anything about access from a 429.

### Azure Resource Graph returns zero rows and no error

The documented behaviour when the Power Platform Administrator role is missing,
and indistinguishable from an empty tenant. (In live testing, an SP with **no**
role got an explicit `AccessDenied`; the silent-zero case may require partial
privileges.) Either way: trust a zero only when a sibling query on the same
token returns rows - connectors and environments exist in every tenant.

### A tool says a store is `not_connected` and names a licence

Agent 365 (Graph `copilotPackages`) requires its licence; Azure AI Foundry
requires a project and the Azure AI Developer role; Fabric requires a capacity.
A tenant without those services has nothing to read there - `not_connected`
with the reason **is** the correct, honest answer, not an install defect.
