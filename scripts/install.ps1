#Requires -Version 7
# Windows PowerShell 5.1 cannot run this script: it relies on PS7 behaviour
# (native stderr handling, ConvertFrom-Json -AsHashtable). Without this directive
# it dies mid-run with a NativeCommandError that looks like a tenant problem.
<#
.SYNOPSIS
    Guided end-to-end install of AgentLens: app registrations, the MCP server,
    and the agent package.

.DESCRIPTION
    Runs every step that CAN be scripted, and STOPS at each step that cannot,
    printing the exact command or portal link you need. Re-run it after clearing
    a gate and it picks up where it left off.

    Four things genuinely cannot be automated, and the script does not pretend
    otherwise:

      - Admin consent for the Graph permission needs a Global Administrator.
      - New-PowerAppManagementApp must run in a USER context; a service
        principal cannot register itself.
      - An Application User must be added per Dataverse environment.
      - The Entra SSO auth config (MCP_AUTH_REFERENCE_ID) comes from the Agents
        Toolkit or the Teams developer portal.
      - Uploading the agent zip is a UI action in Microsoft 365 Copilot.

    Every step is idempotent: existing app registrations are reused, existing
    role assignments are left alone, and client secrets are created with
    --append so a secret a running deployment is using is never invalidated.

    STATE. Non-secret values (app IDs, the resource group, the MCP URL) are
    cached in .agentlens-install.json so re-runs are cheap. The client secret is
    NEVER written to that file - it is held in memory only long enough to push
    it into the Container App as a secret.

.PARAMETER TenantId
    Entra tenant ID. Required.

.PARAMETER ResourceGroup
    Resource group for the MCP server. Created if absent.

.PARAMETER Location
    Azure region, e.g. westeurope. Required on first run.

.PARAMETER SubscriptionId
    Subscription to deploy into and read Cost Management from. Defaults to the
    az CLI's current subscription.

.PARAMETER AppName
    Container App name. Defaults to agentlens-mcp.

.PARAMETER DataverseOrgUrls
    Comma-separated Dataverse org URLs for aggregate usage.

.PARAMETER BillingPolicyId
    Pay-as-you-go billing policy ID, for per-agent consumption and cost. Omit if
    the tenant uses prepaid capacity packs - no API exposes per-agent
    consumption for those.

.PARAMETER AgentAppId
    Stable GUID for the Microsoft 365 app. Generate ONCE and keep it: a new GUID
    creates a new app in the tenant rather than updating the existing one.

.PARAMETER DryRun
    Print every command that would run, change nothing.

.PARAMETER Yes
    Do not prompt before each mutating step. Intended for a re-run you have
    already watched once - read the security note in the README first.

.EXAMPLE
    ./scripts/install.ps1 -TenantId <guid> -ResourceGroup rg-agentlens -Location westeurope -DryRun

