// AgentLens - infrastructure entry point.
//
// Deploys the MCP server that backs the declarative agent:
//   Container Registry  (holds the image)
//   Log Analytics       (container logs)
//   Container Apps env  + Container App, scale-to-zero
//
// Scale-to-zero matters here: a governance agent is asked a question a few
// times a week, not continuously, so the app idles at zero replicas and costs
// nothing between questions.
//
// Usage:
//   azd up
// or:
//   az deployment sub create --location <region> --template-file infra/main.bicep \
//     --parameters environmentName=agentlens location=<region>

targetScope = 'subscription'

@minLength(1)
@maxLength(30)
@description('Name of the environment. Used to name the resource group and resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Entra tenant ID the reader service principal belongs to.')
param azureTenantId string = ''

@description('AgentLens-Reader application (client) ID.')
param azureClientId string = ''

@description('AgentLens-Reader client secret. Stored as a Container App secret.')
@secure()
param azureClientSecret string = ''

@description('Subscription ID to read Azure Cost Management for. Defaults to this one.')
param azureSubscriptionId string = subscription().subscriptionId

@description('Comma-separated Dataverse org URLs to read aggregate usage from.')
param dataverseOrgUrls string = ''

@description('Tenant ID used to validate INBOUND Copilot tokens. Leave empty to run unauthenticated (local/dev only).')
param mcpTenantId string = ''

@description('Expected audience of INBOUND Copilot tokens, e.g. api://<agentlens-mcp-app-id>. Leave empty to run unauthenticated (local/dev only).')
param mcpAudience string = ''

var tags = { 'azd-env-name': environmentName }
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    azureTenantId: azureTenantId
    azureClientId: azureClientId
    azureClientSecret: azureClientSecret
    azureSubscriptionId: azureSubscriptionId
    dataverseOrgUrls: dataverseOrgUrls
    mcpTenantId: mcpTenantId
    mcpAudience: mcpAudience
  }
}

// azd reads these outputs.
output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.registryName

@description('Paste this into AGENTLENS_MCP_URL when packaging the agent.')
output AGENTLENS_MCP_URL string = resources.outputs.mcpUrl

@description('Health endpoint - confirms whether inbound auth is on.')
output AGENTLENS_HEALTH_URL string = resources.outputs.healthUrl
