// main.bicep - AgentLens infrastructure entry point
// Scope: resource group (targetScope = 'resourceGroup')
// Deploys: App Service Plan + Web App (Node 20, system-assigned identity)
//          Azure Key Vault (RBAC mode, purge protection)
//          Role assignment: Key Vault Secrets User -> webapp identity
//          Optionally: Azure PostgreSQL Flexible Server (deployPostgres=true)
//
// Usage:
//   azd up                  (recommended - uses azure.yaml)
//   az deployment group create \
//     --resource-group <rg> \
//     --template-file infra/main.bicep \
//     --parameters baseName=agentlens-prod \
//                  azureTenantId=<tenant-id> \
//                  azureClientId=<sp-client-id> \
//                  azureAdClientId=<webapp-client-id>

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Base name used for all resource names (e.g. agentlens-prod). Max 20 chars; lowercase letters and hyphens only.')
@maxLength(20)
param baseName string

@description('Entra (AAD) tenant ID for the target tenant')
param azureTenantId string

@description('Service principal (AgentLens-Reader) client ID')
param azureClientId string

@description('Webapp SSO app registration (AgentLens-WebApp) client ID')
param azureAdClientId string

@description('Comma-separated Dataverse org URLs to scan (e.g. https://org.crm.dynamics.com)')
param agentLensOrgUrls string = ''

@description('Supabase project URL (non-secret). Leave empty when using deployPostgres=true.')
param supabaseUrl string = ''

@description('Azure OpenAI endpoint, e.g. https://your-resource.openai.azure.com (non-secret). Powers the Ask AI page.')
param azureOpenAiEndpoint string = ''

@description('Azure OpenAI chat deployment name, e.g. gpt-4o (non-secret).')
param azureOpenAiDeployment string = 'gpt-4o'

@description('Azure OpenAI API version (non-secret).')
param azureOpenAiApiVersion string = '2024-08-01-preview'

@description('Whether to deploy Azure PostgreSQL Flexible Server (true = client tenant; false = use Supabase). See docs/DEPLOY.md D-021.')
param deployPostgres bool = false

@description('PostgreSQL admin password. Required when deployPostgres=true. Store in Key Vault after deployment.')
@secure()
param pgAdminPassword string = ''

// ---------------------------------------------------------------------------
// Deployment order is LINEAR (no cycles):
//   1. kv      - Key Vault (depends on nothing)
//   2. webApp  - Web App + managed identity (depends on kv.keyVaultUri)
//   3. kvRole  - grants the identity access to the vault (depends on kv + webApp)
// ---------------------------------------------------------------------------

module kv 'modules/keyvault.bicep' = {
  name: 'kv-deploy'
  params: {
    location: location
    baseName: baseName
  }
}

module webApp 'modules/webapp.bicep' = {
  name: 'webapp-deploy'
  params: {
    location: location
    baseName: baseName
    keyVaultUri: kv.outputs.keyVaultUri
    azureTenantId: azureTenantId
    azureClientId: azureClientId
    azureAdClientId: azureAdClientId
    agentLensOrgUrls: agentLensOrgUrls
    supabaseUrl: supabaseUrl
    azureOpenAiEndpoint: azureOpenAiEndpoint
    azureOpenAiDeployment: azureOpenAiDeployment
    azureOpenAiApiVersion: azureOpenAiApiVersion
    deployPostgres: deployPostgres
  }
}

// Role assignment AFTER both kv and webApp exist - this is what breaks the cycle.
module kvRole 'modules/kv-role.bicep' = {
  name: 'kv-role-deploy'
  params: {
    keyVaultName: kv.outputs.keyVaultName
    principalId: webApp.outputs.principalId
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres-deploy'
  params: {
    location: location
    baseName: baseName
    deployPostgres: deployPostgres
    pgAdminPassword: pgAdminPassword
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('URL of the deployed AgentLens application')
output appUrl string = 'https://${webApp.outputs.hostName}'

@description('Azure Key Vault URI - set as KEY_VAULT_URI in .env.local for local dev pointing at this vault')
output keyVaultUri string = kv.outputs.keyVaultUri

@description('Key Vault name - use with: az keyvault secret set --vault-name <name> --name <secret> --value <value>')
output keyVaultName string = kv.outputs.keyVaultName

@description('Web app resource name')
output webAppName string = webApp.outputs.webAppName

@description('Webapp system-assigned identity principal ID (for additional role assignments if needed)')
output webAppPrincipalId string = webApp.outputs.principalId

@description('DATABASE_URL hint for Azure PostgreSQL (empty when deployPostgres=false)')
output databaseUrlHint string = postgres.outputs.databaseUrlHint

@description('PostgreSQL server FQDN (empty when deployPostgres=false)')
output pgServerFqdn string = postgres.outputs.pgServerFqdn
