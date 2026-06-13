/**
 * cost connector
 *
 * Retrieves daily agent credit consumption and environment capacity from:
 *   - Metrics: Power Platform Licensing API (single-page response, no nextLink)
 *   - Capacity: PPAC admin API billingPolicies (paginated via fetchODataAll)
 *
 * T-201: uses fetchODataAll for billingPolicies list; adds AbortSignal.timeout
 *        on the metrics fetch.
 * T-501: hasCredentials() delegates to hasCoreCredentials() + PPAC_BILLING_POLICY_ID.
 *
 * Falls back to mock seed data when PPAC_BILLING_POLICY_ID is not configured.
 */

import type { CostConnector } from '@/lib/connectors/interfaces';
import type { AgentMetricDaily, Capacity, CreditBreakdown } from '@/lib/types';
import { getToken } from '@/lib/auth/tokenService';
import { fetchODataAll } from '@/lib/connectors/odata';
import { hasCoreCredentials } from '@/lib/connectors/config';
import { mockMetrics, mockCapacity } from '@/lib/mock/seed';

function hasCredentials(): boolean {
  return Boolean(hasCoreCredentials() && process.env.PPAC_BILLING_POLICY_ID);
}

// ---------------------------------------------------------------------------
// PPAC API response shapes (partial)
// ---------------------------------------------------------------------------
interface CopilotMessageRow {
  botId: string;
  environmentId: string;
  date: string; // "YYYY-MM-DD"
  messageCount: number;
  sessionCount?: number;
  modelMeter?: string | null;
  generativeAnswers?: number;
  agentActions?: number;
  agentFlows?: number;
  textTools?: number;
}

interface CopilotMessagesResponse {
  value: CopilotMessageRow[];
}

interface BillingPolicy {
  policyId: string;
  environmentId: string;
  creditLimit: number;
  creditUsed: number;
}

// ---------------------------------------------------------------------------
// Cost estimation helper (partner estimation model, not official billing)
// Standard meter: $0.01 per message; Premium meter: ~$0.025 per message
// ---------------------------------------------------------------------------
function estimateCost(messageCount: number, modelMeter: string | null): number {
  const ratePerMsg = modelMeter === 'premium' ? 0.025 : 0.01;
  return parseFloat((messageCount * ratePerMsg).toFixed(2));
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
async function liveGetDailyMetrics(orgUrl: string): Promise<AgentMetricDaily[]> {
  const policyId = process.env.PPAC_BILLING_POLICY_ID ?? '';
  const token = await getToken('https://licensing.powerplatform.microsoft.com/.default');
  if (!token) throw new Error('No token for PPAC licensing API');

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  const url =
    `https://licensing.powerplatform.microsoft.com/api/usage/v1/billingPolicies/${policyId}/copilotMessages` +
    `?startDate=${startDate}&endDate=${endDate}`;

  // Metrics endpoint returns a single-page response (no nextLink); add timeout explicitly
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    throw new Error(`PPAC copilotMessages failed: ${resp.status} ${resp.statusText}`);
  }
  const body = (await resp.json()) as CopilotMessagesResponse;

  const envIdSegment = orgUrl.replace(/\/$/, '').split('.')[0].split('//')[1] ?? '';
  const totalDaysInMonth = daysInCurrentMonth();

  return body.value
    .filter((row) =>
      !envIdSegment || row.environmentId.toLowerCase().includes(envIdSegment.toLowerCase()),
    )
    .map((row): AgentMetricDaily => {
      const modelMeter = row.modelMeter ?? null;
      const estimatedCost = estimateCost(row.messageCount, modelMeter);
      const featureBreakdown: CreditBreakdown | undefined =
        row.generativeAnswers != null
          ? {
              generativeAnswers: row.generativeAnswers ?? 0,
              agentActions: row.agentActions ?? 0,
              agentFlows: row.agentFlows ?? 0,
              textTools: row.textTools ?? 0,
            }
          : undefined;

      return {
        envId: row.environmentId,
        botId: row.botId,
        date: row.date,
        messageCount: row.messageCount,
        sessionCount: row.sessionCount ?? 0,
        estimatedCost,
        modelMeter,
        featureBreakdown,
        projectedMonthly: parseFloat((estimatedCost * totalDaysInMonth).toFixed(2)),
      };
    });
}

async function liveGetCapacity(): Promise<Capacity[]> {
  const token = await getToken('https://api.powerplatform.com/.default');
  if (!token) throw new Error('No token for PPAC API');

  // T-201: billingPolicies may paginate in large tenants
  const { rows } = await fetchODataAll<BillingPolicy>(
    'https://api.powerplatform.com/licensing/v1/billingPolicies',
    token,
    { timeoutMs: 20_000, maxRows: 1_000 },
  );

  return rows.map((p): Capacity => {
    const pct = p.creditLimit > 0
      ? parseFloat(((p.creditUsed / p.creditLimit) * 100).toFixed(1))
      : 0;
    return {
      envId: p.environmentId,
      creditLimit: p.creditLimit,
      creditUsed: p.creditUsed,
      pct,
      overage: p.creditUsed >= p.creditLimit,
    };
  });
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const cost: CostConnector = {
  async getDailyMetrics(orgUrl: string): Promise<AgentMetricDaily[]> {
    if (!hasCredentials()) {
      return mockMetrics;
    }
    return liveGetDailyMetrics(orgUrl);
  },

  async getCapacity(): Promise<Capacity[]> {
    if (!hasCredentials()) {
      return mockCapacity;
    }
    return liveGetCapacity();
  },
};
