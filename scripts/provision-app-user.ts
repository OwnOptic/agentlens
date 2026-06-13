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
 * Extracts --tenant-id, --client-id, --environments, --dry-run from process.argv
 * Validates that all required options are present
 * Returns ProvisionOptions object or exits with help text if malformed
 */
function parseArguments(): ProvisionOptions {
  const args = process.argv.slice(2);
  const opts: Partial<ProvisionOptions> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant-id' && i + 1 < args.length) {
      opts.tenantId = args[++i];
    } else if (args[i] === '--client-id' && i + 1 < args.length) {
      opts.clientId = args[++i];
    } else if (args[i] === '--environments' && i + 1 < args.length) {
      opts.environments = args[++i].split(',').map((e) => e.trim());
    } else if (args[i] === '--dry-run' && i + 1 < args.length) {
      opts.dryRun = args[++i].toLowerCase() === 'true';
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: npx ts-node scripts/provision-app-user.ts [options]

Options:
  --tenant-id <id>           Your Entra tenant ID (required)
  --client-id <id>           App registration client ID (required)
  --environments <list>      Comma-separated env FQDNs (required)
                             e.g., "env1.crm.dynamics.com,env2.crm.dynamics.com"
  --dry-run <true|false>     Preview only (default: true)
  --help                     Show this message

Example:
  npx ts-node scripts/provision-app-user.ts \\
    --tenant-id "12345678-1234-1234-1234-123456789012" \\
    --client-id "87654321-4321-4321-4321-210987654321" \\
    --environments "prod.crm.dynamics.com,dev.crm.dynamics.com" \\
    --dry-run false
      `);
      process.exit(0);
    }
  }

  if (!opts.tenantId || !opts.clientId || !opts.environments || opts.environments.length === 0) {
    console.error('ERROR: Missing required options (--tenant-id, --client-id, --environments)');
    console.error('Run with --help for usage');
    process.exit(1);
  }

  return {
    tenantId: opts.tenantId,
    clientId: opts.clientId,
    environments: opts.environments,
    dryRun: opts.dryRun ?? true,
  };
}

/**
 * Obtain an access token for the service principal using client credentials flow.
 *
 * POST to https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 * Body: grant_type=client_credentials, scope=https://[env-domain]/.default, client_id, client_secret
 * IMPORTANT: client_secret must be retrieved from environment variable (AGENTLENS_CLIENT_SECRET)
 * or secure config, NEVER hardcoded
 */
async function getAccessToken(
  tenantId: string,
  clientId: string,
  envDomain: string
): Promise<string> {
  const clientSecret = process.env.AGENTLENS_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error(
      'AGENTLENS_CLIENT_SECRET environment variable is not set. ' +
        'Set it before running the provision script.'
    );
  }

  const scope = `https://${envDomain}/.default`;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to obtain access token: ${response.status} - ${error}`);
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

/**
 * Fetch the service principal (app registration) object ID from Microsoft Graph.
 *
 * GET https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{clientId}'
 * Returns the servicePrincipal.id (object ID)
 * Throws if not found (indicates the app registration is not yet created)
 */
async function getServicePrincipalObjectId(
  tenantId: string,
  clientId: string
): Promise<string> {
  const graphToken = await getAccessToken(tenantId, clientId, 'graph.microsoft.com');

  const url = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${clientId}'`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${graphToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch service principal: ${response.status} - ${await response.text()}`
    );
  }

  const data: { value: Array<{ id: string }> } = await response.json();

  if (!data.value || data.value.length === 0) {
    throw new Error(
      `Service principal not found for client ID ${clientId}. ` +
        'Ensure the app registration exists and is created in this tenant.'
    );
  }

  return data.value[0].id;
}

/**
 * Check if the service principal is already an application user in the target environment.
 *
 * GET {dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq '{servicePrincipalId}'
 * Returns true if a matching systemuser is found, false otherwise
 * Handles 403 Forbidden gracefully (user lacks permission to query systemusers)
 */