.EXAMPLE
    ./scripts/install.ps1 -TenantId <guid> -ResourceGroup rg-agentlens -Location westeurope `
        -DataverseOrgUrls "https://contoso.crm4.dynamics.com" -AgentAppId <stable-guid>
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $TenantId,

    [Parameter(Mandatory = $false)]
    [string] $ResourceGroup = 'rg-agentlens',

    [Parameter(Mandatory = $false)]
    [string] $Location,

    [Parameter(Mandatory = $false)]
    [string] $SubscriptionId,

    [Parameter(Mandatory = $false)]
    [string] $AppName = 'agentlens-mcp',

    [Parameter(Mandatory = $false)]
    [string] $DataverseOrgUrls = '',

    [Parameter(Mandatory = $false)]
    [string] $BillingPolicyId = '',

    [Parameter(Mandatory = $false)]
    [string] $AgentAppId = '',

    [Parameter(Mandatory = $false)]
    [switch] $DryRun,

    [Parameter(Mandatory = $false)]
    [switch] $Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot  = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repoRoot '.agentlens-install.json'

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

$script:StepNumber = 0
$script:Gates = @()

function Write-Step([string]$Title) {
    $script:StepNumber++
    Write-Host ''
    Write-Host "=== Step $($script:StepNumber): $Title " -ForegroundColor Cyan -NoNewline
    Write-Host ('=' * [Math]::Max(0, 60 - $Title.Length)) -ForegroundColor Cyan
}

function Write-Do([string]$Msg)   { Write-Host "  -> $Msg" -ForegroundColor Gray }
function Write-Ok([string]$Msg)   { Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Skip([string]$Msg) { Write-Host "  [SKIP] $Msg" -ForegroundColor DarkGray }
function Write-Note([string]$Msg) { Write-Host "  [NOTE] $Msg" -ForegroundColor Yellow }

# A gate is something a human must do. Recorded, printed at the end, and it
# stops the script rather than letting later steps fail confusingly.
function Add-Gate {
    param([string]$Title, [string[]]$Instructions, [switch]$Blocking)
    $script:Gates += [pscustomobject]@{
        Title        = $Title
        Instructions = $Instructions
        Blocking     = [bool]$Blocking
    }
    Write-Host ''
    Write-Host "  [MANUAL] $Title" -ForegroundColor Magenta
    foreach ($line in $Instructions) { Write-Host "      $line" -ForegroundColor White }
}

function Confirm-Step([string]$Action) {
    if ($DryRun -or $Yes) { return $true }
    $answer = Read-Host "  Run this? [$Action] (y/N)"
    return $answer -match '^(y|yes)$'
}

# Every mutating az call goes through here so -DryRun is honoured in one place
# rather than remembered at each call site.
function Invoke-Az {
    param([string[]]$Arguments, [switch]$AllowFailure)

    # Quote any argument containing a space, so a command printed by -DryRun can
    # be pasted into a shell and actually work. Splatting below passes the array
    # elements individually, so this affects the display only.
    $rendered = 'az ' + (($Arguments | ForEach-Object {
        if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' ')
    if ($DryRun) {
        Write-Host "  [dry-run] $rendered" -ForegroundColor DarkCyan
        return $null
    }

    Write-Do $rendered
    $output = & az @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($AllowFailure) {
            Write-Note "command failed (continuing): $output"
            return $null
        }
        throw "Command failed: $rendered`n$output"
    }
    return $output
}

# Read-only az call. Runs even under -DryRun, because the script needs to see
# the tenant to decide what still has to be done.
function Invoke-AzQuery {
    param([string[]]$Arguments)
    $output = & az @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    if ([string]::IsNullOrWhiteSpace($output)) { return $null }
    return $output
}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

function Get-State {
    if (Test-Path $stateFile) {
        try { return Get-Content $stateFile -Raw | ConvertFrom-Json -AsHashtable }
        catch { Write-Note "state file unreadable, starting fresh: $stateFile" }
    }
    return @{}
}

function Save-State([hashtable]$State) {
    if ($DryRun) { return }
    # Non-secret values only. Anything secret stays in memory.
    $State | ConvertTo-Json -Depth 5 | Set-Content -Path $stateFile -Encoding utf8
}

$state = Get-State

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

Write-Host ''
Write-Host 'AgentLens install' -ForegroundColor Cyan
if ($DryRun) { Write-Host 'DRY RUN - nothing will be changed.' -ForegroundColor DarkCyan }

Write-Step 'Preflight'

foreach ($tool in @('az', 'node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool not found on PATH. See docs/operate/DEPLOY.md for prerequisites."
    }
}
Write-Ok 'az, node and npm are available'

$account = Invoke-AzQuery @('account', 'show', '-o', 'json')
if (-not $account) {
    throw "Not signed in. Run: az login --tenant $TenantId"
}
$accountJson = $account | ConvertFrom-Json
if ($accountJson.tenantId -ne $TenantId) {
    throw "az is signed into tenant $($accountJson.tenantId), not $TenantId. Run: az login --tenant $TenantId"
}
Write-Ok "signed into tenant $TenantId"

if ([string]::IsNullOrWhiteSpace($SubscriptionId)) {
    $SubscriptionId = $accountJson.id
    Write-Ok "using current subscription $SubscriptionId"
}

