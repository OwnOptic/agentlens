/**
 * kpis connector
 *
 * Fetches aggregate conversation KPIs (sessions, deflection rate, escalation rate)
 * from Copilot Studio native analytics via the Dataverse Web API using $apply aggregation.
 *
 * NOTE: aggregate only - no message content, no user identifiers are retrieved.
 *
 * T-201: uses fetchODataAll for pagination + timeout.
 * T-501: hasCredentials() now includes AZURE_CLIENT_SECRET via hasCoreCredentials().
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
import { fetchODataAll } from '@/lib/connectors/odata';
import { hasCoreCredentials } from '@/lib/connectors/config';
import { mockConversationKpis, mockEnvironments } from '@/lib/mock/seed';

// T-501: fix - the original omitted AZURE_CLIENT_SECRET from the check
function hasCredentials(): boolean {
  return hasCoreCredentials();
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
  _envId?: string;
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

  const { rows } = await fetchODataAll<KpiAggregateRow>(url, token, {
    timeoutMs: 20_000,
    // KPI aggregates are small - keep a generous cap
    maxRows: 5_000,
  });

  return rows.map((row): ConversationKpi => {
    const sessions = row.sessions ?? 0;
    const deflected = row.deflected ?? 0;
    const escalated = row.escalated ?? 0;
    return {
      envId,
      botId: row.msdyn_botid,
      date: row.msdyn_date.split('T')[0],
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
