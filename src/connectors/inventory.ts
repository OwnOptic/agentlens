/**
 * Power Platform environments and their Copilot Studio agents.
 *
 *   Environments: BAP admin API
 *     https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments
 *   Agents:       Dataverse Web API, per environment
 *     {orgUrl}/api/data/v9.2/bots
 *
 * The environment list is what makes DLP coverage answerable: you cannot say an
 * environment is uncovered without first knowing it exists.
 *
 * There is no offline or sample mode. Missing credentials produce a
 * not-connected result, never a plausible-looking placeholder tenant.
 */

import { getToken, getDataverseToken, POWERAPPS_SCOPE } from '../lib/tokens.js';
import { fetchODataAll } from './odata.js';
import type { Agent, Environment } from '../domain/types.js';

interface BapEnvironment {
  id: string;
  name: string;
  location: string;
  properties: {
    displayName: string;
    environmentSku: string;
    isDefault?: boolean;
    linkedEnvironmentMetadata?: { instanceUrl: string };
  };
}

interface DataverseBot {
  botid: string;
  name: string;
  ownerid?: { id?: string; name?: string };
  statecode: number;
  createdon: string;
  modifiedon: string;
  lastactivity?: string | null;
}

export type EnvironmentsResult =
  | { state: 'connected'; environments: Environment[] }
  | { state: 'not_connected'; reason: string };

export interface AgentsInEnvironment {
  envId: string;
  envName: string;
  /** Present only when the environment was read successfully. */
  agents?: Agent[];
  /** Present only when it was not. The caller must not treat this as zero. */
  error?: string;
}

function mapEnvironment(bap: BapEnvironment): Environment {
  return {
    id: bap.id.split('/').pop() ?? bap.id,
    name: bap.properties.displayName,
    type: bap.properties.environmentSku,
    isDefault: bap.properties.isDefault ?? false,
    region: bap.location,
    orgUrl: bap.properties.linkedEnvironmentMetadata?.instanceUrl ?? '',
  };
}

function mapBot(env: Environment, bot: DataverseBot): Agent {
  return {
    id: bot.botid,
    name: bot.name,
    platform: 'copilot_studio',
    owner: bot.ownerid?.name ?? null,
    location: env.name,
    envId: env.id,
    source: 'Dataverse',
    state: bot.statecode === 0 ? 'Active' : 'Inactive',
    createdOn: bot.createdon,
    modifiedOn: bot.modifiedon,
    lastActivity: bot.lastactivity ?? null,
  };
}

/** List every Power Platform environment the service principal can see. */
export async function listEnvironments(): Promise<EnvironmentsResult> {
  const token = await getToken(POWERAPPS_SCOPE);
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Could not acquire a Power Platform token. Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, and register the service principal as a Power Platform admin management application (New-PowerAppManagementApp).',
    };
  }

  const url =
    'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments' +
    '?api-version=2021-04-01&$expand=properties.linkedEnvironmentMetadata';

  try {
    const { rows } = await fetchODataAll<BapEnvironment>(url, token, { maxRows: 1_000 });
    return { state: 'connected', environments: rows.map(mapEnvironment) };
  } catch (e) {
    return {
      state: 'not_connected',
      reason: `Power Platform admin API unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * List the Copilot Studio agents in one environment.
 * Requires the service principal to be an Application User in that environment.
 */
export async function listAgentsInEnvironment(env: Environment): Promise<AgentsInEnvironment> {
  if (!env.orgUrl) {
    return {
      envId: env.id,
      envName: env.name,
      error: 'Environment has no Dataverse database, so it holds no Copilot Studio agents.',
    };
  }

  const token = await getDataverseToken(env.orgUrl);
  if (!token) {
    return {
      envId: env.id,
      envName: env.name,
      error: `No Dataverse token for ${env.orgUrl}. The service principal needs an Application User with a read role in this environment.`,
    };
  }

  const url =
    `${env.orgUrl.replace(/\/$/, '')}/api/data/v9.2/bots` +
    '?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity';

  try {
    const { rows } = await fetchODataAll<DataverseBot>(url, token);
    return { envId: env.id, envName: env.name, agents: rows.map((b) => mapBot(env, b)) };
  } catch (e) {
    return {
      envId: env.id,
      envName: env.name,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
