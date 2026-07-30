<#
.SYNOPSIS
    Provisions the AgentLens-MCP Entra app registration used by the AgentLens
    declarative agent to call the AgentLens MCP server with Entra SSO.

.DESCRIPTION
    This is the THIRD app registration, in addition to the two created by
    scripts/provision-app-registrations.ps1:

      A) AgentLens-Reader  - the data service principal (reads the five APIs).
      B) AgentLens-WebApp  - Entra SSO for the Next.js console (optional).
      C) AgentLens-MCP     - THIS SCRIPT. Secures the MCP endpoint that the
                             declarative agent calls.

    The agent never touches tenant data directly. The chain is:

      user -> declarative agent -> AgentLens-MCP (SSO gate, this app)
           -> AgentLens-Reader (client credentials) -> the five read-only APIs

    So this app registration holds NO data permissions. Its only job is to
    prove who is calling the MCP server. All read permissions live on
    AgentLens-Reader.

    What this script creates / re-applies (idempotent by displayName):
      - The app registration (reused if it already exists).
      - Application ID URI: api://<appId>
      - An exposed delegated scope: access_as_user
      - Pre-authorized Microsoft 365 host clients, so users are not prompted
        for consent inside Copilot.
      - The service principal.
      - A client secret (--append, so existing secrets stay valid), optionally
        stored in Key Vault as MCP-CLIENT-SECRET.

.PARAMETER TenantId
    The Entra tenant ID to provision in. Must match the signed-in az context.

.PARAMETER McpUrl
    Public HTTPS URL of the hosted AgentLens MCP server, for example
    https://agentlens-mcp.azurecontainerapps.io/mcp
    Used for the redirect URI and echoed into the env block.

.PARAMETER KeyVaultName
    Optional. If supplied, the client secret is stored in this Key Vault.

.EXAMPLE
    ./scripts/provision-agent-mcp-app.ps1 `
        -TenantId  "<tenant-guid>" `
        -McpUrl    "https://agentlens-mcp.azurecontainerapps.io/mcp" `
        -KeyVaultName "kv-agentlens"

.NOTES
    Requires the Azure CLI (az) and a signed-in session with permission to
    create app registrations (Application Administrator or Global
    Administrator). Admin consent at the end needs a Global Administrator.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TenantId,

    [Parameter(Mandatory = $true)]
    [string] $McpUrl,

    [Parameter(Mandatory = $false)]
    [string] $KeyVaultName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers (same conventions as provision-app-registrations.ps1)
# ---------------------------------------------------------------------------

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
}

function Write-Step([string]$Msg) { Write-Host "  -> $Msg" -ForegroundColor Gray }
function Write-Done([string]$Msg) { Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "  [WARN] $Msg" -ForegroundColor Yellow }

function Find-AppByName([string]$Name) {
    $result = az ad app list --display-name $Name --query "[0]" -o json 2>$null
    if ([string]::IsNullOrWhiteSpace($result) -or $result -eq "null") { return $null }
    return $result | ConvertFrom-Json
}

# PATCH the application object via Microsoft Graph. az CLI cannot express the
# nested api{} object, and passing raw JSON inline breaks on Windows quoting,
# so the body goes through a temp file.
function Invoke-GraphPatch([string]$ObjectId, [hashtable]$Body) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        ($Body | ConvertTo-Json -Depth 12) | Set-Content -Path $tmp -Encoding utf8
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" `
            --headers "Content-Type=application/json" `
            --body "@$tmp" --output none
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

function New-AppSecret([string]$AppId, [string]$Description) {
    $raw = az ad app credential reset `
        --id $AppId `
        --display-name $Description `
        --years 2 `
        --append `
        --query "password" -o tsv
    return $raw
}

