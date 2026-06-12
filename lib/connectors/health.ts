import type { HealthMetric } from '@/lib/types';

/**
 * Health connector
 *
 * Wraps Application Insights / Azure Monitor query API.
 * Retrieves operational health metrics (error rate, latency, failed sessions)
 * for all bots that report to the configured App Insights workspace.
 *
 * Data sources:
 * - Azure Monitor / Application Insights Query API
 * - Custom events and telemetry from Copilot Studio agents
 */

export const health = {
  /**
   * Fetch daily operational health metrics (error rate, latency, failed sessions)
   * for all bots that report to the configured App Insights workspace.
   *
   * Queries Application Insights for:
   * - Error rate (percentage of calls that resulted in exceptions / non-2xx)
   * - Average latency (ms per call)
   * - Failed sessions (count of sessions with at least one error)
   *
   * @returns Promise resolving to array of HealthMetric objects
   * @throws Error if App Insights workspace is not configured, authentication fails, or query fails
   *
   * Note: In production, this integrates with the App Insights Query Language (KQL)
   * to aggregate telemetry over daily windows. For now, mock mode returns seed data.
   */
  async getHealth(): Promise<HealthMetric[]> {
    // TODO: Implement Application Insights query
    // Expected endpoint: https://api.applicationinsights.io/v1/apps/{app-id}/query
    // Required headers: Authorization (Bearer token with AppInsights read scope)
    // KQL query: aggregate customEvents and customMetrics by botId, date
    // Extract errorRate (failed / total), avgLatencyMs (avg duration), failedSessions (count distinct sessionId where severity="error")
    // Dates should span the last 30 days or as available from the API
    return [];
  },
};
