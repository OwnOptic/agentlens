/**
 * Shared credential checks for connectors.
 *
 * hasCoreCredentials() is the single source of truth for the three
 * service-principal env vars required by every live connector.
 * Per-connector checks build on it rather than duplicating the logic.
 *
 * @server
 */

/**
 * Returns true when the three mandatory Azure AD SP env vars are all set.
 * Does NOT validate the values or the secret (call tokenService for that).
 */
export function hasCoreCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_TENANT_ID,
  );
}
