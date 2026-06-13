// keyvault.bicep - Azure Key Vault with RBAC authorization
// Role assignment: Key Vault Secrets User (built-in GUID 4633458b-17de-408a-b874-0445c86b69e6)
// granted to the webapp's system-assigned managed identity.

@description('Azure region for all resources')
param location string

@description('Base name used for resource naming')
param baseName string

@description('The principalId (object ID) of the webapp system-assigned managed identity')
param webAppPrincipalId string

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
// Role assignment: Key Vault Secrets User -> webapp managed identity
// GUID: 4633458b-17de-408a-b874-0445c86b69e6 (built-in, immutable)
// ---------------------------------------------------------------------------

resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  // Deterministic GUID scoped to this vault + principal
  name: guid(keyVault.id, webAppPrincipalId, '4633458b-17de-408a-b874-0445c86b69e6')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
    principalId: webAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

@description('Key Vault URI - set as KEY_VAULT_URI app setting on the webapp')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Key Vault resource name')
output keyVaultName string = keyVault.name
