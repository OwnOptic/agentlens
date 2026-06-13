/**
 * kpis connector
 *
 * Fetches aggregate conversation KPIs (sessions, deflection rate, escalation rate)
 * from Copilot Studio native analytics via the Dataverse Web API using $apply aggregation.
 *
 * NOTE: aggregate only - no message content, no user identifiers are retrieved.
 *
 * Dataverse query per environment:
 *   GET {orgUrl}/api/data/v9.2/msdyn_conversationkpis
 *     ?$apply=groupby((msdyn_botid,msdyn_date),
 *              aggregate(msdyn_sessioncount with sum as sessions,
 *                        msdyn_deflectionsessioncount with sum as deflected,
 *                        msdyn_escalationsessioncount with sum as escalated))
 *     &$filter=msdyn_date gt 'YYYY-MM-DD'
 *
 * Falls back to mock seed data when credentials are absent.
 */

import type { KpisConnector } from '@/lib/connectors/interfaces';
import type { ConversationKpi } from '@/lib/types';
import { getDataverseToken } from '@/lib/auth/tokenService';
import { mockConversationKpis, mockEnvironments } from '@/lib/mock/seed';

function hasCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_TENANT_ID,
  );
}

// ---------------------------------------------------------------------------
// Dataverse $apply response shape
// ---------------------------------------------------------------------------
interface KpiAggregateRow {
  msdyn_botid: string;
  msdyn_date: string; // ISO date string
  sessions: number;
  deflected: number;
  escalated: number;
  // Env is injected by the caller since it is not in the Dataverse record
  _envId?: string;
}

interface ODataApplyResponse {
  value: KpiAggregateRow[];
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
async function liveGetAggregatesForEnv(
  envId: string,
  orgUrl: string,
): Promise<ConversationKpi[]> {
  const token = await getDataverseToken(orgUrl);
  if (!token) throw new Error(`No token available for Dataverse org: ${orgUrl}`);

  // Look back 30 days
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 30);
  const filterDate = lookback.toISOString().split('T')[0];

  // Dataverse $apply aggregation query
  // GET {orgUrl}/api/data/v9.2/msdyn_conversationkpis?$apply=...&$filter=...
  const applyParam = encodeURIComponent(
    `groupby((msdyn_botid,msdyn_date),` +
      `aggregate(msdyn_sessioncount with sum as sessions,` +
      `msdyn_deflectionsessioncount with sum as deflected,` +
      `msdyn_escalationsessioncount with sum as escalated))`,
  );
  const filterParam = encodeURIComponent(`msdyn_date gt '${filterDate}'`);
  const url =
    `${orgUrl.replace(/\/$/, '')}/api/data/v9.2/msdyn_conversationkpis` +
    `?$apply=${applyParam}&$filter=${filterParam}`;

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
      `Dataverse msdyn_conversationkpis failed (${envId}): ${resp.status} ${resp.statusText}`,
    );
  }

  const body = (await resp.json()) as ODataApplyResponse;

  return body.value.map((row): ConversationKpi => {
    const sessions = row.sessions ?? 0;
    const deflected = row.deflected ?? 0;
    const escalated = row.escalated ?? 0;
    return {
      envId,
      botId: row.msdyn_botid,
      date: row.msdyn_date.split('T')[0], // normalize to YYYY-MM-DD
      sessions,
      deflectionRate:
        sessions > 0 ? parseFloat((deflected / sessions).toFixed(4)) : 0,
      escalationRate:
        sessions > 0 ? parseFloat((escalated / sessions).toFixed(4)) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const kpis: KpisConnector = {
  async getAggregates(): Promise<ConversationKpi[]> {
    if (!hasCredentials()) {
      return mockConversationKpis;
    }

    // Fan out across all environments listed in the mock registry as a seed
    // In live mode we use the same environment list returned by the argInventory connector.
    // To avoid a circular dependency we re-use the mock env list as the set of org URLs
    // unless AGENTLENS_ORG_URLS is explicitly configured.
    const orgUrlsEnv = process.env.AGENTLENS_ORG_URLS;
    const envPairs: Array<{ envId: string; orgUrl: string }> = orgUrlsEnv
      ? orgUrlsEnv.split(',').map((s, i) => ({
          envId: `env-${i}`,
          orgUrl: s.trim(),
        }))
      : mockEnvironments
          .filter((e) => e.orgUrl)
          .map((e) => ({ envId: e.id, orgUrl: e.orgUrl }));

    const results = await Promise.allSettled(
      envPairs.map(({ envId, orgUrl }) =>
        liveGetAggregatesForEnv(envId, orgUrl),
      ),
    );

    const all: ConversationKpi[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        all.push(...r.value);
      }
    }
    return all;
  },
};