# containerapp lives in an extension; installing it up front avoids a confusing
# failure half-way through the deploy step.
$extensions = Invoke-AzQuery @('extension', 'list', '--query', "[?name=='containerapp'].name", '-o', 'tsv')
if (-not $extensions) {
    Write-Do 'installing the containerapp az extension'
    Invoke-Az @('extension', 'add', '--name', 'containerapp', '--only-show-errors') -AllowFailure | Out-Null
} else {
    Write-Ok 'containerapp extension present'
}

$state['tenantId'] = $TenantId
$state['subscriptionId'] = $SubscriptionId
Save-State $state

# ---------------------------------------------------------------------------
# 1. AgentLens-Reader
# ---------------------------------------------------------------------------

Write-Step 'AgentLens-Reader app registration'

$readerApp = Invoke-AzQuery @('ad', 'app', 'list', '--display-name', 'AgentLens-Reader', '--query', '[0]', '-o', 'json')

if ($readerApp) {
    $readerAppId = ($readerApp | ConvertFrom-Json).appId
    Write-Ok "reusing existing AgentLens-Reader ($readerAppId)"
} else {
    if (-not (Confirm-Step 'create the AgentLens-Reader app registration')) {
        throw 'Stopped at your request.'
    }
    Write-Do 'delegating to scripts/provision-reader-app.ps1'
    if ($DryRun) {
        Write-Host "  [dry-run] ./scripts/provision-reader-app.ps1 -TenantId $TenantId" -ForegroundColor DarkCyan
        $readerAppId = '<created-on-a-real-run>'
    } else {
        & (Join-Path $PSScriptRoot 'provision-reader-app.ps1') -TenantId $TenantId
        $readerApp = Invoke-AzQuery @('ad', 'app', 'list', '--display-name', 'AgentLens-Reader', '--query', '[0]', '-o', 'json')
        if (-not $readerApp) { throw 'AgentLens-Reader was not created. See the output above.' }
        $readerAppId = ($readerApp | ConvertFrom-Json).appId
        Write-Ok "created AgentLens-Reader ($readerAppId)"
    }
}

$state['readerAppId'] = $readerAppId
Save-State $state

# A fresh secret each run, in --append mode so nothing already deployed breaks.
$readerSecret = $null
if (-not $DryRun -and $readerAppId -ne '<created-on-a-real-run>') {
    if (Confirm-Step 'mint a client secret for AgentLens-Reader (append mode, existing secrets stay valid)') {
        $readerSecret = & az ad app credential reset --id $readerAppId `
            --display-name "agentlens-install $(Get-Date -Format yyyy-MM-dd)" `
            --append --years 2 --query password -o tsv 2>$null
        if ($LASTEXITCODE -eq 0 -and $readerSecret) {
            Write-Ok 'client secret created (held in memory, never written to disk)'
        } else {
            Write-Note 'could not create a client secret - you will need to set AZURE_CLIENT_SECRET yourself'
            $readerSecret = $null
        }
    }
} elseif ($DryRun) {
    Write-Host '  [dry-run] az ad app credential reset --id <reader> --append --years 2' -ForegroundColor DarkCyan
}

# ---------------------------------------------------------------------------
# 2. Azure RBAC (scriptable) and the directory grants (not)
# ---------------------------------------------------------------------------

Write-Step 'Access grants'

$readerSpId = $null
if ($readerAppId -ne '<created-on-a-real-run>') {
    $readerSpId = Invoke-AzQuery @('ad', 'sp', 'show', '--id', $readerAppId, '--query', 'id', '-o', 'tsv')
}

if ($readerSpId) {
    $scope = "/subscriptions/$SubscriptionId"
    foreach ($role in @('Reader', 'Cost Management Reader')) {
        $existing = Invoke-AzQuery @('role', 'assignment', 'list', '--assignee', $readerSpId, '--scope', $scope, '--role', $role, '--query', '[0].id', '-o', 'tsv')
        if ($existing) {
            Write-Ok "$role already assigned on the subscription"
        } elseif (Confirm-Step "assign '$role' to AgentLens-Reader on $scope") {
            Invoke-Az @('role', 'assignment', 'create', '--assignee-object-id', $readerSpId,
                        '--assignee-principal-type', 'ServicePrincipal',
                        '--role', $role, '--scope', $scope) -AllowFailure | Out-Null
            Write-Ok "$role assigned (or already present)"
        }
    }
} else {
    Write-Skip 'service principal not resolvable yet - role assignment deferred to the next run'
}

