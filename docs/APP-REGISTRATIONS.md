# AgentLens - App Registrations & Permission Matrix

Two Entra app registrations are needed to run AgentLens in production.
The provisioning script `scripts/provision-app-registrations.ps1` creates
both and stores secrets in Azure Key Vault.  This document explains every
permission requested, the least-privilege justification, and what a security
reviewer will ask about.

---

## Overview

| Registration | Purpose | Auth flow |
|---|---|---|
| **AgentLens-Reader** | Service principal for data reads (ARG, Graph) | Client credentials (app-only) |
| **AgentLens-WebApp** | Entra SSO for the Next.js app (next-auth) | Authorization code + ID token |

---

## AgentLens-Reader

### What it does

This SP runs the inbound data pipeline: it queries Azure Resource Graph for
`PowerPlatformResources` (agent inventory, environment topology) and calls
Microsoft Graph for user profile lookups.  It uses **client credentials**
(no user context, no delegated permission, no interactive sign-in).

### ARM / Power Platform access

**No ARM permission is requested on this app registration.**

Azure Resource Graph returns Power Platform resources because the SP holds
the **Power Platform Administrator** Entra *directory role*, not because of
any OAuth scope.  The directory role is assigned manually in the Entra portal
after the script runs (see MANUAL STEPS in the script output).

Security reviewer FAQ:
- "Why not request `user_impersonation` on ARM?" - It would require a signed-in
  user and would not work for a background service.  The directory role achieves
  the same read without delegating a user credential.
- "Does this SP have write access to any Power Platform environment?" - No.
  The Power Platform Administrator role grants read via ARG.  AgentLens never
  calls the Power Platform admin APIs to mutate environment configuration.

### Microsoft Graph permissions

| Scope | Type | ID | Why it is needed | Feature that dies without it | Least-privilege justification |
|---|---|---|---|---|---|
| `User.Read.All` | Application | `df021288-bdef-4463-88db-98f22de89214` | Resolve agent owners and makers from Entra user objects (display name, department, UPN) to populate the Inventory and Maker View pages. | Maker View shows only GUIDs; owner attribution is blank in Inventory. | Read-only on user profiles.  No permission to create, update, or delete users or groups. |

**Admin consent required:** yes (application permission).  The script calls
`az ad app permission admin-consent`.  A Global Admin must confirm the green
tick in the Entra portal if the CLI call is made from a non-admin account.

### Intentionally excluded permissions

| Scope | Reason for exclusion |
|---|---|
| `CopilotPackages.Read.All` | Agent 365 license-gated.  Not available in tenants without Agent 365.  Enable manually in the app registration once the tenant has licenses assigned. |
| `Directory.Read.All` | Not needed.  `User.Read.All` is sufficient for owner resolution. |
| `DeviceManagementApps.Read.All` and similar | Not related to the product's read surface. |

### Client secret

The script creates a 2-year client secret and stores it in Azure Key Vault
as `AZURE-CLIENT-SECRET`.  The app reads it at runtime via
`lib/config/secrets.ts` (`getSecret("AZURE-CLIENT-SECRET")`), which uses
`DefaultAzureCredential` (managed identity in production, `az login` locally).

---

## AgentLens-WebApp

### What it does

This app registration handles **user sign-in** via Microsoft Entra (OpenID
Connect / OAuth2 authorization code flow).  It does not call any backend API
directly; it issues ID tokens so the Next.js app can identify who is signed in
and what role they hold.

### No API permissions

AgentLens-WebApp requests **no API permissions**.  User sign-in (OpenID
Connect) requires only the implicit `openid`, `profile`, and `email` scopes,
which are granted automatically and do not require admin consent.

### Redirect URIs

| URI | Purpose |
|---|---|
| `https://<AppUrl>/api/auth/callback/azure-ad` | Production next-auth callback |
| `http://localhost:3000/api/auth/callback/azure-ad` | Local development callback |

Both are registered by the provisioning script.

### ID tokens

ID tokens are enabled (`enableIdTokenIssuance: true`).  next-auth uses them
in the hybrid flow to avoid an extra `/userinfo` round-trip.

### appRoles

Two roles are embedded in the app manifest.  Users must be assigned a role
in the Entra Enterprise Application blade before they can sign in.

| Role value | Display name | Who it is for | Capabilities |
|---|---|---|---|
| `admin` | Admin | IT admins, Witivio delivery team | Full access: settings, release gates, all environments, alert configuration |
| `maker` | Maker | Power Platform makers and developers | Read-only access scoped to their own environments |

Role assignment is a **manual step** (cannot be scripted without a signed-in
admin session).  See the MANUAL STEPS section of the provisioning script output.

### Secrets

| Key Vault secret name | Env var equivalent | Purpose |
|---|---|---|
| `WEBAPP-CLIENT-SECRET` | `AZURE_AD_CLIENT_SECRET` | next-auth OAuth client secret |
| `AUTH-SECRET` | `AUTH_SECRET` | next-auth JWT signing key (32 random bytes, base64) |

---

## Security model summary

| Property | Value |
|---|---|
| **Data egress** | None beyond the app's own Supabase DB and the configured Teams webhook URL.  No customer message content is read or stored. |
| **Write access to client tenant** | None.  AgentLens is read-only toward Power Platform and Graph. |
| **Secret storage** | Azure Key Vault (production).  Managed identity; no credential in code or app settings.  `.env.local` for local dev only (gitignored). |
| **Token handling** | Client credentials tokens are acquired at runtime, cached in memory with TTL, never written to disk or logs. |
| **Least-privilege** | Two scopes total (`User.Read.All` + the PP-Admin directory role).  No write scope, no directory-write, no mail/calendar/chat access. |
| **Auth model** | Entra SSO (OIDC).  Users must be explicitly role-assigned before they can sign in.  Auth can be disabled for demo mode. |
| **Honesty** | Pages that require live credentials show a "not connected" state rather than fabricating data. |

---

## Common security reviewer questions

**Q: Does the app read message content (Teams chats, emails)?**
A: No.  The only Graph permission is `User.Read.All` (user profiles, read-only).
No mail, calendar, Teams, or SharePoint permission is requested.

**Q: Can this SP modify our Power Platform environments?**
A: No.  The Power Platform Administrator directory role grants read access via
Azure Resource Graph.  No write-capable Power Platform API call is made.

**Q: Why does the WebApp registration have no API permissions?**
A: User sign-in via OIDC needs only the implicit scopes (`openid`, `profile`,
`email`), which do not require admin consent.  All data reads are done by the
Reader SP in a separate, server-side process.

**Q: What happens if the client secret is compromised?**
A: Rotate it via `az ad app credential reset` (or the portal) and update the
Key Vault secret.  The 10-minute in-memory cache in `lib/config/secrets.ts`
will expire within 10 minutes and the new value will be picked up automatically.

**Q: Does the managed identity have any permissions beyond Key Vault reads?**
A: No.  The App Service managed identity is assigned `Key Vault Secrets User`
on the Key Vault only.  It has no Entra directory role and no subscription role.

---

## Provisioning script quick reference

```powershell
# First run (no Key Vault yet - prints secrets to console)
.\scripts\provision-app-registrations.ps1 `
    -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -AppUrl   "https://agentlens.azurewebsites.net"

# Production run (stores secrets in Key Vault)
.\scripts\provision-app-registrations.ps1 `
    -TenantId    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -AppUrl      "https://agentlens.azurewebsites.net" `
    -KeyVaultName "agentlens-kv"
```

The script is idempotent: run it again after an environment reset or to
rotate secrets without creating duplicate app registrations.
