/**
 * Aggregate conversation KPIs from Copilot Studio analytics in Dataverse.
 *
 *   GET {orgUrl}/api/data/v9.2/msdyn_conversationkpis
 *       ?$apply=groupby((msdyn_botid,msdyn_date),aggregate(...))
 *
 * PRIVACY - THE HARD RULE
 * This connector reads a pre-aggregated analytics table: session counts,
 * deflection counts, escalation counts. It never touches conversationtranscript,
 * never reads message content, and never returns an end user's identity. If a
 * feature ever seems to need raw transcript text, the feature is wrong.
 *
 * Requires the service principal to be an Application User with a read role in
 * each environment listed in DATAVERSE_ORG_URLS.
 */

import { getDataverseToken } from '../lib/tokens.js';
import { fetchODataAll } from './odata.js';
import type { ConversationKpi } from '../domain/types.js';

interface KpiAggregateRow {
  msdyn_botid: string;
  msdyn_date: string;
  sessions: number;
  deflected: number;
  escalated: number;
}

export interface KpiResult {
  kpis: ConversationKpi[];
  /** Org URLs that were read successfully. */
  reached: string[];
  /** Org URLs that could not be read, with the reason. Never counted as zero. */
  failed: { orgUrl: string; reason: string }[];
}

async function fetchForOrg(orgUrl: string, days: number): Promise<ConversationKpi[]> {
  const token = await getDataverseToken(orgUrl);
  if (!token) {
    throw new Error(
      'No Dataverse token. The service principal needs an Application User with a read role in this environment.',
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().split('T')[0];

  const apply = encodeURIComponent(
    'groupby((msdyn_botid,msdyn_date),' +
      'aggregate(msdyn_sessioncount with sum as sessions,' +
      'msdyn_deflectionsessioncount with sum as deflected,' +
      'msdyn_escalationsessioncount with sum as escalated))',
  );
  const filter = encodeURIComponent(`msdyn_date gt '${sinceDate}'`);

  const url =
    `${orgUrl.replace(/\/$/, '')}/api/data/v9.2/msdyn_conversationkpis` +
    `?$apply=${apply}&$filter=${filter}`;

  const { rows } = await fetchODataAll<KpiAggregateRow>(url, token);

  return rows.map((row): ConversationKpi => {
    const sessions = row.sessions ?? 0;
    return {
      envId: orgUrl,
      botId: row.msdyn_botid,
      date: (row.msdyn_date ?? '').split('T')[0] ?? '',
      sessions,
      deflectionRate: sessions > 0 ? Number(((row.deflected ?? 0) / sessions).toFixed(4)) : 0,
      escalationRate: sessions > 0 ? Number(((row.escalated ?? 0) / sessions).toFixed(4)) : 0,
    };
  });
}

/**
 * Read aggregate KPIs across every configured environment.
 * Per-environment failures are reported, not swallowed.
 */
export async function getConversationKpis(orgUrls: string[], days = 30): Promise<KpiResult> {
  const settled = await Promise.allSettled(orgUrls.map((u) => fetchForOrg(u, days)));

  const result: KpiResult = { kpis: [], reached: [], failed: [] };

  settled.forEach((outcome, i) => {
    const orgUrl = orgUrls[i]!;
    if (outcome.status === 'fulfilled') {
      result.kpis.push(...outcome.value);
      result.reached.push(orgUrl);
    } else {
      result.failed.push({
        orgUrl,
        reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  return result;
}
