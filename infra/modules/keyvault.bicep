// keyvault.bicep - Azure Key Vault with RBAC authorization.
// The "Key Vault Secrets User" role assignment to the webapp managed identity
// is NOT created here - it lives in main.bicep (module kvRole) so that this
// module does not depend on the webapp module (which depends on this module's
// keyVaultUri output). Keeping the role assignment out of here avoids a
// circular module dependency that Bicep rejects at compile time.

@description('Azure region for all resources')
param location string

@description('Base name used for resource naming')
param baseName string

// ---------------------------------------------------------------------------
// Key Vault
// ---------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${baseName}'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    // RBAC authorization - no legacy access policies
    enableRbacAuthorization: true
    // Purge protection: deleted vault cannot be purged for 90 days
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Key Vault URI - set as KEY_VAULT_URI app setting on the webapp')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Key Vault resource name')
output keyVaultName string = keyVault.name