function Set-KvSecret([string]$SecretName, [string]$SecretValue, [string]$Description) {
    if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
        Write-Warn "No -KeyVaultName supplied; $SecretName not stored in Key Vault."
        return
    }
    az keyvault secret set `
        --vault-name $KeyVaultName `
        --name $SecretName `
        --value $SecretValue `
        --description $Description `
        --output none
    Write-Done "Stored $SecretName in Key Vault $KeyVaultName"
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

Write-Section "Pre-flight"

$azVersion = az version --query '"azure-cli"' -o tsv 2>$null
if ([string]::IsNullOrWhiteSpace($azVersion)) {
    throw "Azure CLI not found. Install it from https://aka.ms/installazurecli"
}
Write-Done "Azure CLI $azVersion"

$currentTenant = az account show --query "tenantId" -o tsv 2>$null
if ([string]::IsNullOrWhiteSpace($currentTenant)) {
    throw "Not signed in. Run: az login --tenant $TenantId"
}
if ($currentTenant -ne $TenantId) {
    throw "Signed into tenant $currentTenant but -TenantId is $TenantId. Run: az login --tenant $TenantId"
}
Write-Done "Signed into tenant $TenantId"

if ($McpUrl -notmatch '^https://') {
    throw "-McpUrl must be an https:// URL. Copilot will not call a plaintext endpoint."
}

# Derive the origin (scheme + host) from the MCP URL for the redirect URI.
$mcpOrigin = ([System.Uri]$McpUrl).GetLeftPart([System.UriPartial]::Authority)
Write-Done "MCP origin $mcpOrigin"

# ---------------------------------------------------------------------------
# (C) AgentLens-MCP
# ---------------------------------------------------------------------------

Write-Section "(C) AgentLens-MCP - SSO gate for the declarative agent"

$mcpAppName = "AgentLens-MCP"
$existing = Find-AppByName $mcpAppName

if ($null -ne $existing) {
    $mcpAppId    = $existing.appId
    $mcpObjectId = $existing.id
    Write-Done "Reusing existing app registration ($mcpAppId)"
}
else {
    Write-Step "Creating app registration $mcpAppName"
    $created = az ad app create `
        --display-name $mcpAppName `
        --sign-in-audience "AzureADMyOrg" `
        --query "{appId:appId,id:id}" -o json | ConvertFrom-Json
    $mcpAppId    = $created.appId
    $mcpObjectId = $created.id
    Write-Done "Created ($mcpAppId)"
    # Entra needs a moment before the new object is patchable.
    Start-Sleep -Seconds 10
}

# ---- Service principal ----
$mcpSpExists = az ad sp show --id $mcpAppId --query "appId" -o tsv 2>$null
if ([string]::IsNullOrWhiteSpace($mcpSpExists)) {
    Write-Step "Creating service principal"
    az ad sp create --id $mcpAppId --output none
    Write-Done "Service principal created"
}
else {
    Write-Done "Service principal already exists"
}