# The gates. Each one you skip becomes a not_connected source with the fix
# attached, rather than a wrong number - but it is far quicker to do them now.
Add-Gate -Title 'Power Platform Administrator directory role -> AgentLens-Reader' -Instructions @(
    'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles',
    'Search "Power Platform Administrator" -> Assignments -> Add -> AgentLens-Reader.',
    'Without it Azure Resource Graph returns ZERO ROWS AND NO ERROR, which looks',
    'exactly like a tenant with no agents. This is the one most worth doing.'
)

Add-Gate -Title 'Register the reader as a Power Platform admin management app' -Instructions @(
    'Must run in a USER context - a service principal cannot register itself:',
    '  Install-Module Microsoft.PowerApps.Administration.PowerShell -Scope CurrentUser',
    '  Add-PowerAppsAccount',
    "  New-PowerAppManagementApp -ApplicationId $readerAppId",
    'Without it dlp_posture reports a 403 rather than DLP coverage.'
)

if ($DataverseOrgUrls) {
    Add-Gate -Title 'Application User in each Dataverse environment' -Instructions @(
        'Power Platform admin center -> Environment -> Settings -> Users + permissions',
        '-> Application users -> New app user -> AgentLens-Reader -> give it a read role.',
        "For each of: $DataverseOrgUrls",
        'Without it those environments are reported unreadable, not as zero usage.'
    )
}

# ---------------------------------------------------------------------------
# 3. Deploy the MCP server
# ---------------------------------------------------------------------------

Write-Step 'Deploy the MCP server'

$existingApp = Invoke-AzQuery @('containerapp', 'show', '--name', $AppName, '--resource-group', $ResourceGroup, '--query', 'properties.configuration.ingress.fqdn', '-o', 'tsv')

if ($existingApp) {
    $fqdn = $existingApp
    Write-Ok "container app already deployed at $fqdn"
    if (Confirm-Step 'push a new image from the current source') {
        Invoke-Az @('containerapp', 'up', '--name', $AppName, '--resource-group', $ResourceGroup,
                    '--source', $repoRoot, '--target-port', '3000', '--ingress', 'external') | Out-Null
    }
} else {
    if (-not $Location) {
        throw '-Location is required on the first run, e.g. -Location westeurope'
    }
    if (-not (Confirm-Step "deploy $AppName into $ResourceGroup ($Location)")) {
        throw 'Stopped at your request.'
    }
    Invoke-Az @('containerapp', 'up', '--name', $AppName, '--resource-group', $ResourceGroup,
                '--location', $Location, '--source', $repoRoot,
                '--target-port', '3000', '--ingress', 'external') | Out-Null

    $fqdn = if ($DryRun) { '<app>.azurecontainerapps.io' } else {
        Invoke-AzQuery @('containerapp', 'show', '--name', $AppName, '--resource-group', $ResourceGroup, '--query', 'properties.configuration.ingress.fqdn', '-o', 'tsv')
    }
    if ($fqdn) { Write-Ok "deployed at $fqdn" }
}

$mcpUrl = "https://$fqdn/mcp"
$state['resourceGroup'] = $ResourceGroup
$state['appName'] = $AppName
$state['mcpUrl'] = $mcpUrl
Save-State $state

# ---------------------------------------------------------------------------
# 4. Configure it
# ---------------------------------------------------------------------------

Write-Step 'Configure the server'

if ($readerSecret) {
    if (Confirm-Step 'store the client secret as a Container App secret') {
        Invoke-Az @('containerapp', 'secret', 'set', '--name', $AppName, '--resource-group', $ResourceGroup,
                    '--secrets', "azure-client-secret=$readerSecret") | Out-Null
        Write-Ok 'secret stored as a secret reference, not a plain environment variable'
    }
} else {
    Write-Skip 'no new client secret this run - leaving the existing secret in place'
}

