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
 * Required env vars:
 *   APPINSIGHTS_WORKSPACE_ID  - Log Analytics workspace ID (GUID)
 *
 * Falls back to mock seed data when workspace ID is absent.
 */

import type { AppInsightsConnector } from '@/lib/connectors/interfaces';
import type { HealthMetric } from '@/lib/types';
import { getToken } from '@/lib/auth/tokenService';
import { mockHealthMetrics } from '@/lib/mock/seed';

const LOG_ANALYTICS_SCOPE = 'https://api.loganalytics.io/.default';

function hasCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID &&
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

// ---------------------------------------------------------------------------
// KQL query
// ---------------------------------------------------------------------------
// Copilot Studio pushes bot telemetry under customEvents and traces.
// This query aggregates error rate, latency, and failed-session count per bot per day.
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
`.trim();

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
async function liveGetHealth(): Promise<HealthMetric[]> {
  const workspaceId = process.env.APPINSIGHTS_WORKSPACE_ID ?? '';
  const token = await getToken(LOG_ANALYTICS_SCOPE);

  // POST https://api.loganalytics.io/v1/workspaces/{workspaceId}/query
  const url = `https://api.loganalytics.io/v1/workspaces/${workspaceId}/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: HEALTH_KQL }),
  });

  if (!resp.ok) {
    throw new Error(
      `Log Analytics query failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const body = (await resp.json()) as LogAnalyticsResponse;
  const table = body.tables[0];
  if (!table) return [];

  // Map column names to indices for safe extraction
  const colIndex = Object.fromEntries(
    table.columns.map((c, i) => [c.name, i]),
  );

  return table.rows.map((row): HealthMetric => ({
    envId:         String(row[colIndex['envId']] ?? ''),
    botId:         String(row[colIndex['botId']] ?? ''),
    date:          String(row[colIndex['date']] ?? ''),
    errorRate:     Number(row[colIndex['errorRate']] ?? 0),
    avgLatencyMs:  Number(row[colIndex['avgLatencyMs']] ?? 0),
    failedSessions: Number(row[colIndex['failedSessions']] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const appInsights: AppInsightsConnector = {
  async getHealth(): Promise<HealthMetric[]> {
    if (!hasCredentials()) {
      return mockHealthMetrics;
    }
    return liveGetHealth();
  },
};
