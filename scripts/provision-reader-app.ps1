#Requires -Version 7
# Windows PowerShell 5.1 cannot run this script: it relies on PS7 behaviour
# (native stderr handling, ConvertFrom-Json -AsHashtable). Without this directive
# it dies mid-run with a NativeCommandError that looks like a tenant problem.
<#
.SYNOPSIS
    Provisions AgentLens-Reader - the one service principal the MCP server uses
    to read the tenant.

.DESCRIPTION
    Creates (or reuses by displayName) the AgentLens-Reader app registration:

      - Microsoft Graph APPLICATION permission: User.Read.All, admin-consented.
        This is what turns an agent's owner ID into an owner's name.
      - No ARM delegated permission. The service principal uses client
        credentials; Azure Resource Graph access comes from the Power Platform
        Administrator DIRECTORY ROLE, which cannot be scripted (manual step 1).
      - A client secret, optionally stored in Key Vault as AZURE-CLIENT-SECRET.

    IDEMPOTENT for the app registration: an app with the same displayName is
    reused, not duplicated. EXCEPTION: secrets are created with --append, so
    each run ADDS a secret and existing ones stay valid. Prune stale secrets in
    the portal periodically.

    This is the only app registration needed to READ. Securing the MCP server
    itself against unauthenticated callers is a separate registration - see
    scripts/provision-agent-mcp-app.ps1.

.PARAMETER TenantId
    Entra tenant ID (GUID). Required.

.PARAMETER KeyVaultName
    Optional. Key Vault to store the client secret in. Without it the secret is
    printed once for you to paste into .env or the Container App settings.

.EXAMPLE
    ./provision-reader-app.ps1 -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

.EXAMPLE
    ./provision-reader-app.ps1 -TenantId "<guid>" -KeyVaultName "agentlens-kv"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TenantId,

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

function Write-Step([string]$Msg) { Write-Host "  -> $Msg" -ForegroundColor Gray }
function Write-Done([string]$Msg) { Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "  [WARN] $Msg" -ForegroundColor Yellow }

function Find-AppByName([string]$Name) {
    $result = az ad app list --display-name $Name --query "[0]" -o json 2>$null
    if ($null -eq $result -or $result -eq "null") { return $null }
    return $result | ConvertFrom-Json
}

# --append so re-running never invalidates a secret a live deployment is using.
function New-AppSecret([string]$AppId, [string]$Description) {
    Write-Step "Creating client secret '$Description' (append mode)"
    $raw = az ad app credential reset `
        --id $AppId `
        --display-name $Description `
        --append `
        --years 2 `
        --query "password" -o tsv
    return $raw.Trim()
}

function Set-KvSecret([string]$SecretName, [string]$SecretValue, [string]$Description) {
    if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
        Write-Warn "No -KeyVaultName supplied - '$SecretName' was not stored. Copy it from the output below."
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

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

Write-Section "Pre-flight"

$null = az --version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI (az) not found. Install from https://aka.ms/installazurecli and retry."
}
Write-Done "az CLI available."

$signedInTenant = (az account show --query "tenantId" -o tsv 2>$null)
if ($null -ne $signedInTenant) { $signedInTenant = $signedInTenant.Trim() }
if ($signedInTenant -ne $TenantId) {
    Write-Warn "Current az session is on tenant '$signedInTenant', not '$TenantId'."
    Write-Warn "Running: az login --tenant $TenantId"
    az login --tenant $TenantId --allow-no-subscriptions
}
Write-Done "Signed in to tenant $TenantId."

# ---------------------------------------------------------------------------
# AgentLens-Reader
# ---------------------------------------------------------------------------

Write-Section "AgentLens-Reader - the read-only data service principal"

$readerName = "AgentLens-Reader"
$readerApp  = Find-AppByName $readerName

if ($null -ne $readerApp) {
    Write-Done "Found existing app: $readerName (appId $($readerApp.appId)) - reusing."
    $readerAppId = $readerApp.appId
} else {
    Write-Step "Creating app registration '$readerName'"
    $created = az ad app create `
        --display-name $readerName `
        --sign-in-audience "AzureADMyOrg" `
        --query "{appId:appId, id:id}" -o json | ConvertFrom-Json
    $readerAppId = $created.appId
    Write-Done "Created $readerName appId=$readerAppId"
}