$envVars = @(
    "AZURE_TENANT_ID=$TenantId",
    "AZURE_CLIENT_ID=$readerAppId",
    "AZURE_SUBSCRIPTION_ID=$SubscriptionId"
)
if ($readerSecret) { $envVars += 'AZURE_CLIENT_SECRET=secretref:azure-client-secret' }
if ($DataverseOrgUrls) { $envVars += "DATAVERSE_ORG_URLS=$DataverseOrgUrls" }
if ($BillingPolicyId)  { $envVars += "PPAC_BILLING_POLICY_ID=$BillingPolicyId" }

if (Confirm-Step 'set the server environment variables') {
    Invoke-Az (@('containerapp', 'update', '--name', $AppName, '--resource-group', $ResourceGroup, '--set-env-vars') + $envVars) | Out-Null
    Write-Ok "$($envVars.Count) environment variable(s) set"
}

if (-not $BillingPolicyId) {
    Write-Note 'PPAC_BILLING_POLICY_ID not supplied - per-agent cost will report as unavailable.'
    Write-Note 'Find it in the Power Platform admin center under Billing policies, or leave it'
    Write-Note 'unset if this tenant uses prepaid capacity packs (no API exposes per-agent'
    Write-Note 'consumption for those).'
}

# ---------------------------------------------------------------------------
# 5. Verify what it can actually reach
# ---------------------------------------------------------------------------

Write-Step 'Verify'

if ($DryRun) {
    Write-Host "  [dry-run] curl https://$fqdn/health" -ForegroundColor DarkCyan
} else {
    try {
        $health = Invoke-RestMethod -Uri "https://$fqdn/health" -TimeoutSec 60
        Write-Ok "health: authEnabled=$($health.authEnabled) readerConfigured=$($health.readerConfigured)"
        if (-not $health.readerConfigured) {
            Write-Note 'readerConfigured is false - the credentials have not landed on the revision yet.'
            Write-Note 'Container Apps takes a moment to roll a new revision; re-check in a minute.'
        }
    } catch {
        Write-Note "could not reach https://$fqdn/health yet: $($_.Exception.Message)"
        Write-Note 'A cold start on a scale-to-zero app can take a few seconds. Try again shortly.'
    }
}

Write-Note 'Before trusting a per-agent cost figure, check the undocumented licensing'
Write-Note 'endpoint against this tenant:  npm run verify:consumption'

# ---------------------------------------------------------------------------
# 6. Package the agent
# ---------------------------------------------------------------------------

Write-Step 'Package the agent'

if (-not $AgentAppId) {
    if ($state.ContainsKey('agentAppId') -and $state['agentAppId']) {
        $AgentAppId = $state['agentAppId']
        Write-Ok "reusing the app id from a previous run ($AgentAppId)"
    } else {
        $AgentAppId = [guid]::NewGuid().ToString()
        Write-Note "generated a new Microsoft 365 app id: $AgentAppId"
        Write-Note 'KEEP IT. Re-running with a different GUID creates a second app in the'
        if ($DryRun) {
            Write-Note 'tenant instead of updating this one. A real run saves it to'
            Write-Note '.agentlens-install.json; this dry run has NOT saved it.'
        } else {
            Write-Note 'tenant instead of updating this one. Saved to .agentlens-install.json.'
        }
    }
}
$state['agentAppId'] = $AgentAppId
Save-State $state

if ($DryRun) {
    Write-Host "  [dry-run] AGENT_APP_ID=$AgentAppId AGENTLENS_MCP_URL=$mcpUrl npm run package:agent" -ForegroundColor DarkCyan
} elseif (Confirm-Step 'build the agent zip') {
    $env:AGENT_APP_ID = $AgentAppId
    $env:AGENTLENS_MCP_URL = $mcpUrl
    Push-Location $repoRoot
    try {
        & npm run package:agent
        if ($LASTEXITCODE -ne 0) { throw 'npm run package:agent failed.' }
        Write-Ok "packaged agent/build/agentlens-agent.zip pointing at $mcpUrl"
    } finally {
        Pop-Location
    }
}

