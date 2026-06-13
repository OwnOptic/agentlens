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

@description('Whether to deploy Azure PostgreSQL Flexible Server (true = client tenant; false = use Supabase). See docs/DEPLOY.md D-021.')
param deployPostgres bool = false

@description('PostgreSQL admin password. Required when deployPostgres=true. Store in Key Vault after deployment.')
@secure()
param pgAdminPassword string = ''

// ---------------------------------------------------------------------------
// Module: Web App (deployed first to get principalId for KV role assignment)
// NOTE: webapp needs keyVaultUri which comes from the KV module - we solve this
// with a two-pass approach: KV first (no principalId needed), then webapp.
// ---------------------------------------------------------------------------

module kv 'modules/keyvault.bicep' = {
  name: 'kv-deploy'
  params: {
    location: location
    baseName: baseName
    // webAppPrincipalId comes from the webapp module; we wire it after webapp deploys.
    // To break the circular dependency: deploy KV first with a placeholder role,
    // then the webapp module references KV URI, and the role assignment is in the KV module
    // but depends on webapp.outputs.principalId.
    // Bicep handles this correctly via module output chaining.
    webAppPrincipalId: webApp.outputs.principalId
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
  }
  // webapp needs the KV URI but not the role assignment
  dependsOn: [kv]
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
