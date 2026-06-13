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

@description('Supabase project URL (non-secret)')
param supabaseUrl string = ''

@description('Azure OpenAI endpoint (non-secret), e.g. https://your-resource.openai.azure.com')
param azureOpenAiEndpoint string = ''

@description('Azure OpenAI chat deployment name (non-secret)')
param azureOpenAiDeployment string = 'gpt-4o'

@description('Azure OpenAI API version (non-secret)')
param azureOpenAiApiVersion string = '2024-08-01-preview'

@description('When true, also wire DATABASE_URL as a Key Vault reference (secret DATABASE-URL)')
param deployPostgres bool = false

@description('Application Insights connection string. Empty string = App Insights disabled (no setting emitted).')
param appInsightsConnectionString string = ''

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
      // App Service health check: auto-heals hung instances when the endpoint
      // returns non-2xx for 10 minutes. Route: app/api/health/route.ts
      healthCheckPath: '/api/health'
      // Next.js standalone: serve from .next/standalone
      appCommandLine: 'node server.js'
      appSettings: concat([
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
          name: 'SUPABASE_URL'
          value: supabaseUrl
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: azureOpenAiEndpoint
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: azureOpenAiDeployment
        }
        {
          name: 'AZURE_OPENAI_API_VERSION'
          value: azureOpenAiApiVersion
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
        {
          name: 'TEAMS_WEBHOOK_URL'
          value: kvRef(keyVaultUri, 'TEAMS-WEBHOOK-URL')
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
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
      ],
      // APPLICATIONINSIGHTS_CONNECTION_STRING only when App Insights is enabled
      empty(appInsightsConnectionString) ? [] : [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
      ],
      // DATABASE_URL only when deploying Azure PostgreSQL (else Supabase is used)
      deployPostgres ? [
        {
          name: 'DATABASE_URL'
          value: kvRef(keyVaultUri, 'DATABASE-URL')
        }
      ] : [])
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
