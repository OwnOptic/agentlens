/**
 * Azure Cost Management - REAL billed spend, plus Microsoft's own forecast.
 *
 * Scope defaults to the subscription (AZURE_SUBSCRIPTION_ID); AZURE_COST_SCOPE
 * overrides it with a billing account or management group path. The service
 * principal needs Cost Management Reader (or Reader) on that scope.
 *
 * This reports what Azure billed. It includes Power Platform and Copilot Studio
 * pay-as-you-go meters when those are billed through the subscription, and it
 * does not include what is covered by prepaid capacity. There is deliberately no
 * per-message cost estimator here: an estimate is not a bill, and an
 * administrator making a retire-or-keep decision must not be shown one as if it
 * were.
 */

import { getArmToken } from '../lib/tokens.js';

const ARM = 'https://management.azure.com';

export interface ServiceCost {
  service: string;
  cost: number;
}

export type CostResult =
  | {
      state: 'connected';
      currency: string;
      monthToDate: number;
      /** Microsoft's month-end forecast. Absent when the forecast API declined. */
      forecastMonthEnd?: number;
      byService: ServiceCost[];
      scope: string;
      fetchedAt: string;
    }
  | { state: 'not_connected'; reason: string; scope?: string; fetchedAt: string };

function costScope(): string | null {
  const explicit = process.env.AZURE_COST_SCOPE;
  if (explicit) return explicit.replace(/^\//, '');
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  return sub ? `subscriptions/${sub}` : null;
}

function colIndex(columns: { name: string }[], names: string[]): number {
  for (const n of names) {
    const i = columns.findIndex((c) => c.name === n);
    if (i >= 0) return i;
  }
  return -1;
}

export async function getAzureCostSummary(): Promise<CostResult> {
  const fetchedAt = new Date().toISOString();

  const scope = costScope();
  if (!scope) {
    return {
      state: 'not_connected',
      reason: 'Set AZURE_SUBSCRIPTION_ID (or AZURE_COST_SCOPE) to read Azure Cost Management.',
      fetchedAt,
    };
  }

  const token = await getArmToken();
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Could not acquire a token. Check AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET.',
      scope,
      fetchedAt,
    };
  }

  try {
    const res = await fetch(
      `${ARM}/${scope}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ActualCost',
          timeframe: 'MonthToDate',
          dataset: {
            granularity: 'None',
            aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
            grouping: [{ type: 'Dimension', name: 'ServiceName' }],
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (res.status === 403) {
      return {
        state: 'not_connected',
        reason:
          'Access denied (HTTP 403). The service principal needs the "Cost Management Reader" role on this scope.',
        scope,
        fetchedAt,
      };
    }
    if (!res.ok) {
      return {
        state: 'not_connected',
        reason: `Cost Management returned HTTP ${res.status}.`,
        scope,
        fetchedAt,
      };
    }

    const json = (await res.json()) as {
      properties?: { columns?: { name: string }[]; rows?: unknown[][] };
    };
    const columns = json.properties?.columns ?? [];
    const rows = json.properties?.rows ?? [];

    const costIdx = colIndex(columns, ['Cost', 'PreTaxCost', 'CostUSD']);
    const svcIdx = colIndex(columns, ['ServiceName']);
    const curIdx = colIndex(columns, ['Currency']);

    const byService: ServiceCost[] = rows
      .map((r) => ({
        service: svcIdx >= 0 ? String(r[svcIdx] ?? 'Unknown') : 'Unknown',
        cost: costIdx >= 0 ? Number(r[costIdx] ?? 0) : 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    const currency = curIdx >= 0 && rows[0] ? String(rows[0][curIdx]) : 'USD';
    const monthToDate = byService.reduce((sum, x) => sum + x.cost, 0);

    // The forecast is best-effort. Its absence is reported as absence, never
    // as a locally computed run-rate dressed up as Microsoft's forecast.
    let forecastMonthEnd: number | undefined;
    try {
      const fc = await fetch(
        `${ARM}/${scope}/providers/Microsoft.CostManagement/forecast?api-version=2023-11-01`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ActualCost',
            timeframe: 'MonthToDate',
            dataset: {
              granularity: 'None',
              aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
            },
            includeActualCost: true,
            includeFreshPartialCost: false,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (fc.ok) {
        const fj = (await fc.json()) as {
          properties?: { columns?: { name: string }[]; rows?: unknown[][] };
        };
        const fi = colIndex(fj.properties?.columns ?? [], ['Cost', 'PreTaxCost', 'CostUSD']);
        if (fi >= 0) {
          forecastMonthEnd = (fj.properties?.rows ?? []).reduce(
            (sum, r) => sum + Number(r[fi] ?? 0),
            0,
          );
        }
      }
    } catch {
      /* forecast is optional */
    }

    return {
      state: 'connected',
      currency,
      monthToDate,
      forecastMonthEnd,
      byService,
      scope,
      fetchedAt,
    };
  } catch (e) {
    return {
      state: 'not_connected',
      reason: e instanceof Error ? e.message : 'Cost Management query failed.',
      scope,
      fetchedAt,
    };
  }
}
