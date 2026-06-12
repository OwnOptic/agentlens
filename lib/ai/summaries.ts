/**
 * AgentLens AI Governance Summary Generator
 *
 * Produces structured governance summaries from AgentLens metrics.
 *
 * LLM integration note:
 *   In production this calls Claude (Anthropic) to synthesize the numeric
 *   signals into a human-readable narrative. Tenant data (environment names,
 *   agent names, cost figures) is sensitive - route through Claude only,
 *   never through Ollama or any third-party model.
 *
 *   Stub: the `generateSummary` function derives a deterministic text summary
 *   from the input signals so the UI renders correctly offline.
 */

import type {
  Agent,
  Alert,
  Capacity,
  ComplianceViolation,
  MaturityResult,
  HealthMetric,
  ConversationKpi,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface GovernanceSummaryInput {
  /** All agents in scope */
  agents: Agent[];
  /** Open + ack alerts only */
  alerts: Alert[];
  /** Current capacity rows */
  capacity: Capacity[];
  /** Open compliance violations */
  violations: ComplianceViolation[];
  /** Latest maturity results */
  maturityResults: MaturityResult[];
  /** Last 1-7 days of health metrics */
  healthMetrics: HealthMetric[];
  /** Last 1-7 days of conversation KPIs */
  conversationKpis: ConversationKpi[];
}

export interface GovernanceSummarySection {
  title: string;
  body: string;
  /** 'green' | 'amber' | 'red' for the indicator dot */
  rag: 'green' | 'amber' | 'red';
}

export interface GovernanceSummary {
  /** One-sentence executive headline */
  headline: string;
  /** Per-domain sections */
  sections: GovernanceSummarySection[];
  /** ISO timestamp when this summary was generated */
  generatedAt: string;
  /** True when the summary was produced by the stub (no live LLM call) */
  isMock: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rag(value: number, warnAt: number, critAt: number): 'green' | 'amber' | 'red' {
  if (value >= critAt) return 'red';
  if (value >= warnAt) return 'amber';
  return 'green';
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------------
// Stub summary generator
//
// In production replace this function body with an Anthropic Claude API call:
//
//   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//   const message = await anthropic.messages.create({
//     model: 'claude-opus-4-5',
//     max_tokens: 1024,
//     system: GOVERNANCE_SUMMARY_SYSTEM_PROMPT,
//     messages: [{ role: 'user', content: JSON.stringify(signals) }],
//   });
//   return parseStructuredSummary(message.content);
// ---------------------------------------------------------------------------
function buildStubSummary(input: GovernanceSummaryInput): GovernanceSummary {
  const {
    agents,
    alerts,
    capacity,
    violations,
    maturityResults,
    healthMetrics,
    conversationKpis,
  } = input;

  // --- Agent inventory signals ---
  const totalAgents = agents.length;
  const orphans = agents.filter((a) => a.state === 'Active' && !a.ownerEmail).length;
  const prodAgents = agents.filter((a) => a.lifecycle === 'prod').length;
  const pocAgents = agents.filter((a) => a.lifecycle === 'poc').length;

  // --- Alert signals ---
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && a.state === 'open');
  const warnAlerts = alerts.filter((a) => a.severity === 'warning' && a.state === 'open');

  // --- Capacity signals ---
  const overageEnvs = capacity.filter((c) => c.overage);
  const nearLimitEnvs = capacity.filter((c) => !c.overage && c.pct >= 80);

  // --- Compliance signals ---
  const openCritViolations = violations.filter(
    (v) => v.state === 'open' && v.severity === 'critical'
  );
  const openWarnViolations = violations.filter(
    (v) => v.state === 'open' && v.severity === 'warning'
  );

  // --- Maturity signals ---
  const maturityAvg =
    maturityResults.length > 0
      ? avg(maturityResults.map((r) => r.score))
      : 0;
  const cappedControls = maturityResults.filter((r) => r.capped).length;

  // --- Health signals ---
  const avgErrorRate = avg(healthMetrics.map((h) => h.errorRate));
  const avgLatency = avg(healthMetrics.map((h) => h.avgLatencyMs));

  // --- KPI signals ---
  const avgDeflection = avg(conversationKpis.map((k) => k.deflectionRate));
  const avgEscalation = avg(conversationKpis.map((k) => k.escalationRate));

  // Build headline
  const hasBlockers =
    overageEnvs.length > 0 || criticalAlerts.length > 0 || openCritViolations.length > 0;
  const headline = hasBlockers
    ? `Governance requires immediate attention: ${criticalAlerts.length} critical alert(s), ` +
      `${overageEnvs.length} environment(s) in credit overage, ` +
      `${openCritViolations.length} critical compliance violation(s) open.`
    : `Governance posture is broadly healthy: ${totalAgents} agents tracked, ` +
      `no critical blockers outstanding.`;

  // Build sections
  const sections: GovernanceSummarySection[] = [
    {
      title: 'Agent Inventory',
      body:
        `${totalAgents} agents tracked across all environments. ` +
        `${prodAgents} in production, ${pocAgents} at PoC stage. ` +
        (orphans > 0
          ? `${orphans} active agent(s) have no registered owner - assign ownership before next review.`
          : 'All active agents have a registered owner.'),
      rag: rag(orphans, 1, 3),
    },
    {
      title: 'Alerts',
      body:
        criticalAlerts.length === 0 && warnAlerts.length === 0
          ? 'No open alerts. Governance signals are within normal thresholds.'
          : `${criticalAlerts.length} critical and ${warnAlerts.length} warning alert(s) currently open. ` +
            (criticalAlerts.length > 0
              ? `Critical: ${criticalAlerts.map((a) => a.message).join('; ')}`
              : ''),
      rag: rag(criticalAlerts.length, 1, 2),
    },
    {
      title: 'Credit Capacity',
      body:
        overageEnvs.length > 0
          ? `${overageEnvs.length} environment(s) in credit overage: ` +
            overageEnvs.map((e) => `${e.envId} (${e.pct.toFixed(1)}%)`).join(', ') +
            '. Immediate budget review required.'
          : nearLimitEnvs.length > 0
          ? `${nearLimitEnvs.length} environment(s) above 80% credit utilisation. Monitor closely.`
          : 'All environments are within credit limits.',
      rag: overageEnvs.length > 0 ? 'red' : rag(nearLimitEnvs.length, 1, 2),
    },
    {
      title: 'Compliance',
      body:
        openCritViolations.length === 0 && openWarnViolations.length === 0
          ? 'No open compliance violations.'
          : `${openCritViolations.length} critical and ${openWarnViolations.length} warning violation(s) open. ` +
            'Review the Compliance page for remediation steps.',
      rag: rag(openCritViolations.length, 1, 2),
    },
    {
      title: 'Maturity',
      body:
        `Average maturity score: ${maturityAvg.toFixed(1)} / 4. ` +
        (cappedControls > 0
          ? `${cappedControls} control(s) are telemetry-capped and require manual validation.`
          : 'All auto-evaluable controls are fully validated.'),
      rag: maturityAvg >= 3 ? 'green' : maturityAvg >= 2 ? 'amber' : 'red',
    },
    {
      title: 'Operational Health',
      body:
        healthMetrics.length === 0
          ? 'No health metrics available for this period.'
          : `Average error rate: ${(avgErrorRate * 100).toFixed(1)}%. ` +
            `Average latency: ${avgLatency.toFixed(0)} ms. ` +
            (avgErrorRate > 0.05
              ? 'Error rate is above the 5% threshold - investigate top failing agents.'
              : 'Error rates are within acceptable bounds.'),
      rag: rag(avgErrorRate, 0.03, 0.07),
    },
    {
      title: 'Conversation KPIs',
      body:
        conversationKpis.length === 0
          ? 'No conversation KPI data available for this period.'
          : `Average deflection rate: ${(avgDeflection * 100).toFixed(1)}%. ` +
            `Average escalation rate: ${(avgEscalation * 100).toFixed(1)}%. ` +
            (avgDeflection >= 0.7
              ? 'Deflection is strong - users are self-serving effectively.'
              : 'Deflection rate is below 70%. Consider improving knowledge sources.'),
      rag: avgDeflection >= 0.7 ? 'green' : avgDeflection >= 0.5 ? 'amber' : 'red',
    },
  ];

  return {
    headline,
    sections,
    generatedAt: new Date().toISOString(),
    isMock: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured AI governance summary from the provided signals.
 *
 * Runs the offline stub by default.
 * In production: set ANTHROPIC_API_KEY and replace the stub body with a
 * Claude API call (see comment inside buildStubSummary).
 */
export async function generateSummary(input: GovernanceSummaryInput): Promise<GovernanceSummary> {
  // TODO: when ANTHROPIC_API_KEY is set, call Claude here instead of the stub.
  return buildStubSummary(input);
}
