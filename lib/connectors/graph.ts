/**
 * Microsoft Graph connector
 *
 * Resolves agent owner identities (name, email) from Microsoft Entra ID
 * using the Microsoft Graph API.
 */

export interface OwnerIdentity {
  name: string;
  email: string;
}

export const graph = {
  /**
   * Resolve agent owner names and emails from Entra ID object IDs.
   *
   * Queries the Microsoft Graph API to fetch user profiles for a batch of object IDs,
   * returning a Map keyed by object ID with name and email as values.
   * Used to populate Agent.ownerName and Agent.ownerEmail after hydration.
   *
   * @param ids - Array of Entra ID object IDs to resolve
   * @returns Promise resolving to Map<objectId, {name, email}>
   * @throws Error if authentication fails, API is unavailable, or any ID is invalid
   *
   * Note: If an ID cannot be resolved (user deleted, permission denied), it is
   * omitted from the result map. Callers should handle missing entries gracefully.
   */
  async resolveOwners(ids: string[]): Promise<Map<string, OwnerIdentity>> {
    // TODO: Implement Microsoft Graph batch request to resolve users
    // Expected endpoint: https://graph.microsoft.com/v1.0/directoryObjects/getByIds
    // Request body: { ids: [...], types: ["user"] }
    // Required headers: Authorization (Bearer token), Content-Type: application/json
    // Parse response to extract id, displayName, userPrincipalName (email)
    // Return as Map<id, {name, email}>
    return new Map();
  },
};
