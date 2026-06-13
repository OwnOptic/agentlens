// postgres.bicep - Azure Database for PostgreSQL Flexible Server (OPTIONAL)
// Only deployed when deployPostgres=true (default: false).
// Provides a data-residency-compliant alternative to Supabase for client tenant deployments.
// See docs/DEPLOY.md decision table (D-021) for when to use this vs Supabase.

@description('Azure region for all resources')
param location string

@description('Base name used for resource naming')
param baseName string

@description('Whether to deploy Azure PostgreSQL (true = client tenant / data residency required; false = use Supabase)')
param deployPostgres bool = false

@description('PostgreSQL admin username')
param pgAdminUser string = 'agentlens_admin'

@description('PostgreSQL admin password - store in Key Vault, pass as secure string')
@secure()
param pgAdminPassword string = ''

@description('Object ID of the Azure AD principal (user, group, or managed identity) to add as Postgres AAD admin. Leave empty to skip AAD admin provisioning. The webapp managed identity principal ID is the recommended value for passwordless access.')
param pgAadAdminObjectId string = ''

@description('Display name for the AAD admin (must match the principal display name in Entra). Required when pgAadAdminObjectId is non-empty.')
param pgAadAdminName string = 'agentlens-webapp'

// ---------------------------------------------------------------------------
// PostgreSQL Flexible Server (conditional)
// ---------------------------------------------------------------------------

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = if (deployPostgres) {
  name: 'pg-${baseName}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      // Azure AD auth enabled so the webapp managed identity can connect passwordlessly.
      // Password auth is kept enabled for the pgAdminUser (break-glass / migrations).
      // To fully disable password auth, set passwordAuth:'Disabled' after AAD admin is confirmed working.
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
    }
  }
}

// AAD administrator for Postgres (conditional: only when pgAadAdminObjectId is supplied).
// Recommended: pass the webapp managed identity principal ID so the app can authenticate
// to Postgres using its system-assigned identity (no password in connection string).
// Add the identity as a Postgres user in the database after provisioning:
//   CREATE ROLE "<webapp-identity-name>" WITH LOGIN;
//   GRANT ALL ON DATABASE agentlens TO "<webapp-identity-name>";
resource pgAadAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2023-06-01-preview' = if (deployPostgres && !empty(pgAadAdminObjectId)) {
  parent: pgServer
  name: pgAadAdminObjectId
  properties: {
    principalType: 'ServicePrincipal'
    principalName: pgAadAdminName
    tenantId: subscription().tenantId
  }
}

// Firewall rule: allow Azure services (includes App Service).
// The 0.0.0.0 -> 0.0.0.0 range is the Azure-reserved sentinel that means
// "allow all Azure-origin traffic" (App Service, Azure Functions, etc.),
// NOT "allow all internet traffic". No public internet IPs are included.
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = if (deployPostgres) {
  parent: pgServer
  name: 'allow-azure-services'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Database
resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = if (deployPostgres) {
  parent: pgServer
  name: 'agentlens'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Whether PostgreSQL was deployed')
output postgresDeployed bool = deployPostgres

@description('DATABASE_URL hint - set this as a Key Vault secret named DATABASE-URL after deployment. Replace <password> with the pgAdminPassword you supplied.')
output databaseUrlHint string = deployPostgres
  ? 'postgresql://${pgAdminUser}:<password>@pg-${baseName}.postgres.database.azure.com:5432/agentlens?sslmode=require'
  : '(not deployed - set deployPostgres=true for Azure PostgreSQL)'

@description('PostgreSQL server FQDN (empty when not deployed)')
// Constructed from the known naming pattern rather than dereferencing the
// conditional pgServer resource (which is null when deployPostgres=false).
output pgServerFqdn string = deployPostgres ? 'pg-${baseName}.postgres.database.azure.com' : ''
