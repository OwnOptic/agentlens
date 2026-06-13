// webapp.bicep - App Service Plan (Linux B1+) + Web App (Node 20 LTS)
// System-assigned managed identity; Key Vault references for secrets;
// plain app settings for non-secret config.

@description('Azure region for all resources')
param location string

@description('Base name used for resource naming')
param baseName string

@description('Azure Key Vault URI - used as KEY_VAULT_URI app setting and for building KV references')
param keyVaultUri string

// Plain config params - not secrets, safe as app settings
@description('Entra tenant ID')
param azureTenantId string

@description('Service principal (AgentLens-Reader) client ID')
param azureClientId string

@description('Webapp SSO app registration client ID (AgentLens-WebApp)')
param azureAdClientId string

@description('Comma-separated Dataverse org URLs to scan')
param agentLensOrgUrls string = ''

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Key Vault secret reference builder
// Returns the @Microsoft.KeyVault(SecretUri=...) reference string.
// The secret URI format: https://<vault>.vault.azure.net/secrets/<name>/
// (no version = always latest)
func kvRef(vaultUri string, secretName string) string =>
  '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/${secretName}/)'

// ---------------------------------------------------------------------------
// App Service Plan - Linux B1
// ---------------------------------------------------------------------------

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'asp-${baseName}'
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true // Required for Linux
  }
}

// ---------------------------------------------------------------------------
// Web App - Node 20 LTS
// ---------------------------------------------------------------------------

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: 'app-${baseName}'
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      nodeVersion: '~20'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      // Next.js standalone: serve from .next/standalone
      appCommandLine: 'node server.js'
      appSettings: [
        // ---- Key Vault URI (plain - needed by the app to construct KV client) ----
        {
          name: 'KEY_VAULT_URI'
          value: keyVaultUri
        }
        // ---- Plain config (non-secret) ----
        {
          name: 'AZURE_TENANT_ID'
          value: azureTenantId
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: azureClientId
        }
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: azureAdClientId
        }
        {
          name: 'AGENTLENS_ORG_URLS'
          value: agentLensOrgUrls
        }
        {
          name: 'NEXTAUTH_URL'
          value: 'https://app-${baseName}.azurewebsites.net'
        }
        // ---- Key Vault references (secrets - never plaintext in app settings) ----
        {
          name: 'AZURE_CLIENT_SECRET'
          value: kvRef(keyVaultUri, 'AZURE-CLIENT-SECRET')
        }
        {
          name: 'AZURE_OPENAI_API_KEY'
          value: kvRef(keyVaultUri, 'AZURE-OPENAI-API-KEY')
        }
        {
          name: 'SUPABASE_SERVICE_KEY'
          value: kvRef(keyVaultUri, 'SUPABASE-SERVICE-KEY')
        }
        {
          name: 'CRON_SECRET'
          value: kvRef(keyVaultUri, 'CRON-SECRET')
        }
        {
          name: 'AUTH_SECRET'
          value: kvRef(keyVaultUri, 'AUTH-SECRET')
        }
        {
          name: 'WEBAPP_CLIENT_SECRET'
          value: kvRef(keyVaultUri, 'WEBAPP-CLIENT-SECRET')
        }
        // ---- Node / Next.js runtime ----
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('The system-assigned managed identity principal ID - used for Key Vault role assignment')
output principalId string = webApp.identity.principalId

@description('The default hostname of the web app')
output hostName string = webApp.properties.defaultHostName

@description('The web app resource name')
output webAppName string = webApp.name