Add-Gate -Title 'Upload the agent zip' -Instructions @(
    'https://m365.cloud.microsoft/chat -> Agents -> Add agent -> Upload custom agent',
    'Pick agent/build/agentlens-agent.zip. This is a UI action; there is no',
    'supported CLI for it. Then ask a conversation starter and check the numbers',
    'against the Power Platform admin center.'
)

# ---------------------------------------------------------------------------
# 7. Secure the endpoint
# ---------------------------------------------------------------------------

Write-Step 'Secure the endpoint'

Write-Note "Until this is done, ANYONE WITH THE URL CAN CALL $mcpUrl"

$mcpApp = Invoke-AzQuery @('ad', 'app', 'list', '--display-name', 'AgentLens-MCP', '--query', '[0].appId', '-o', 'tsv')
if ($mcpApp) {
    Write-Ok "AgentLens-MCP already registered ($mcpApp)"
    $state['mcpAppId'] = $mcpApp
    Save-State $state
} elseif ($DryRun) {
    Write-Host "  [dry-run] ./scripts/provision-agent-mcp-app.ps1 -TenantId $TenantId -McpUrl $mcpUrl" -ForegroundColor DarkCyan
} elseif (Confirm-Step 'create the AgentLens-MCP app registration') {
    & (Join-Path $PSScriptRoot 'provision-agent-mcp-app.ps1') -TenantId $TenantId -McpUrl $mcpUrl
    $mcpApp = Invoke-AzQuery @('ad', 'app', 'list', '--display-name', 'AgentLens-MCP', '--query', '[0].appId', '-o', 'tsv')
    if ($mcpApp) {
        $state['mcpAppId'] = $mcpApp
        Save-State $state
        Write-Ok "created AgentLens-MCP ($mcpApp)"
    }
}

Add-Gate -Title 'Create the Entra SSO auth config, then re-package' -Blocking -Instructions @(
    'No public API for this - use one of:',
    '  VS Code + Microsoft 365 Agents Toolkit -> Add an Action -> Start with an',
    '  MCP Server -> Microsoft Entra SSO, or',
    '  https://dev.teams.microsoft.com/tools -> Microsoft Entra SSO client ID registration',
    "Supply the AgentLens-MCP client id ($(if ($mcpApp) { $mcpApp } else { '<created above>' })).",
    'It returns an auth config ID and an Application ID URI. Then:',
    "  ./scripts/provision-agent-mcp-app.ps1 -TenantId $TenantId -McpUrl $mcpUrl ``",
    '      -SsoApplicationIdUri "<Application ID URI>"',
    "  az containerapp update --name $AppName --resource-group $ResourceGroup ``",
    "      --set-env-vars MCP_TENANT_ID=$TenantId MCP_AUDIENCE='<Application ID URI>'",
    '  MCP_AUTH_REFERENCE_ID="<auth config ID>" AGENT_APP_ID=' + $AgentAppId + ' ``',
    "      AGENTLENS_MCP_URL=$mcpUrl npm run package:agent",
    'Then re-upload the zip and confirm /health reports authEnabled: true.'
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ''
Write-Host ('=' * 72) -ForegroundColor Cyan
Write-Host '  What is left for you' -ForegroundColor Cyan
Write-Host ('=' * 72) -ForegroundColor Cyan

if ($script:Gates.Count -eq 0) {
    Write-Ok 'nothing - every step was scriptable.'
} else {
    $i = 0
    foreach ($gate in $script:Gates) {
        $i++
        Write-Host ''
        Write-Host "  $i. $($gate.Title)" -ForegroundColor Magenta
        foreach ($line in $gate.Instructions) { Write-Host "     $line" -ForegroundColor Gray }
    }
}

Write-Host ''
Write-Host '  Re-run this script after clearing a gate; it picks up where it left off.' -ForegroundColor Gray
if (-not $DryRun) {
    Write-Host "  State: $stateFile (no secrets in it)" -ForegroundColor Gray
}
Write-Host ''
