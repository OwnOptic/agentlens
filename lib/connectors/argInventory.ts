/**
 * argInventory connector
 *
 * Lists Power Platform environments and Copilot Studio agents using:
 *   - Environments: BAP API  https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2021-04-01
 *   - Agents:       Dataverse Web API  {orgUrl}/api/data/v9.2/bots?$select=...
 *
 * T-201: uses fetchODataAll for both the BAP environment list and the per-env
 *        Dataverse bot list (pagination + timeout).
 * T-501: hasCredentials() delegates to hasCoreCredentials().
 *
 * If AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID are absent
 * the connector falls back to mock seed data so the app runs offline.
 */

import type { ArgInventoryConnector } from '@/lib/connectors/interfaces';
import type { Agent, Environment, LifecycleStage } from '@/lib/types';
import { getToken, getDataverseToken } from '@/lib/auth/tokenService';
import { fetchODataAll } from '@/lib/connectors/odata';
import { hasCoreCredentials } from '@/lib/connectors/config';
import { mockAgents, mockEnvironments } from '@/lib/mock/seed';

function hasCredentials(): boolean {
  return hasCoreCredentials();
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
  const token = await getToken('https://service.powerapps.com/.default');
  if (!token) throw new Error('No token for BAP listEnvironments');

  const url =
    'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments' +
    '?api-version=2021-04-01&$expand=properties.linkedEnvironmentMetadata';

  const { rows } = await fetchODataAll<BapEnvironment>(url, token, {
    timeoutMs: 20_000,
    maxRows: 1_000, // generous cap - most tenants have <200 envs
  });

  return rows.map(mapBapEnv);
}

async function liveListAgentsForEnv(env: Environment): Promise<Agent[]> {
  if (!env.orgUrl) return [];

  const token = await getDataverseToken(env.orgUrl);
  if (!token) throw new Error(`No token for Dataverse org: ${env.orgUrl}`);

  const url =
    `${env.orgUrl.replace(/\/$/, '')}/api/data/v9.2/bots` +
    `?$select=botid,name,ownerid,statecode,createdon,modifiedon,lastactivity,msdyn_lifecycle`;

  const { rows } = await fetchODataAll<DataverseBot>(url, token, {
    timeoutMs: 20_000,
    maxRows: 5_000,
    headers: {
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });

  return rows.map((b) => mapDataverseBot(env.id, b));
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
