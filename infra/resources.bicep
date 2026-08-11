// Everything inside the resource group.

param location string
param tags object
param resourceToken string

param azureTenantId string
param azureClientId string
@secure()
param azureClientSecret string
param azureSubscriptionId string
param dataverseOrgUrls string
param ppacBillingPolicyId string
param copilotRateStandard string
param copilotRatePremium string
param copilotRateCurrency string
param mcpTenantId string
param mcpAudience string

// Placeholder until the first `azd deploy` / `az containerapp update` pushes the
// real image. The app is created before an image exists, so it needs something
// that starts.
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'cr${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// A user-assigned identity so the Container App can pull from the registry
// without admin credentials.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourceToken}'
  location: location
  tags: tags
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-agentlens-${resourceToken}'
  location: location
  // azd matches this tag to the service in azure.yaml.
  tags: union(tags, { 'azd-service-name': 'mcp' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: empty(azureClientSecret)
        ? []
        : [
            {
              name: 'azure-client-secret'
              value: azureClientSecret
            }
          ]
    }
    template: {
      containers: [
        {
          name: 'mcp'
          image: placeholderImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(
            [
              { name: 'MCP_TRANSPORT', value: 'http' }
              { name: 'PORT', value: '3000' }
              { name: 'MCP_TENANT_ID', value: mcpTenantId }
              { name: 'MCP_AUDIENCE', value: mcpAudience }
              { name: 'AZURE_TENANT_ID', value: azureTenantId }
              { name: 'AZURE_CLIENT_ID', value: azureClientId }
              { name: 'AZURE_SUBSCRIPTION_ID', value: azureSubscriptionId }
              { name: 'DATAVERSE_ORG_URLS', value: dataverseOrgUrls }
              { name: 'PPAC_BILLING_POLICY_ID', value: ppacBillingPolicyId }
              { name: 'COPILOT_RATE_STANDARD', value: copilotRateStandard }
              { name: 'COPILOT_RATE_PREMIUM', value: copilotRatePremium }
              { name: 'COPILOT_RATE_CURRENCY', value: copilotRateCurrency }
            ],
            empty(azureClientSecret)
              ? []
              : [ { name: 'AZURE_CLIENT_SECRET', secretRef: 'azure-client-secret' } ]
          )
        }
      ]
      scale: {
        // Zero replicas when idle: a governance agent is queried occasionally.
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
  dependsOn: [ acrPull ]
}

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output containerAppName string = app.name
output mcpUrl string = 'https://${app.properties.configuration.ingress.fqdn}/mcp'
output healthUrl string = 'https://${app.properties.configuration.ingress.fqdn}/health'