# ---- Application ID URI + exposed scope ----
# Reuse the existing scope id when re-running, otherwise Entra rejects the
# patch as a duplicate scope value.
$existingScopeId = az ad app show --id $mcpAppId `
    --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]" -o tsv 2>$null

if ([string]::IsNullOrWhiteSpace($existingScopeId) -or $existingScopeId -eq "None") {
    $scopeId = [guid]::NewGuid().ToString()
    Write-Step "Creating delegated scope access_as_user ($scopeId)"
}
else {
    $scopeId = $existingScopeId
    Write-Done "Reusing delegated scope access_as_user ($scopeId)"
}

# Microsoft 365 host clients that must be pre-authorized so the user is not
# prompted for consent inside Copilot. These are the well-known first-party
# Teams / Office / Outlook client IDs used for Entra SSO.
# VERIFY against current docs if a host stops working:
# https://learn.microsoft.com/microsoftteams/platform/tabs/how-to/authentication/tab-sso-register-aad
$preAuthClients = @(
    "1fec8e78-bce4-4aaf-ab1b-5451cc387264", # Teams desktop / mobile
    "5e3ce6c0-2b1f-4285-8d4b-75ee78787346", # Teams web
    "4765445b-32c6-49b0-83e6-1d93765276ca", # Office / Microsoft 365 web
    "0ec893e0-5785-4de6-99da-4ed124e5296c", # Office desktop
    "bc59ab01-8403-45c6-8796-ac3ef710b3e3"  # Outlook web / desktop
)

$apiPatch = @{
    identifierUris = @("api://$mcpAppId")
    api = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes = @(
            @{
                id                      = $scopeId
                value                   = "access_as_user"
                type                    = "User"
                isEnabled               = $true
                adminConsentDisplayName = "Access AgentLens governance data"
                adminConsentDescription = "Allows Microsoft 365 Copilot to call the AgentLens MCP server on behalf of the signed-in administrator. Read-only."
                userConsentDisplayName  = "Access AgentLens governance data"
                userConsentDescription  = "Allows Copilot to read your tenant's agent governance data on your behalf. Read-only."
            }
        )
        preAuthorizedApplications = @(
            $preAuthClients | ForEach-Object {
                @{
                    appId                  = $_
                    delegatedPermissionIds = @($scopeId)
                }
            }
        )
    }
    web = @{
        redirectUris = @("$mcpOrigin/auth/callback")
    }
}

Write-Step "Applying identifierUri, scope and pre-authorized clients"
Invoke-GraphPatch -ObjectId $mcpObjectId -Body $apiPatch
Write-Done "Application ID URI: api://$mcpAppId"
Write-Done "Exposed scope: access_as_user"
Write-Done "Pre-authorized $($preAuthClients.Count) Microsoft 365 host clients"

# ---- Client secret ----
Write-Step "Creating client secret (append mode)"
$mcpSecret = New-AppSecret -AppId $mcpAppId -Description "agentlens-mcp"
Write-Done "Client secret created"
Set-KvSecret -SecretName "MCP-CLIENT-SECRET" -SecretValue $mcpSecret -Description "AgentLens-MCP client secret"

# ---------------------------------------------------------------------------
# Manual steps
# ---------------------------------------------------------------------------

Write-Section "MANUAL STEPS (a Global Administrator must do these)"

Write-Host ""
Write-Host "1. GRANT ADMIN CONSENT for AgentLens-MCP" -ForegroundColor White
Write-Host "   Consents the access_as_user scope tenant-wide so users are not prompted." -ForegroundColor Gray
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$mcpAppId" -ForegroundColor Cyan
Write-Host "   Or run:  az ad app permission admin-consent --id $mcpAppId" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. CONFIRM the MCP server validates this audience" -ForegroundColor White
Write-Host "   The MCP server must accept tokens with audience api://$mcpAppId" -ForegroundColor Gray
Write-Host "   and reject anything else. Set MCP_AUDIENCE below." -ForegroundColor Gray
Write-Host ""
Write-Host "3. POINT THE AGENT AT THE SERVER" -ForegroundColor White
Write-Host "   In agent/appPackage/ai-plugin.json the runtime URL is a placeholder." -ForegroundColor Gray
Write-Host "   Set AGENTLENS_MCP_URL (or edit the file) to: $McpUrl" -ForegroundColor Gray
Write-Host "   Then repackage and sideload - see agent/README.md." -ForegroundColor Gray
Write-Host ""
Write-Host "4. REMEMBER: this app grants NO data access" -ForegroundColor White
Write-Host "   All tenant read permissions live on AgentLens-Reader." -ForegroundColor Gray
Write-Host "   Run scripts/provision-app-registrations.ps1 if you have not already." -ForegroundColor Gray
Write-Host ""

Write-Section "Environment block (for the MCP server)"

Write-Host ""
Write-Host "# --- AgentLens-MCP (SSO gate) ---" -ForegroundColor DarkGray
Write-Host "MCP_TENANT_ID=$TenantId"
Write-Host "MCP_CLIENT_ID=$mcpAppId"
Write-Host "MCP_AUDIENCE=api://$mcpAppId"
if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
    Write-Host "MCP_CLIENT_SECRET=$mcpSecret"
} else {
    Write-Host "# MCP_CLIENT_SECRET is in Key Vault as MCP-CLIENT-SECRET"
    Write-Host "KEY_VAULT_URI=https://$KeyVaultName.vault.azure.net/"
}
Write-Host "AGENTLENS_MCP_URL=$McpUrl"
Write-Host ""

Write-Section "Done"
Write-Done "AgentLens-MCP appId : $mcpAppId"
Write-Done "Application ID URI  : api://$mcpAppId"
Write-Warn "Grant admin consent (step 1) before sideloading the agent."
