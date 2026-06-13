/**
 * appInsights connector
 *
 * Fetches operational health metrics from Azure Monitor / Application Insights
 * using the Log Analytics Query API:
 *   POST https://api.loganalytics.io/v1/workspaces/{workspaceId}/query
 *
 * KQL query targets the customEvents table populated by Copilot Studio's
 * native App Insights integration (enabled per-environment in PPAC).
 *
 * T-205: AbortSignal.timeout on the KQL fetch; KQL capped with `| take 10000`
 *        so the API never streams unbounded rows; truncated flag surfaced when
 *        the row count equals the cap.
 *
 * Required env vars:
 *   APPINSIGHTS_WORKSPACE_ID  - Log Analytics workspace ID (GUID)
 *
 * Falls back to mock seed data when workspace ID is absent.
 */

import type { AppInsightsConnector } from '@/lib/connectors/interfaces';
import type { HealthMetric } from '@/lib/types';
import { getToken } from '@/lib/auth/tokenService';
import { hasCoreCredentials } from '@/lib/connectors/config';
import { mockHealthMetrics } from '@/lib/mock/seed';

const LOG_ANALYTICS_SCOPE = 'https://api.loganalytics.io/.default';
const FETCH_TIMEOUT_MS = 30_000; // KQL queries can be slow
const KQL_ROW_CAP = 10_000;

function hasCredentials(): boolean {
  return Boolean(
    hasCoreCredentials() &&
    process.env.APPINSIGHTS_WORKSPACE_ID,
  );
}

// ---------------------------------------------------------------------------
// Log Analytics query response shapes
// ---------------------------------------------------------------------------
interface QueryColumn {
  name: string;
  type: string;
}

interface QueryTable {
  name: string;
  columns: QueryColumn[];
  rows: (string | number | boolean | null)[][];
}

interface LogAnalyticsResponse {
  tables: QueryTable[];
}

// Result extended with a truncated flag
export interface HealthResult {
  metrics: HealthMetric[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// KQL query - capped at KQL_ROW_CAP to avoid unbounded result sets (T-205)
// ---------------------------------------------------------------------------
const HEALTH_KQL = `
customEvents
| where timestamp > ago(30d)
| where name in ("BotMessageReceived", "BotMessageFailed", "SessionStarted", "SessionFailed")
| extend envId = tostring(customDimensions["EnvironmentId"])
| extend botId = tostring(customDimensions["BotId"])
| extend isFailed = iff(name == "BotMessageFailed" or name == "SessionFailed", 1, 0)
| extend latencyMs = todouble(customDimensions["latencyMs"])
| summarize
    totalEvents  = count(),
    failedEvents = sumif(1, isFailed == 1),
    avgLatency   = avg(latencyMs),
    failedSessions = dcountif(tostring(customDimensions["ConversationId"]), name == "SessionFailed")
  by envId, botId, date = bin(timestamp, 1d)
| project
    envId,
    botId,
    date = format_datetime(date, "yyyy-MM-dd"),
    errorRate     = round(todouble(failedEvents) / iff(totalEvents > 0, todouble(totalEvents), 1.0), 4),
    avgLatencyMs  = round(avgLatency, 0),
    failedSessions
| order by date desc
| take ${KQL_ROW_CAP}
`.trim();

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
async function liveGetHealth(): Promise<HealthResult> {
  const workspaceId = process.env.APPINSIGHTS_WORKSPACE_ID ?? '';
  const token = await getToken(LOG_ANALYTICS_SCOPE);
  if (!token) throw new Error('No token for Log Analytics API');

  const url = `https://api.loganalytics.io/v1/workspaces/${workspaceId}/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: HEALTH_KQL }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`Log Analytics query failed: ${resp.status} ${resp.statusText}`);
  }

  const body = (await resp.json()) as LogAnalyticsResponse;
  const table = body.tables[0];
  if (!table) return { metrics: [], truncated: false };

  const colIndex = Object.fromEntries(
    table.columns.map((c, i) => [c.name, i]),
  );

  const metrics: HealthMetric[] = table.rows.map((row): HealthMetric => ({
    envId:          String(row[colIndex['envId']] ?? ''),
    botId:          String(row[colIndex['botId']] ?? ''),
    date:           String(row[colIndex['date']] ?? ''),
    errorRate:      Number(row[colIndex['errorRate']] ?? 0),
    avgLatencyMs:   Number(row[colIndex['avgLatencyMs']] ?? 0),
    failedSessions: Number(row[colIndex['failedSessions']] ?? 0),
  }));

  // If we got exactly KQL_ROW_CAP rows the result was likely truncated
  const truncated = table.rows.length >= KQL_ROW_CAP;

  return { metrics, truncated };
}

// ---------------------------------------------------------------------------
// Exported connector object
// AppInsightsConnector interface expects getHealth(): Promise<HealthMetric[]>
// We preserve that signature while internally tracking truncation.
// ---------------------------------------------------------------------------
export const appInsights: AppInsightsConnector & {
  getHealthWithMeta(): Promise<HealthResult>;
} = {
  async getHealth(): Promise<HealthMetric[]> {
    if (!hasCredentials()) {
      return mockHealthMetrics;
    }
    const { metrics } = await liveGetHealth();
    return metrics;
  },

  /**
   * Extended variant that also returns the truncated flag.
   * Use this in API routes that need to surface the truncation state to the UI.
   */
  async getHealthWithMeta(): Promise<HealthResult> {
    if (!hasCredentials()) {
      return { metrics: mockHealthMetrics, truncated: false };
    }
    return liveGetHealth();
  },
};
