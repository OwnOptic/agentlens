import type { Agent } from '@/lib/types';

/**
 * Dataverse connector
 *
 * Interfaces with the Dataverse bot table to query Copilot Studio agent metadata.
 * Dataverse table: [OrganizationUrl]/api/data/v9.2/bots
 */

export const dataverse = {
  /**
   * Retrieve all Copilot Studio agents from a Dataverse environment.
   *
   * Queries the bot table via the Dataverse Web API to extract agent metadata:
   * botid, name, ownerid (bot owner), statecode, createdon, modifiedon, and lastactivity.
   *
   * @param orgUrl - The organization URL of the environment (e.g., https://myorg.crm.dynamics.com)
   * @returns Promise resolving to array of Agent objects
   * @throws Error if orgUrl is invalid, authentication fails, or API is unavailable
   *
   * Note: Agent Kind is hardcoded to 'copilot_studio' per v1 scope.
   * Owner name/email resolution is handled separately by the graph connector.
   */
  async getAgents(orgUrl: string): Promise<Agent[]> {
    // TODO: Implement Dataverse Web API call to bots table
    // Expected endpoint: {orgUrl}/api/data/v9.2/bots?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity
    // Required headers: Authorization (Bearer token), OData-MaxVersion, OData-Version
    // Parse response.value array to map Dataverse bot rows to Agent objects
    // statecode: 0=active, 1=inactive → map to Agent.state (string)
    // dates: parse to ISO 8601 strings
    // ownerName and ownerEmail will be populated by graph.resolveOwners() after hydration
    return [];
  },
};