$readerSpExists = az ad sp show --id $readerAppId --query "appId" -o tsv 2>$null
if ([string]::IsNullOrEmpty($readerSpExists)) {
    Write-Step "Creating service principal for $readerName"
    az ad sp create --id $readerAppId --output none
    Write-Done "Service principal created."
} else {
    Write-Done "Service principal already exists."
}

# ---- Graph API permission ----
# Microsoft Graph resource appId, constant across every tenant.
$graphResourceId = "00000003-0000-0000-c000-000000000000"
# User.Read.All, application permission.
$userReadAllId = "df021288-bdef-4463-88db-98f22de89214"

Write-Step "Adding Graph User.Read.All (application) permission"
az ad app permission add `
    --id $readerAppId `
    --api $graphResourceId `
    --api-permissions "${userReadAllId}=Role" `
    --output none 2>$null
Write-Done "User.Read.All added."

Write-Warn "CopilotPackages.Read.All (Agent 365 licence required) is intentionally NOT"
Write-Warn "requested. Add it manually once the tenant has Agent 365 licences; until then"
Write-Warn "the M365 agent store reports itself as not connected, which is accurate."

# User.Read.All is an application role, not a delegated scope, so admin-consent
# (which creates an appRoleAssignment) is the correct mechanism - not
# `az ad app permission grant`. The wait absorbs Entra replication lag.
Write-Step "Waiting for the permission to replicate before admin consent"
Start-Sleep -Seconds 20
Write-Step "Granting admin consent (requires a Global Administrator session)"
az ad app permission admin-consent --id $readerAppId --output none 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Automatic admin-consent did not complete. Grant it manually - step 2 below."
} else {
    Write-Done "Admin consent applied."
}

$readerSecret = New-AppSecret -AppId $readerAppId -Description "AgentLens-Reader automated"
Set-KvSecret -SecretName "AZURE-CLIENT-SECRET" -SecretValue $readerSecret `
             -Description "AgentLens-Reader SP client secret"

# ---------------------------------------------------------------------------
# Manual steps
# ---------------------------------------------------------------------------

Write-Section "MANUAL STEPS (these cannot be scripted)"

Write-Host ""
Write-Host "1. GRANT the Power Platform Administrator directory role to $readerName" -ForegroundColor White
Write-Host "   Without it the Azure Resource Graph query returns zero rows with no error," -ForegroundColor Gray
Write-Host "   which looks exactly like a tenant with no agents." -ForegroundColor Gray
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. VERIFY admin consent for the Graph permission" -ForegroundColor White
Write-Host "   https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$readerAppId" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. GRANT 'Cost Management Reader' on the subscription (for value_and_cost)" -ForegroundColor White
Write-Host "   Subscription -> Access control (IAM) -> Add role assignment" -ForegroundColor Gray
Write-Host "   -> Cost Management Reader -> Member: $readerName" -ForegroundColor Gray
Write-Host ""
Write-Host "4. REGISTER the SP as a Power Platform admin management app (for dlp_posture)" -ForegroundColor White
Write-Host "   In a user context, not as the service principal:" -ForegroundColor Gray
Write-Host "     Install-Module Microsoft.PowerApps.Administration.PowerShell" -ForegroundColor Cyan
Write-Host "     New-PowerAppManagementApp -ApplicationId $readerAppId" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. ADD the SP as an Application User in each Dataverse environment (for usage)" -ForegroundColor White
Write-Host "   Power Platform admin center -> Environment -> Settings -> Users + permissions" -ForegroundColor Gray
Write-Host "   -> Application users -> New app user -> $readerName -> give it a read role." -ForegroundColor Gray
Write-Host "   Then list those org URLs in DATAVERSE_ORG_URLS." -ForegroundColor Gray
Write-Host ""

Write-Section "Environment block"

Write-Host ""
Write-Host "AZURE_TENANT_ID=$TenantId"
Write-Host "AZURE_CLIENT_ID=$readerAppId"
if ([string]::IsNullOrWhiteSpace($KeyVaultName)) {
    Write-Host "AZURE_CLIENT_SECRET=$readerSecret"
} else {
    Write-Host "# AZURE_CLIENT_SECRET is in Key Vault as AZURE-CLIENT-SECRET"
    Write-Host "KEY_VAULT_URI=https://$KeyVaultName.vault.azure.net/"
}
Write-Host ""

Write-Section "Done"
Write-Done "AgentLens-Reader appId: $readerAppId"
Write-Warn "Each manual step you skip shows up as a 'not connected' source in the agent's"
Write-Warn "answers, with the fix. Nothing silently degrades to a wrong number."
