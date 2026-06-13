// kv-role.bicep - grants "Key Vault Secrets User" to the webapp managed identity.
//
// This is a SEPARATE module (not inside keyvault.bicep) to break the circular
// dependency: keyvault has no dependency on webapp, webapp depends on keyvault's
// URI, and this module depends on BOTH (vault name + webapp principalId). The
// dependency graph is therefore linear: keyvault -> webapp -> kv-role.

@description('Name of the existing Key Vault to scope the role assignment to')
param keyVaultName string

@description('Principal (object) ID of the webapp system-assigned managed identity')
param principalId string

// Built-in role: Key Vault Secrets User (immutable GUID)
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// Reference the already-deployed vault (no new resource created)
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  // Deterministic name so re-deploys are idempotent
  name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
