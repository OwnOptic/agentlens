<#
.SYNOPSIS
    Provisions the two Entra app registrations required by AgentLens and
    optionally stores client secrets in Azure Key Vault.

.DESCRIPTION
    Creates (or reuses by displayName) two app registrations:

      A) AgentLens-Reader  - service principal for data reads.
         - Graph APPLICATION permission: User.Read.All
         - No ARM delegated permission (SP uses client credentials; the
           Power Platform Administrator DIRECTORY ROLE grants ARG access).
         - Client secret stored in Key Vault as AZURE-CLIENT-SECRET.

      B) AgentLens-WebApp  - Entra SSO for the Next.js app (next-auth).
         - Web redirect URIs: $AppUrl/api/auth/callback/azure-ad
           and http://localhost:3000/api/auth/callback/azure-ad.
         - ID tokens enabled.
         - Two appRoles: Admin and Maker.
         - Client secret in KV as WEBAPP-CLIENT-SECRET.
         - Random 32-byte AUTH-SECRET in KV.

    The script is IDEMPOTENT for the app registrations themselves: if an app
    with the same displayName already exists it is reused, not duplicated, and
    redirect URIs / ID-token / appRoles / assignment-required are re-applied.
    EXCEPTION: client secrets are created in --append mode, so each run adds a
    NEW secret (existing secrets stay valid - safe for live deployments, but
    prune stale secrets periodically in the portal).

    At the end it prints a MANUAL STEPS section and a ready-to-paste
    .env.local block so the operator has everything in one place.

.PARAMETER TenantId
    Entra tenant ID (GUID).  Required.

.PARAMETER AppUrl
    Public URL of the deployed app, e.g. https://agentlens.azurewebsites.net
    Do not include a trailing slash.  Used for the SSO redirect URI.

.PARAMETER KeyVaultName
    Optional.  Name of the Azure Key Vault to store secrets in.
    If omitted the script prints secrets to the console (for manual .env.local
    entry) but does NOT store them in Key Vault.

.EXAMPLE
    .\provision-app-registrations.ps1 `
        -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
        -AppUrl "https://agentlens.azurewebsites.net" `
        -KeyVaultName "agentlens-kv"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TenantId,

    [Parameter(Mandatory = $true)]
    [string] $AppUrl,

    [Parameter(Mandatory = $false)]
    [string] $KeyVaultName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
}

function Write-Step([string]$Msg) {
    Write-Host "  -> $Msg" -ForegroundColor Gray
}

function Write-Done([string]$Msg) {
    Write-Host "  [OK] $Msg" -ForegroundColor Green
}

function Write-Warn([string]$Msg) {
    Write-Host "  [WARN] $Msg" -ForegroundColor Yellow
}

# Lookup an app registration by displayName; return null if not found.
function Find-AppByName([string]$Name) {
    $result = az ad app list --display-name $Name --query "[0]" -o json 2>$null
    if ($null -eq $result -or $result -eq "null") { return $null }
    return $result | ConvertFrom-Json
}

# Create a client secret and return the secret value string.
# Uses --append so re-running the script ADDS a new secret rather than
# invalidating any secret already in use by a live deployment.
function New-AppSecret([string]$AppId, [string]$Description) {
    Write-Step "Creating client secret '$Description' on app $AppId (append mode)"
    $raw = az ad app credential reset `
        --id $AppId `
        --display-name $Description `
        --append `
        --years 2 `
        --query "password" -o tsv
    return $raw.Trim()
}

# Store a secret in Key Vault; warn and skip if $KeyVaultName is empty.
function Set-KvSecret([string]$SecretName, [string]$SecretValue, [string]$Description) {
    if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
        Write-Warn "No -KeyVaultName supplied - skipping KV write for '$SecretName'. Add it to .env.local manually."
        return
    }
    Write-Step "Storing '$SecretName' in Key Vault '$KeyVaultName'"
    az keyvault secret set `
        --vault-name $KeyVaultName `
        --name $SecretName `
        --value $SecretValue `
        --description $Description `
        --output none
    Write-Done "KV secret '$SecretName' set."
}

# Generate a cryptographically random 32-byte base64 string.
function New-RandomSecret {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    return [Convert]::ToBase64String($bytes)
}

# ---------------------------------------------------------------------------
# Verify az CLI is available and signed in to the right tenant
# ---------------------------------------------------------------------------

