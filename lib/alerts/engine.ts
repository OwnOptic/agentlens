import { Alert, AlertType, AgentMetricDaily } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Evaluates agent metrics against baselines and governance rules,
 * returning a list of raised alerts.
 *
 * @param metrics - Daily aggregated metrics for agents (cost, usage, message count)
 * @param baselines - Baseline thresholds keyed by rule name (e.g., "budget_limit")
 * @returns Array of Alert objects raised by triggered rules
 */
export function evaluateAlerts(
  metrics: AgentMetricDaily[],
  baselines: Record<string, number>
): Alert[] {
  const alerts: Alert[] = [];

  for (const metric of metrics) {
    // Rule: budget_breach
    // Trigger when estimatedCost exceeds the "budget_limit" baseline
    evaluateBudgetBreach(metric, baselines, alerts);

    // Rule: volume_spike
    // Trigger when messageCount > 3x the 7-day rolling baseline
    evaluateVolumeSpikeRule(metric, baselines, alerts);

    // Rule: new_default_env_agent
    // Trigger when an agent is detected in the default environment (governance anti-pattern)
    evaluateNewDefaultEnvAgent(metric, baselines, alerts);

    // Rule: model_meter_mismatch
    // Trigger when modelMeter is null or differs from expected for the agent
    evaluateModelMeterMismatch(metric, baselines, alerts);

    // Rule: orphan_idle
    // Trigger when an agent has zero activity for 7+ days (orphaned)
    evaluateOrphanIdle(metric, baselines, alerts);
  }

  return alerts;
}

/**
 * Evaluates budget_breach rule.
 * Trigger: estimatedCost exceeds the "budget_limit" baseline.
 *
 * @param metric - Daily metric for the agent
 * @param baselines - Baseline record
 * @param alerts - Accumulator for raised alerts
 */
function evaluateBudgetBreach(
  metric: AgentMetricDaily,
  baselines: Record<string, number>,
  alerts: Alert[]
): void {
  // TODO: Implement budget_breach rule
  // Check if metric.estimatedCost > baselines["budget_limit"]
  // If triggered, create an alert with severity "critical" and push to alerts array
}

/**
 * Evaluates volume_spike rule.
 * Trigger: messageCount > 3x the 7-day rolling baseline.
 *
 * @param metric - Daily metric for the agent
 * @param baselines - Baseline record (should contain "volume_7day_avg")
 * @param alerts - Accumulator for raised alerts
 */
function evaluateVolumeSpikeRule(
  metric: AgentMetricDaily,
  baselines: Record<string, number>,
  alerts: Alert[]
): void {
  // TODO: Implement volume_spike rule
  // Calculate 3x the "volume_7day_avg" baseline
  // If metric.messageCount > (baselines["volume_7day_avg"] * 3), trigger alert
  // Severity: "warning"
}

/**
 * Evaluates new_default_env_agent rule.
 * Trigger: Agent is detected in the default environment (governance anti-pattern).
 *
 * @param metric - Daily metric for the agent
 * @param baselines - Baseline record (not used for this rule)
 * @param alerts - Accumulator for raised alerts
 */
function evaluateNewDefaultEnvAgent(
  metric: AgentMetricDaily,
  baselines: Record<string, number>,
  alerts: Alert[]
): void {
  // TODO: Implement new_default_env_agent rule
  // Query environment store or metadata to check if envId is marked as default
  // If default environment detected, trigger alert with severity "warning"
  // This is a governance anti-pattern flagging rule
}

/**
 * Evaluates model_meter_mismatch rule.
 * Trigger: modelMeter is null or differs from expected meter for the agent.
 *
 * @param metric - Daily metric for the agent
 * @param baselines - Baseline record (may contain expected "model_meter" value)
 * @param alerts - Accumulator for raised alerts
 */
function evaluateModelMeterMismatch(
  metric: AgentMetricDaily,
  baselines: Record<string, number>,
  alerts: Alert[]
): void {
  // TODO: Implement model_meter_mismatch rule
  // Check if metric.modelMeter is null or undefined
  // Or check if metric.modelMeter differs from baselines["expected_model_meter"]
  // If mismatch detected, trigger alert with severity "info" or "warning"
}

/**
 * Evaluates orphan_idle rule.
 * Trigger: Agent has zero or minimal activity for 7+ consecutive days (orphaned).
 *
 * @param metric - Daily metric for the agent
 * @param baselines - Baseline record (may contain "idle_days_threshold")
 * @param alerts - Accumulator for raised alerts
 */
function evaluateOrphanIdle(
  metric: AgentMetricDaily,
  baselines: Record<string, number>,
  alerts: Alert[]
): void {
  // TODO: Implement orphan_idle rule
  // Check if metric.messageCount and metric.sessionCount are both 0 or near-zero
  // Query metric history (requires integration with metric store) for 7+ day window
  // If idle period >= baselines["idle_days_threshold"] (default 7), trigger alert
  // Severity: "info"
}

/**
 * Helper: Creates a new alert object with generated ID and current timestamp.
 *
 * @param type - Alert type
 * @param severity - Alert severity level
 * @param envId - Environment ID
 * @param botId - Bot ID (or null for environment-wide alerts)
 * @param message - Human-readable alert message
 * @returns Alert object
 */
export function createAlert(
  type: AlertType,
  severity: 'info' | 'warning' | 'critical',
  envId: string,
  botId: string | null,
  message: string
): Alert {
  return {
    id: uuidv4(),
    type,
    severity,
    envId,
    botId,
    message,
    state: 'open',
    createdAt: new Date().toISOString(),
  };
}
