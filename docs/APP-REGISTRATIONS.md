# App registrations and permissions

Two registrations, with deliberately separate jobs.

| Registration | Job | Flow | Script |
|---|---|---|---|
| **AgentLens-Reader** | Reads the tenant. Holds every data permission | Client credentials | `scripts/provision-reader-app.ps1` |
| **AgentLens-MCP** | Guards the MCP endpoint. Holds no data permission | Entra SSO, token validated by the server | `scripts/provision-agent-mcp-app.ps1` |

The split is the point: the thing that is exposed to the internet holds no
permissions, and the thing that holds permissions is never exposed.

---

## AgentLens-Reader

### What it does

Acquires tokens by client credentials for each audience the MCP server reads:

| Audience | Used for |
|---|---|
| `https://management.azure.com/.default` | Azure Resource Graph, Cost Management, Power Platform governance (DLP) |
| `https://graph.microsoft.com/.default` | Owner resolution, Agent 365 registry |
| `https://service.powerapps.com/.default` | Environment list (BAP admin API) |
| `{orgUrl}/.default` | Dataverse, per environment |
| `https://analysis.windows.net/powerbi/api/.default` | Fabric data agents |

### Graph permissions

| Permission | Type | Consent | Why |
|---|---|---|---|
| `User.Read.All` | Application | Admin | Turn an agent's owner object ID into a name. Without it every agent looks like an orphan |
| `CopilotPackages.Read.All` | Application | Admin | The M365 agent registry. **Licence gated** (Agent 365), so it is not requested by the script — add it manually once licensed |

### Access that is not an API permission

Three of the five sources are not granted through Entra API permissions at all,
which is the most common reason a deployment half-works:

| Access | Mechanism | Grants |
|---|---|---|
| Power Platform Administrator | Entra **directory role** on the SP | Copilot Studio agents via ARG, environment list |
| Reader / Cost Management Reader | **Azure RBAC** on the subscription | ARG queries, real spend |
| Admin management application | `New-PowerAppManagementApp`, run by an **administrator in a user context** | DLP policy read |
| Application User | Per Dataverse **environment**, with a security role | Aggregate usage KPIs |

A service principal cannot register itself as a management app, and a
tenant-level grant does nothing for Dataverse — access is per environment.

### Deliberately not requested

| Permission | Why not |
|---|---|
| Any `.ReadWrite.` scope | The product's core claim is read-only. Nothing writes to the tenant |
| `Chat.Read.All`, `ChannelMessage.Read.All` | Conversation content is never read. Usage comes from a pre-aggregated KPI table |
| `Directory.Read.All` | `User.Read.All` is narrower and sufficient for owner names |
| `Sites.Read.All`, `Files.Read.All` | AgentLens governs agents, not content |

If a feature seems to need a broader grant, raise it rather than granting it.

### Client secret

Two-year expiry, created with `--append` so re-running the script never
invalidates a secret a live deployment is using. Store it in Key Vault
(`AZURE-CLIENT-SECRET`) and set `KEY_VAULT_URI`, or inject it as a Container App
secret reference. It is never committed and never logged.

Rotation: re-run the script, update the secret in Key Vault or the Container App,
restart the revision, then delete the old credential in Entra.

---

## AgentLens-MCP

### What it does

Nothing, in data terms. It exists so the MCP server can prove that an inbound
call came from Microsoft 365 Copilot acting for a signed-in user in your tenant.

The server validates, on every request:

| Claim | Expected |
|---|---|
| `aud` | The Entra SSO auth config's Application ID URI, or `api://<mcp-app-id>`. Both v1.0 and v2.0 forms are accepted |
| `iss` | `login.microsoftonline.com/<tenant>/v2.0` or `sts.windows.net/<tenant>/` |
| `azp` / `appid` | `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`, the Microsoft Enterprise token store |

That last GUID is the **only** client that needs pre-authorization. Copilot
acquires the token through the Enterprise token store; this is not the Teams
tab-SSO client-ID list, and that pattern does not apply here.

### Required configuration

| Requirement | Value |
|---|---|
| `identifierUris` | Must include the auth config's Application ID URI |
| Web redirect URI | `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect` |
| Expose an API → client application | `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` |

`az ad app update` cannot set the nested `api{}` object; the script PATCHes
Microsoft Graph directly instead.

Full four-step walkthrough: [agent/README.md](../agent/README.md#authentication).

---

## Security reviewer questions

**Can it change anything in our tenant?** No. Every permission is a read
permission, and no tool issues a POST, PATCH or DELETE against a tenant API. The
only writes anywhere are to the container's stdout.

**Can it read our employees' conversations with agents?** No. Usage comes from
`msdyn_conversationkpis`, a pre-aggregated table of counts and rates. The
`conversationtranscript` table is never queried. No end user is identified
anywhere in the output.

**What personal data does it emit?** One field: an agent *owner's* display name,
because ownership is the accountability signal for an agent. No end users.

**What happens if the server is compromised?** The attacker gains whatever
AgentLens-Reader can read — read-only, in one tenant, with every call logged by
Entra. The server holds no permissions of its own, and rotating one client secret
revokes the access.

**Why is the endpoint public?** Copilot requires a publicly reachable https
endpoint. It is protected by Entra SSO token validation, not by network position.
Until `MCP_AUDIENCE` is set, that validation is off — check `/health` reports
`authEnabled: true` before treating the deployment as production.