Write-Section "Pre-flight"

$null = az --version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI (az) not found. Install from https://aka.ms/installazurecliwindows and retry."
}
Write-Done "az CLI available."

$signedInTenant = (az account show --query "tenantId" -o tsv 2>$null).Trim()
if ($signedInTenant -ne $TenantId) {
    Write-Warn "Current az session is on tenant '$signedInTenant', not '$TenantId'."
    Write-Warn "Running: az login --tenant $TenantId"
    az login --tenant $TenantId --allow-no-subscriptions
}
Write-Done "Signed in to tenant $TenantId."

# ---------------------------------------------------------------------------
# (A) AgentLens-Reader
# ---------------------------------------------------------------------------

Write-Section "(A) AgentLens-Reader - data service principal"

$readerName  = "AgentLens-Reader"
$readerApp   = Find-AppByName $readerName

if ($null -ne $readerApp) {
    Write-Done "Found existing app: $readerName (appId $($readerApp.appId)) - reusing."
    $readerAppId   = $readerApp.appId
    $readerObjectId = $readerApp.id
} else {
    Write-Step "Creating app registration '$readerName'"
    $created = az ad app create `
        --display-name $readerName `
        --sign-in-audience "AzureADMyOrg" `
        --query "{appId:appId, id:id}" -o json | ConvertFrom-Json
    $readerAppId    = $created.appId
    $readerObjectId = $created.id
    Write-Done "Created $readerName appId=$readerAppId"
}

# Create the service principal if it does not exist
$readerSpExists = az ad sp show --id $readerAppId --query "appId" -o tsv 2>$null
if ([string]::IsNullOrEmpty($readerSpExists)) {
    Write-Step "Creating service principal for $readerName"
    az ad sp create --id $readerAppId --output none
    Write-Done "Service principal created."
} else {
    Write-Done "Service principal already exists."
}

# ---- Graph API permissions ----
# Microsoft Graph resource appId (constant across all tenants)
$graphResourceId = "00000003-0000-0000-c000-000000000000"

# User.Read.All - APPLICATION permission
# Permission ID: df021288-bdef-4463-88db-98f22de89214
$userReadAllId   = "df021288-bdef-4463-88db-98f22de89214"

Write-Step "Adding Graph User.Read.All (application) permission"
az ad app permission add `
    --id $readerAppId `
    --api $graphResourceId `
    --api-permissions "${userReadAllId}=Role" `
    --output none 2>$null
Write-Done "User.Read.All added."

# CopilotPackages.Read.All is Agent-365-license-gated; document but do not add.
Write-Warn "NOTE: CopilotPackages.Read.All (Agent 365 license required) is intentionally"
Write-Warn "      NOT requested. Enable it in the app registration manually once the tenant"
Write-Warn "      has Agent 365 licenses assigned."

# Admin-consent the Graph APPLICATION permission for the tenant.
# Note: User.Read.All is an application role, NOT a delegated scope, so the
# correct mechanism is admin-consent (which creates an appRoleAssignment).
# `az ad app permission grant` is for delegated oauth2 scopes and is NOT used here.
# A short wait absorbs Entra replication lag between `permission add` and consent.
Write-Step "Waiting for permission to replicate before admin consent"
Start-Sleep -Seconds 20
Write-Step "Granting admin consent for $readerName Graph permissions (requires Global Admin)"
az ad app permission admin-consent --id $readerAppId --output none 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Automatic admin-consent did not complete (needs a Global Admin session)."
    Write-Warn "Grant it manually - see MANUAL STEP 2 below."
} else {
    Write-Done "Admin consent applied. Verify green ticks in the Entra portal (API permissions)."
}

# ---- Client secret ----
$readerSecret = New-AppSecret -AppId $readerAppId -Description "AgentLens-Reader automated"
Set-KvSecret -SecretName "AZURE-CLIENT-SECRET" -SecretValue $readerSecret `
             -Description "AgentLens-Reader SP client secret"

# ---------------------------------------------------------------------------
# (B) AgentLens-WebApp
# ---------------------------------------------------------------------------

Write-Section "(B) AgentLens-WebApp - Entra SSO (next-auth)"

$webAppName    = "AgentLens-WebApp"
$callbackProd  = "$AppUrl/api/auth/callback/azure-ad"
$callbackLocal = "http://localhost:3000/api/auth/callback/azure-ad"

$webApp = Find-AppByName $webAppName

if ($null -ne $webApp) {
    Write-Done "Found existing app: $webAppName (appId $($webApp.appId)) - reusing."
    $webAppId     = $webApp.appId
    $webObjectId  = $webApp.id
} else {
    Write-Step "Creating app registration '$webAppName'"
    # NOTE: pass the literal lowercase string 'true' - a PowerShell $true would
    # stringify to 'True', which az CLI rejects (invalid choice).
    $webCreated = az ad app create `
        --display-name $webAppName `
        --sign-in-audience "AzureADMyOrg" `
        --web-redirect-uris $callbackProd $callbackLocal `
        --enable-id-token-issuance true `
        --query "{appId:appId, id:id}" -o json | ConvertFrom-Json
    $webAppId    = $webCreated.appId
    $webObjectId = $webCreated.id
    Write-Done "Created $webAppName appId=$webAppId"
}

# Ensure redirect URIs are set (idempotent update in case app pre-existed)
Write-Step "Ensuring redirect URIs are registered"
az ad app update `
    --id $webAppId `
    --web-redirect-uris $callbackProd $callbackLocal `
    --output none
Write-Done "Redirect URIs set."

# Enable ID tokens (required by next-auth). Literal 'true' (see note above).
Write-Step "Enabling ID token issuance"
az ad app update `
    --id $webAppId `
    --enable-id-token-issuance true `
    --output none
Write-Done "ID tokens enabled."

# The WebApp needs a service principal (enterprise application) in the tenant so
# that users/groups can be assigned the Admin/Maker roles and so sign-in can be
# restricted to assigned users. A single-tenant app would lazily create this on
# first consent, but we create it explicitly to make role assignment work now.
$webSpObjectId = az ad sp show --id $webAppId --query "id" -o tsv 2>$null
if ([string]::IsNullOrEmpty($webSpObjectId)) {
    Write-Step "Creating service principal (enterprise app) for $webAppName"
    $webSpObjectId = az ad sp create --id $webAppId --query "id" -o tsv
    Write-Done "Enterprise application created (objectId $webSpObjectId)."
} else {
    Write-Done "Enterprise application already exists (objectId $webSpObjectId)."
}

# Require explicit role assignment to sign in. Without this ANY tenant user can
# authenticate; combined with role defaults that would over-grant access. With it,
# only users assigned Admin or Maker can sign in.
Write-Step "Enforcing 'assignment required' on the enterprise application"
az ad sp update --id $webSpObjectId --set appRoleAssignmentRequired=true --output none 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Could not set appRoleAssignmentRequired automatically - set 'Assignment required = Yes'"
    Write-Warn "manually under Enterprise applications -> $webAppName -> Properties."
} else {
    Write-Done "Assignment required enforced (only Admin/Maker users can sign in)."
}

# ---- appRoles (Admin + Maker) ----
Write-Step "Setting appRoles (Admin, Maker)"

$appRolesJson = @"
[
  {
    "allowedMemberTypes": ["User"],
    "description": "Full access to AgentLens: settings, release gates, all environments.",
    "displayName": "Admin",
    "id": "a1b2c3d4-0001-0001-0001-000000000001",
    "isEnabled": true,
    "value": "admin"
  },
  {
    "allowedMemberTypes": ["User"],
    "description": "Read-only access scoped to environments the maker belongs to.",
    "displayName": "Maker",
    "id": "a1b2c3d4-0002-0002-0002-000000000002",
    "isEnabled": true,
    "value": "maker"
  }
]
"@

# Write to a temp file to avoid shell quoting issues.
# Use .NET WriteAllText (no BOM): Windows PowerShell 5.1 `Set-Content -Encoding utf8`
# emits a UTF-8 BOM, which az CLI's @file JSON parser chokes on.
$rolesFile = [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "agentlens-approles-$([System.Guid]::NewGuid().ToString('N')).json")
[System.IO.File]::WriteAllText($rolesFile, $appRolesJson)

az ad app update `
    --id $webAppId `
    --app-roles "@$rolesFile" `
    --output none

Remove-Item $rolesFile -Force
Write-Done "appRoles Admin + Maker set."

# ---- Client secret ----
$webSecret = New-AppSecret -AppId $webAppId -Description "AgentLens-WebApp automated"
Set-KvSecret -SecretName "WEBAPP-CLIENT-SECRET" -SecretValue $webSecret `
             -Description "AgentLens-WebApp SSO client secret"

# ---- AUTH-SECRET (next-auth JWT signing key) ----
$authSecret = New-RandomSecret
Set-KvSecret -SecretName "AUTH-SECRET" -SecretValue $authSecret `
             -Description "next-auth JWT signing secret (AUTH_SECRET)"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Section "MANUAL STEPS (required - cannot be scripted)"

Write-Host ""
Write-Host "1. GRANT Power Platform Administrator directory role to AgentLens-Reader SP" -ForegroundColor White
Write-Host "   Without this role the Azure Resource Graph query for PowerPlatformResources" -ForegroundColor Gray
Write-Host "   will return zero results (no error, just empty inventory)." -ForegroundColor Gray
Write-Host ""
Write-Host "   Portal deep link:" -ForegroundColor Gray
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles" -ForegroundColor Cyan
Write-Host "   -> Search 'Power Platform Administrator' -> Assignments -> Add assignment" -ForegroundColor Gray
Write-Host "   -> Members: search '$readerName' -> Select -> Add" -ForegroundColor Gray
Write-Host ""
Write-Host "2. VERIFY admin consent for AgentLens-Reader Graph permissions" -ForegroundColor White
Write-Host "   The script attempted admin-consent automatically but it requires a Global Admin" -ForegroundColor Gray
Write-Host "   session.  Confirm green ticks appear here:" -ForegroundColor Gray
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$readerAppId" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. ASSIGN ROLES to users in AgentLens-WebApp" -ForegroundColor White
Write-Host "   Assignment is REQUIRED (enforced above) - only assigned users can sign in." -ForegroundColor Gray
Write-Host "   Each user needs the 'Admin' or 'Maker' role." -ForegroundColor Gray
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Users/objectId/$webSpObjectId/appId/$webAppId" -ForegroundColor Cyan
Write-Host "   -> Add user/group -> Select role (Admin or Maker)" -ForegroundColor Gray
Write-Host ""
Write-Host "4. (If using Key Vault + Managed Identity in production)" -ForegroundColor White
Write-Host "   Assign 'Key Vault Secrets User' role to the App Service managed identity:" -ForegroundColor Gray
Write-Host "   Portal: Key Vault -> Access control (IAM) -> Add role assignment" -ForegroundColor Gray
Write-Host "   -> Role: Key Vault Secrets User -> Member: your App Service name" -ForegroundColor Gray
Write-Host ""

Write-Section ".env.local block (copy-paste for local development)"

Write-Host ""
Write-Host "# --- AgentLens-Reader (data SP) ---" -ForegroundColor DarkGray
Write-Host "AZURE_TENANT_ID=$TenantId"
Write-Host "AZURE_CLIENT_ID=$readerAppId"
if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
    Write-Host "AZURE_CLIENT_SECRET=$readerSecret"
} else {
    Write-Host "# AZURE_CLIENT_SECRET is in Key Vault as AZURE-CLIENT-SECRET"
    Write-Host "KEY_VAULT_URI=https://$KeyVaultName.vault.azure.net/"
}
Write-Host ""
Write-Host "# --- AgentLens-WebApp (SSO) ---" -ForegroundColor DarkGray
Write-Host "AZURE_AD_CLIENT_ID=$webAppId"
if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
    Write-Host "AZURE_AD_CLIENT_SECRET=$webSecret"
    Write-Host "AUTH_SECRET=$authSecret"
} else {
    Write-Host "# AZURE_AD_CLIENT_SECRET is in Key Vault as WEBAPP-CLIENT-SECRET"
    Write-Host "# AUTH_SECRET is in Key Vault as AUTH-SECRET"
}
Write-Host "NEXTAUTH_URL=$AppUrl"
Write-Host ""

Write-Section "Done"
Write-Done "AgentLens-Reader appId : $readerAppId"
Write-Done "AgentLens-WebApp appId : $webAppId"
if (-not [string]::IsNullOrWhiteSpace($KeyVaultName)) {
    Write-Done "Secrets stored in Key Vault: $KeyVaultName"
}
Write-Warn "Complete the 4 MANUAL STEPS above before starting the app."
