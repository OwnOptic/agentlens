/**
 * provision-app-user.ts
 *
 * Provision script: adds the AgentLens service principal as a read-only
 * application user to each Power Platform environment.
 *
 * Usage:
 *   npx ts-node scripts/provision-app-user.ts \
 *     --tenant-id <tenant-id> \
 *     --client-id <client-id> \
 *     --environments "env1.crm.dynamics.com,env2.crm.dynamics.com" \
 *     --dry-run false
 *
 * Idempotent: running twice is safe (checks for existing app-user before adding).
 */

import type { Environment } from '@/lib/types';

interface ProvisionOptions {
  tenantId: string;
  clientId: string;
  environments: string[];
  dryRun: boolean;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface DataverseApplicationUser {
  applicationid: string;
  userid: string;
  systemuseername: string;
}

/**
 * Parse command-line arguments into ProvisionOptions.
 *
 * TODO: implement argument parsing
 * - Extract --tenant-id, --client-id, --environments, --dry-run from process.argv
 * - Validate that all required options are present
 * - Return ProvisionOptions object
 * - Log help text and exit if arguments are malformed
 */
function parseArguments(): ProvisionOptions {
  // TODO: implement
  throw new Error('parseArguments not implemented');
}

/**
 * Obtain an access token for the service principal using client credentials flow.
 *
 * TODO: implement OAuth 2.0 client credentials grant
 * - POST to https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 * - Body: grant_type=client_credentials, scope=https://[env-domain]/.default, client_id, client_secret
 * - IMPORTANT: client_secret must be retrieved from environment variable (AGENTLENS_CLIENT_SECRET)
 *   or secure config, NEVER hardcoded
 * - Return the access_token from response, or throw if authentication fails
 */
async function getAccessToken(
  tenantId: string,
  clientId: string,
  envDomain: string
): Promise<string> {
  // TODO: implement
  const token: TokenResponse = {
    access_token: '',
    expires_in: 3600,
    token_type: 'Bearer',
  };
  return token.access_token;
}

/**
 * Fetch the service principal (app registration) object ID from Microsoft Graph.
 *
 * TODO: implement
 * - GET https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{clientId}'
 * - Use the access token from getAccessToken (with scope https://graph.microsoft.com)
 * - Parse response and return the servicePrincipal.id (object ID)
 * - Throw if not found (indicates the app registration is not yet created)
 */
async function getServicePrincipalObjectId(
  tenantId: string,
  clientId: string
): Promise<string> {
  // TODO: implement
  throw new Error('getServicePrincipalObjectId not implemented');
}

/**
 * Check if the service principal is already an application user in the target environment.
 *
 * TODO: implement
 * - GET {dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq '{servicePrincipalId}'
 * - Use the access token for the environment
 * - Return true if a matching systemuser is found, false otherwise
 * - Handle 403 Forbidden gracefully (user lacks permission to query systemusers)
 */
async function isAppUserExists(
  dataverseUrl: string,
  accessToken: string,
  servicePrincipalId: string
): Promise<boolean> {
  // TODO: implement
  return false;
}

/**
 * Add the service principal as an application user to the environment.
 *
 * TODO: implement
 * - POST {dataverseUrl}/api/data/v9.2/systemusers
 * - Body: { applicationid: servicePrincipalId, businessunitid: root_business_unit_id }
 * - Use the access token for the environment
 * - Return the systemuser object ID (userid) created
 * - If already exists, return the existing userid (idempotency)
 * - Throw if creation fails with a non-409 error
 */
async function addAppUser(
  dataverseUrl: string,
  accessToken: string,
  servicePrincipalId: string
): Promise<string> {
  // TODO: implement
  throw new Error('addAppUser not implemented');
}

/**
 * Get the root business unit ID for the environment.
 *
 * TODO: implement
 * - GET {dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null
 * - Use the access token for the environment
 * - Return the first (root) business unit's businessunitid
 * - Throw if no root business unit is found
 */
async function getRootBusinessUnitId(
  dataverseUrl: string,
  accessToken: string
): Promise<string> {
  // TODO: implement
  throw new Error('getRootBusinessUnitId not implemented');
}

/**
 * Get the least-privilege read-only security role ID.
 *
 * TODO: implement
 * - Query {dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'AgentLens Read-Only'
 * - If not found, query for 'Organization Application User' and verify it has read-only privileges
 * - If neither exists, throw with guidance to create the role
 * - Return the roleid
 */
async function getReadOnlyRoleId(
  dataverseUrl: string,
  accessToken: string
): Promise<string> {
  // TODO: implement
  throw new Error('getReadOnlyRoleId not implemented');
}

/**
 * Assign a security role to the application user.
 *
 * TODO: implement
 * - POST {dataverseUrl}/api/data/v9.2/systemusers({userId})/Microsoft.Dynamics.CRM.AppendRoleAssignments
 * - Body: { target: { @odata.id: /roles({roleId}) } }
 * - Use the access token for the environment
 * - Handle 409 Conflict gracefully (role already assigned - idempotency)
 * - Throw on other errors
 */
async function assignRoleToAppUser(
  dataverseUrl: string,
  accessToken: string,
  userId: string,
  roleId: string
): Promise<void> {
  // TODO: implement
}

/**
 * Convert environment FQDN to Dataverse base URL.
 *
 * Example: "contoso-prod.crm.dynamics.com" => "https://contoso-prod.crm.dynamics.com"
 *
 * TODO: implement
 */
function getDataverseUrl(envFqdn: string): string {
  // TODO: implement
  throw new Error('getDataverseUrl not implemented');
}

/**
 * Main entrypoint: provision the app user across all environments.
 *
 * TODO: implement orchestration
 * 1. Parse command-line arguments
 * 2. Get the service principal object ID from Microsoft Graph
 * 3. For each environment:
 *    a. Obtain access token for the environment
 *    b. Check if app user already exists (idempotency)
 *    c. If not, add the app user to the root business unit
 *    d. Get the read-only role ID
 *    e. Assign the role to the app user
 * 4. Log success/failure for each environment
 * 5. Exit with code 0 on success, 1 on critical error
 */
async function main(): Promise<void> {
  // TODO: implement
  console.error('main not implemented');
  process.exit(1);
}

main().catch((error: Error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
