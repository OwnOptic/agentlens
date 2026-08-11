/**
 * Per-agent message consumption and environment capacity, from the Power
 * Platform licensing APIs. This is the data behind the Copilot Studio pages in
 * the Power Platform admin center.
 *
 *   Consumption: https://licensing.powerplatform.microsoft.com/api/usage/v1
 *                  /billingPolicies/{policyId}/copilotMessages
 *   Capacity:    https://api.powerplatform.com/licensing/v1/billingPolicies
 *
 * WHAT THIS RETURNS: messages and billed sessions per agent per day, split by
 * feature. Real, attributable, in the unit Microsoft actually meters. It does
 * NOT return money - see src/domain/rates.ts for how a currency figure is
 * derived and how its provenance is carried.
 *
 * TWO CAVEATS THAT MUST REACH THE ADMINISTRATOR, NOT JUST THIS COMMENT:
 *
 * 1. The consumption endpoint is UNDOCUMENTED. It backs the admin center UI.
 *    Microsoft's documented Power Platform API covers CONFIGURING billing
 *    policies, not reading consumption. It can change without notice, so a
 *    shape mismatch is reported as a shape mismatch rather than as zero usage.
 *
 * 2. It is scoped to a PAY-AS-YOU-GO billing policy. Environments on prepaid
 *    capacity packs are not in a billing policy and will not appear here at
 *    all. That is partial coverage, and the caller must say so - those agents
 *    are unmeasured, not free.
 */

import { getToken } from '../lib/tokens.js';
import { fetchODataAll } from './odata.js';

const LICENSING_SCOPE = 'https://licensing.powerplatform.microsoft.com/.default';
const PPAPI_SCOPE = 'https://api.powerplatform.com/.default';

/** One agent's consumption on one day, exactly as the meter counts it. */
export interface AgentConsumptionDaily {
  envId: string;
  botId: string;
  date: string;
  messageCount: number;
  /** Billed sessions, when the API reports them. */
  sessionCount: number;
  /** 'premium' selects the premium meter. Null when the API did not say. */
  modelMeter: string | null;
  featureBreakdown?: FeatureBreakdown;
}

/** Messages split across the four Copilot Studio consumption meters. */
export interface FeatureBreakdown {
  generativeAnswers: number;
  agentActions: number;
  agentFlows: number;
  textTools: number;
}

/** Prepaid capacity for one environment, and whether it is over. */
export interface Capacity {
  envId: string;
  creditLimit: number;
  creditUsed: number;
  pct: number;
  overage: boolean;
}

export type ConsumptionResult =
  | {
      state: 'connected';
      rows: AgentConsumptionDaily[];
      policyId: string;
      windowDays: number;
      /** True when the response carried no feature split for any row. */
      featureBreakdownAvailable: boolean;
    }
  | { state: 'not_connected'; reason: string };

export type CapacityResult =
  | { state: 'connected'; capacities: Capacity[] }
  | { state: 'not_connected'; reason: string };

interface CopilotMessageRow {
  botId: string;
  environmentId: string;
  date: string;
  messageCount: number;
  sessionCount?: number;
  modelMeter?: string | null;
  generativeAnswers?: number;
  agentActions?: number;
  agentFlows?: number;
  textTools?: number;
}

interface BillingPolicy {
  policyId: string;
  environmentId: string;
  creditLimit: number;
  creditUsed: number;
}

/**
 * Per-agent consumption over the last `days` days.
 *
 * Requires PPAC_BILLING_POLICY_ID. Without it there is nothing to query - the
 * endpoint is addressed by billing policy, not by tenant.
 */
export async function getAgentConsumption(days = 30): Promise<ConsumptionResult> {
  const policyId = process.env.PPAC_BILLING_POLICY_ID?.trim();
  if (!policyId) {
    return {
      state: 'not_connected',
      reason:
        'PPAC_BILLING_POLICY_ID is not set, so per-agent consumption cannot be read. Find it in the Power Platform admin center under Billing policies, or leave it unset if this tenant uses prepaid capacity packs rather than pay-as-you-go - in which case per-agent consumption is not exposed by any API.',
    };
  }

  const token = await getToken(LICENSING_SCOPE);
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Could not acquire a Power Platform licensing token. Check AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, and that the service principal can read the billing policy.',
    };
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  const url =
    `https://licensing.powerplatform.microsoft.com/api/usage/v1/billingPolicies/${policyId}` +
    `/copilotMessages?startDate=${startDate}&endDate=${endDate}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 403) {
      return {
        state: 'not_connected',
        reason: `Access denied (HTTP 403) reading billing policy ${policyId}. The service principal needs Power Platform Administrator, and the policy must exist in this tenant.`,
      };
    }
    if (res.status === 404) {
      return {
        state: 'not_connected',
        reason: `Billing policy ${policyId} was not found (HTTP 404). Check PPAC_BILLING_POLICY_ID against the Power Platform admin center.`,
      };
    }
    if (!res.ok) {
      return {
        state: 'not_connected',
        reason: `The Power Platform licensing API returned HTTP ${res.status}. This endpoint is undocumented and backs the admin center UI, so it can change without notice.`,
      };
    }

    const body = (await res.json()) as { value?: CopilotMessageRow[] };

    // An undocumented endpoint can change shape. A missing `value` array is a
    // contract change, not an empty tenant, and must not be read as zero usage.
    if (!Array.isArray(body.value)) {
      return {
        state: 'not_connected',
        reason:
          'The licensing API responded, but without the expected `value` array. This endpoint is undocumented and may have changed shape. No consumption figures can be reported from this response.',
      };
    }

    let featureBreakdownAvailable = false;

    const rows: AgentConsumptionDaily[] = body.value.map((row) => {
      const hasBreakdown = row.generativeAnswers != null;
      if (hasBreakdown) featureBreakdownAvailable = true;

      return {
        envId: row.environmentId,
        botId: row.botId,
        date: row.date,
        messageCount: row.messageCount ?? 0,
        sessionCount: row.sessionCount ?? 0,
        modelMeter: row.modelMeter ?? null,
        ...(hasBreakdown
          ? {
              featureBreakdown: {
                generativeAnswers: row.generativeAnswers ?? 0,
                agentActions: row.agentActions ?? 0,
                agentFlows: row.agentFlows ?? 0,
                textTools: row.textTools ?? 0,
              },
            }
          : {}),
      };
    });

    return { state: 'connected', rows, policyId, windowDays: days, featureBreakdownAvailable };
  } catch (e) {
    return {
      state: 'not_connected',
      reason: `Network error calling the Power Platform licensing API: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}

/** Prepaid credit capacity and overage per environment. */
export async function getCapacity(): Promise<CapacityResult> {
  const token = await getToken(PPAPI_SCOPE);
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Could not acquire a Power Platform API token. Check the service principal credentials and that it holds Power Platform Administrator.',
    };
  }

  try {
    const { rows } = await fetchODataAll<BillingPolicy>(
      'https://api.powerplatform.com/licensing/v1/billingPolicies',
      token,
      { maxRows: 1_000 },
    );

    const capacities: Capacity[] = rows.map((p) => ({
      envId: p.environmentId,
      creditLimit: p.creditLimit,
      creditUsed: p.creditUsed,
      pct: p.creditLimit > 0 ? Number(((p.creditUsed / p.creditLimit) * 100).toFixed(1)) : 0,
      overage: p.creditUsed >= p.creditLimit,
    }));

    return { state: 'connected', capacities };
  } catch (e) {
    return {
      state: 'not_connected',
      reason: `Could not read billing policies: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
