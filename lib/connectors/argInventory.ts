/**
 * argInventory connector
 *
 * Lists Power Platform environments and Copilot Studio agents using:
 *   - Environments: BAP API  https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2021-04-01
 *   - Agents:       Dataverse Web API  {orgUrl}/api/data/v9.2/bots?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity,msdyn_lifecycle
 *
 * If AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID are absent
 * the connector falls back to mock seed data so the app runs offline.
 */

import type { ArgInventoryConnector } from '@/lib/connectors/interfaces';
import type { Agent, Environment, LifecycleStage } from '@/lib/types';
import { getToken, getDataverseToken } from '@/lib/auth/tokenService';
import { mockAgents, mockEnvironments } from '@/lib/mock/seed';

/** True when the Azure AD credentials are present in the environment */
function hasCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
}

// ---------------------------------------------------------------------------
// BAP API response shape (partial)
// ---------------------------------------------------------------------------
interface BapEnvironment {
  id: string; // /providers/Microsoft.BusinessAppPlatform/environments/{id}
  name: string;
  location: string;
  properties: {
    displayName: string;
    environmentSku: string; // "Default" | "Sandbox" | "Production" | ...
    isDefault?: boolean;
    linkedEnvironmentMetadata?: {
      instanceUrl: string; // org URL
    };
  };
}

interface BapListResponse {
  value: BapEnvironment[];
}

// ---------------------------------------------------------------------------
// Dataverse bot row shape (partial)
// ---------------------------------------------------------------------------
interface DataverseBot {
  botid: string;
  name: string;
  ownerid?: { id?: string; name?: string };
  statecode: number; // 0 = Active, 1 = Inactive
  createdon: string;
  modifiedon: string;
  lastactivity?: string | null;
  msdyn_lifecycle?: string | null; // "poc" | "pilot" | "prod" custom column
}

interface DataverseBotListResponse {
  value: DataverseBot[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapBapEnv(bap: BapEnvironment): Environment {
  const envId = bap.id.split('/').pop() ?? bap.id;
  return {
    id: envId,
    name: bap.properties.displayName,
    type: bap.properties.environmentSku,
    isDefault: bap.properties.isDefault ?? false,
    region: bap.location,
    orgUrl: bap.properties.linkedEnvironmentMetadata?.instanceUrl ?? '',
  };
}

function mapDataverseBot(envId: string, bot: DataverseBot): Agent {
  const lifecycle = (['poc', 'pilot', 'prod'] as LifecycleStage[]).includes(
    (bot.msdyn_lifecycle ?? '') as LifecycleStage,
  )
    ? (bot.msdyn_lifecycle as LifecycleStage)
    : undefined;

  return {
    envId,
    botId: bot.botid,
    name: bot.name,
    ownerName: bot.ownerid?.name ?? null,
    ownerEmail: null, // resolved separately via graph connector
    state: bot.statecode === 0 ? 'Active' : 'Inactive',
    createdOn: bot.createdon,
    modifiedOn: bot.modifiedon,
    lastActivity: bot.lastactivity ?? null,
    kind: 'copilot_studio',
    lifecycle,
  };
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
async function liveListEnvironments(): Promise<Environment[]> {
  // https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2021-04-01
  const token = await getToken(
    'https://service.powerapps.com/.default',
  );
  const resp = await fetch(
    'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2021-04-01&$expand=properties.linkedEnvironmentMetadata',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) {
    throw new Error(
      `BAP listEnvironments failed: ${resp.status} ${resp.statusText}`,
    );
  }
  const body = (await resp.json()) as BapListResponse;
  return body.value.map(mapBapEnv);
}

async function liveListAgentsForEnv(env: Environment): Promise<Agent[]> {
  if (!env.orgUrl) return [];
  // https://{org}.crm.dynamics.com/api/data/v9.2/bots?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity,msdyn_lifecycle
  const token = await getDataverseToken(env.orgUrl);
  const url =
    `${env.orgUrl.replace(/\/$/, '')}/api/data/v9.2/bots` +
    `?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity,msdyn_lifecycle`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Dataverse bots query failed (${env.id}): ${resp.status} ${resp.statusText}`,
    );
  }
  const body = (await resp.json()) as DataverseBotListResponse;
  return body.value.map((b) => mapDataverseBot(env.id, b));
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const argInventory: ArgInventoryConnector = {
  async listEnvironments(): Promise<Environment[]> {
    if (!hasCredentials()) {
      return mockEnvironments;
    }
    return liveListEnvironments();
  },

  async listAgents(): Promise<Agent[]> {
    if (!hasCredentials()) {
      return mockAgents;
    }
    const envs = await liveListEnvironments();
    const results = await Promise.allSettled(
      envs.map((env) => liveListAgentsForEnv(env)),
    );
    const agents: Agent[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        agents.push(...r.value);
      }
      // individual env failures are tolerated; the orchestrator logs errors separately
    }
    return agents;
  },
};