async function isAppUserExists(
  dataverseUrl: string,
  accessToken: string,
  servicePrincipalId: string
): Promise<boolean> {
  const url = `${dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq '${servicePrincipalId}'&$select=userid`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 403) {
    // Permission denied - assume it doesn't exist
    console.warn('  ⚠️  403 Forbidden when checking app user (insufficient permissions)');
    return false;
  }

  if (!response.ok) {
    throw new Error(`Failed to check app user: ${response.status} - ${await response.text()}`);
  }

  const data: { value: unknown[] } = await response.json();
  return data.value && data.value.length > 0;
}

/**
 * Add the service principal as an application user to the environment.
 *
 * POST {dataverseUrl}/api/data/v9.2/systemusers
 * Body: { applicationid: servicePrincipalId, businessunitid: root_business_unit_id }
 * Returns the systemuser object ID (userid) created
 * If already exists, returns the existing userid (idempotency)
 */
async function addAppUser(
  dataverseUrl: string,
  accessToken: string,
  servicePrincipalId: string
): Promise<string> {
  const rootBuId = await getRootBusinessUnitId(dataverseUrl, accessToken);

  const body = JSON.stringify({
    applicationid: servicePrincipalId,
    businessunitid: `@odata.id=businessunits(${rootBuId})`,
  });

  const url = `${dataverseUrl}/api/data/v9.2/systemusers`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
    body,
  });

  if (response.status === 409) {
    // Conflict - already exists; fetch the existing userid
    const existingUser = await fetch(
      `${dataverseUrl}/api/data/v9.2/systemusers?$filter=applicationid eq '${servicePrincipalId}'&$select=userid`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then((r) => r.json() as Promise<{ value: Array<{ userid: string }> }>);

    if (existingUser.value && existingUser.value.length > 0) {
      return existingUser.value[0].userid;
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to add app user: ${response.status} - ${await response.text()}`);
  }

  // Extract userid from location header
  const location = response.headers.get('OData-EntityId');
  if (!location) {
    throw new Error('No OData-EntityId in response (userid not returned)');
  }

  const match = location.match(/systemusers\(([a-f0-9-]+)\)/i);
  if (!match) {
    throw new Error(`Could not parse userid from location: ${location}`);
  }

  return match[1];
}

/**
 * Get the root business unit ID for the environment.
 *
 * GET {dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null
 * Returns the first (root) business unit's businessunitid
 * Throws if no root business unit is found
 */
async function getRootBusinessUnitId(
  dataverseUrl: string,
  accessToken: string
): Promise<string> {
  const url = `${dataverseUrl}/api/data/v9.2/businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch root business unit: ${response.status} - ${await response.text()}`);
  }

  const data: { value: Array<{ businessunitid: string }> } = await response.json();

  if (!data.value || data.value.length === 0) {
    throw new Error('No root business unit found (parentbusinessunitid eq null)');
  }

  return data.value[0].businessunitid;
}

/**
 * Get the least-privilege read-only security role ID.
 *
 * Query {dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'AgentLens Read-Only'
 * If not found, query for 'Organization Application User'
 * Throws if neither exists with guidance to create the role
 */
async function getReadOnlyRoleId(
  dataverseUrl: string,
  accessToken: string
): Promise<string> {
  // Try to find AgentLens Read-Only role first
  let url = `${dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'AgentLens Read-Only'&$select=roleid`;

  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch roles: ${response.status} - ${await response.text()}`);
  }

  let data: { value: Array<{ roleid: string }> } = await response.json();

  if (data.value && data.value.length > 0) {
    return data.value[0].roleid;
  }

  // Fall back to Organization Application User
  url = `${dataverseUrl}/api/data/v9.2/roles?$filter=name eq 'Organization Application User'&$select=roleid`;

  response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch roles: ${response.status} - ${await response.text()}`);
  }

  data = await response.json();

  if (data.value && data.value.length > 0) {
    return data.value[0].roleid;
  }

  throw new Error(
    'Could not find a suitable security role (AgentLens Read-Only or Organization Application User). ' +
      'Create a custom read-only role for this app and try again.'
  );
}

/**
 * Assign a security role to the application user.
 *
 * POST {dataverseUrl}/api/data/v9.2/systemusers({userId})/Microsoft.Dynamics.CRM.AppendRoleAssignments
 * Body: { target: { @odata.id: /roles({roleId}) } }
 * Handles 409 Conflict gracefully (role already assigned - idempotency)
 */
async function assignRoleToAppUser(
  dataverseUrl: string,
  accessToken: string,
  userId: string,
  roleId: string
): Promise<void> {
  const url = `${dataverseUrl}/api/data/v9.2/systemusers(${userId})/Microsoft.Dynamics.CRM.AppendRoleAssignments`;

  const body = JSON.stringify({
    target: { '@odata.id': `${dataverseUrl}/api/data/v9.2/roles(${roleId})` },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
    body,
  });

  if (response.status === 409) {
    // Conflict - role already assigned (idempotent)
    console.log('  ✓ Role already assigned (no action needed)');
    return;
  }

  if (!response.ok) {
    throw new Error(`Failed to assign role: ${response.status} - ${await response.text()}`);
  }
}

/**
 * Convert environment FQDN to Dataverse base URL.
 *
 * Example: "contoso-prod.crm.dynamics.com" => "https://contoso-prod.crm.dynamics.com"
 */
function getDataverseUrl(envFqdn: string): string {
  const normalized = envFqdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${normalized}`;
}

/**
 * Main entrypoint: provision the app user across all environments.
 *
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
  const opts = parseArguments();

  console.log(`\nAgentLens Provision Script`);
  console.log(`Tenant: ${opts.tenantId}`);
  console.log(`Environments: ${opts.environments.join(', ')}`);
  console.log(`Dry-run: ${opts.dryRun}\n`);

  // Get service principal object ID
  console.log('[1/4] Fetching service principal object ID...');
  let spObjectId: string;
  try {
    spObjectId = await getServicePrincipalObjectId(opts.tenantId, opts.clientId);
    console.log(`✓ Service Principal ID: ${spObjectId}\n`);
  } catch (error) {
    console.error(`✗ Failed: ${(error as Error).message}`);
    process.exit(1);
  }

  // Provision each environment
  let succeeded = 0;
  let failed = 0;

  for (const envFqdn of opts.environments) {
    console.log(`[2-4/4] Processing environment: ${envFqdn}`);

    try {
      const dataverseUrl = getDataverseUrl(envFqdn);

      // Get token
      const token = await getAccessToken(opts.tenantId, opts.clientId, envFqdn);
      console.log('  ✓ Authenticated');

      // Check if app user exists
      const exists = await isAppUserExists(dataverseUrl, token, spObjectId);
      if (exists) {
        console.log('  ✓ App user already exists (skipping)');
        succeeded++;
        console.log();
        continue;
      }

      if (opts.dryRun) {
        console.log('  [DRY RUN] Would add app user here');
        console.log('  [DRY RUN] Would assign role here');
        succeeded++;
        console.log();
        continue;
      }

      // Add app user
      const userId = await addAppUser(dataverseUrl, token, spObjectId);
      console.log(`  ✓ App user added: ${userId}`);

      // Get role ID
      const roleId = await getReadOnlyRoleId(dataverseUrl, token);
      console.log(`  ✓ Read-only role found: ${roleId}`);

      // Assign role
      await assignRoleToAppUser(dataverseUrl, token, userId, roleId);
      console.log('  ✓ Role assigned');

      succeeded++;
      console.log();
    } catch (error) {
      console.error(`  ✗ Error: ${(error as Error).message}`);
      failed++;
      console.log();
    }
  }

  // Summary
  console.log(`\nSummary: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: Error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
