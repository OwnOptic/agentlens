# Maintaining AgentLens

For whoever inherits a running deployment. [INSTALL.md](INSTALL.md) covers day
one; this covers every day after: updating it, diagnosing it, extending it, and
handing it over.

The same rule the product follows applies to operating it: **a step is done when
its effect has been read back from the service, not when a command exits 0.**

---

## 1. Day-two operations

### Deploying a new version

```bash
az containerapp up --name agentlens-mcp --resource-group <rg> --source .
curl https://<fqdn>/health        # confirm the revision actually took traffic
```

Container Apps roll revisions gradually. The old revision keeps serving while
the new one activates, so an immediately-after check can show the OLD behaviour.
Wait for the rollover (`az containerapp revision list` - the new revision at
100 traffic) before declaring anything about the deploy, in either direction.

For a pinned, provable deploy, use the image digest rather than a tag.

### Secret rotation - calendar this at install time

The reader secret is created with `--append` and a **two-year expiry**, and
nothing warns you before it lapses. When it does, every tool goes
`not_connected` at once (token acquisition fails).

Rotation dance, zero downtime:

1. `az ad app credential reset --id <reader-app-id> --append --years 2` (append: the old secret stays valid)
2. `az containerapp secret set ... --secrets azure-client-secret=<new>` then a revision restart
3. Verify `/health` -> `readerConfigured: true` and one live tool call
4. Delete the old credential from the app registration (portal or `az ad app credential delete`)

Same procedure for the AgentLens-MCP app if you gave it a secret (the default
install does not - inbound validation is JWKS-only, no secret to rotate).

### Reading logs

```bash
az containerapp logs show --name agentlens-mcp --resource-group <rg> --tail 50 --type console
```

A healthy startup prints the transport, the port, whether the reader is
configured, and the inbound auth state. `inbound auth: DISABLED` in production
logs is a finding, not a detail.

### Cost drift - check monthly

The Container App is genuinely $0 idle. The **Container Registry** and Log
Analytics are standing charges. If the subscription's spend moves, those two
plus token egress are where to look first.

---

## 2. When it breaks: the /health decision tree

`curl https://<fqdn>/health` first. It returns two facts:

| Reading | Meaning | Fix |
|---|---|---|
| no response at all | app stopped or ingress broken | `az containerapp revision list`; logs |
| `readerConfigured: false` | reader credentials missing or the secret expired | INSTALL step 9; check secret expiry |
| `authEnabled: false` | **the endpoint is open to the internet** | INSTALL step 10, today |
| both true, but a tool reports `not_connected` | that tool's specific grant regressed | the remediation in the tool's own output names the step |

### Gates that silently regress, and what each looks like

| Regression | Symptom |
|---|---|
| Reader secret expired | everything `not_connected` at once, token errors in logs |
| Power Platform Admin role removed | Copilot Studio agents drop to zero **with no error** - the silent one. Trust it only if a sibling query (connectors, environments) still returns rows |
| Management-app registration removed | `dlp_posture` 403 |
| Application User disabled or role stripped | that environment flips to unreadable, not zero |
| SSO auth config deleted in the Teams portal | agent sign-in loops; server still healthy |
| Custom app upload disabled tenant-wide | existing installs keep working; re-uploads fail |

### Two readings that look like failures and are not

- **`msdyn_conversationkpis` 404** in an environment: Copilot Studio has never
  been used there. The server reports it as *reachable, no recorded usage*.
- **Cost Management HTTP 429**: throttling, not a permissions failure. The
  role is fine; retry later. Visual Studio subscriptions throttle hard.

---

## 3. Extending it

### The one fact that saves you re-uploads

**The agent discovers tools at runtime.** Adding, removing or changing an MCP
tool needs NO repackaging and NO re-upload. Only two things force a new zip:
the MCP **URL** changing, or the **auth config** changing.

### Adding a tool

1. New file in `src/tools/`, registered in `src/index.ts` beside the other five.
2. It must return a `ToolResult` (`src/lib/result.ts`). A source it cannot
   reach returns `not_connected` with the reason and the fix - implementing a
   tool means replacing the not-connected branch with real data, **never
   removing the branch**.
3. Zero and unknown are different answers. Never render one as the other.
4. Read-only: no tool writes to the tenant. That is the product's security
   story; a security reviewer will check it.

### Adding a data source

Connector in `src/connectors/`, per-source status in the tool's `sources`
array, and it starts life reporting `not_connected` rather than being absent -
an administrator should see what the tool *would* read.

### Changing pricing

`src/domain/rates.ts` is the **only** place a price may exist. Operator rates
come from `COPILOT_RATE_STANDARD` / `COPILOT_RATE_PREMIUM`; unset falls back to
the published list price, labelled as such with the date it was checked. Every
figure ships its rate and source in the same payload.

### Before pushing

```bash
npm run type-check && npm test && npm run validate:agent
```

CI runs all three plus a `docker build` and a bicep compile.

### The Dataverse role, when Copilot Studio starts being used

The minimal `AgentLens Reader` role grants `prvReadbot`, `prvReadBusinessUnit`
and `prvReadUser`. The KPI privilege (`prvReadmsdyn_conversationkpi`) only
exists after the first Copilot Studio use in an environment - add it to the
role then, or usage reads will 403 where they used to 404.

---

## 4. Handover - fill this in per tenant and keep it with the deployment

| Fact | Value |
|---|---|
| Tenant ID | |
| Reader app ID / SP object ID | |
| Reader secret location + **expiry date** | |
| AgentLens-MCP app ID | |
| SSO auth config ID + Application ID URI | |
| `AGENT_APP_ID` (stable forever - a new GUID makes a second app) | |
| Container app name / resource group / FQDN | |
| Dataverse org URLs + which have Application Users | |
| Billing policy ID, or "prepaid - unmeasured" | |
| Which Phase 0 prerequisites were confirmed, by whom, when | |
