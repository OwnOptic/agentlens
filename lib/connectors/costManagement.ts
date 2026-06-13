/**
 * Azure Cost Management connector - REAL actual + forecast spend.
 *
 * Calls the Cost Management Query + Forecast APIs with the service-principal ARM
 * token (same client-credentials flow as the other connectors). Requires the SP
 * to hold "Cost Management Reader" (or Reader) on the target scope - the
 * subscription by default (AZURE_SUBSCRIPTION_ID), or AZURE_COST_SCOPE to override
 * (e.g. a billing account or management group).
 *
 * HONESTY-FIRST: returns { connected: false, reason } when the SP/role/scope is
 * absent (incl. 403) so the UI never shows fabricated spend. This is REAL Azure
 * billing - it includes Power Platform / Copilot Studio PAYG meters when those
 * are billed through the subscription.
 */

import { getArmToken } from '@/lib/auth/tokenService';

export interface ServiceCost {
  service: string;
  cost: number;
}

export interface AzureCostSummary {
  connected: boolean;
  reason?: string;
  currency?: string;
  mtdTotal?: number;
  forecastTotal?: number;
  byService?: ServiceCost[];
  scope?: string;
  fetchedAt: string;
}

const ARM = 'https://management.azure.com';

/** Resolve the Cost Management scope (no leading slash). */
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

export async function getAzureCostSummary(): Promise<AzureCostSummary> {
  const fetchedAt = new Date().toISOString();

  const scope = costScope();
  if (!scope) {
    return {
      connected: false,
      reason: 'Set AZURE_SUBSCRIPTION_ID (or AZURE_COST_SCOPE) to read Azure Cost Management.',
      fetchedAt,
    };
  }

  const token = await getArmToken();
  if (!token) {
    return {
      connected: false,
      reason: 'No service-principal token - configure AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID.',
      scope,
      fetchedAt,
    };
  }

  try {
    const queryUrl = `${ARM}/${scope}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;
    const res = await fetch(queryUrl, {
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
      cache: 'no-store',
    });

    if (res.status === 403) {
      return {
        connected: false,
        reason: 'Access denied (403) - the service principal needs the "Cost Management Reader" role on this scope.',
        scope,
        fetchedAt,
      };
    }
    if (!res.ok) {
      return { connected: false, reason: `Cost Management returned ${res.status}`, scope, fetchedAt };
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
    const mtdTotal = byService.reduce((s, x) => s + x.cost, 0);

    // Forecast is best-effort - never fail the whole call on it.
    let forecastTotal: number | undefined;
    try {
      const fcUrl = `${ARM}/${scope}/providers/Microsoft.CostManagement/forecast?api-version=2023-11-01`;
      const fc = await fetch(fcUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ActualCost',
          timeframe: 'MonthToDate',
          dataset: { granularity: 'None', aggregation: { totalCost: { name: 'Cost', function: 'Sum' } } },
          includeActualCost: true,
          includeFreshPartialCost: false,
        }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
      if (fc.ok) {
        const fj = (await fc.json()) as { properties?: { columns?: { name: string }[]; rows?: unknown[][] } };
        const fcols = fj.properties?.columns ?? [];
        const frows = fj.properties?.rows ?? [];
        const fci = colIndex(fcols, ['Cost', 'PreTaxCost', 'CostUSD']);
        if (fci >= 0) forecastTotal = frows.reduce((s, r) => s + Number(r[fci] ?? 0), 0);
      }
    } catch {
      /* forecast optional */
    }

    return { connected: true, currency, mtdTotal, forecastTotal, byService, scope, fetchedAt };
  } catch (e) {
    return {
      connected: false,
      reason: e instanceof Error ? e.message : 'Cost Management query failed',
      scope,
      fetchedAt,
    };
  }
}
