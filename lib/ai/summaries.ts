/**
 * AgentLens AI Governance Summary Generator
 *
 * Produces structured governance summaries from AgentLens metrics.
 *
 * LLM integration note:
 *   In production this calls Azure OpenAI to synthesize the numeric
 *   signals into a human-readable narrative. Tenant data (environment names,
 *   agent names, cost figures) is sensitive - route through the configured
 *   Azure OpenAI endpoint only, never through Ollama or any third-party model.
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
import { getAzureConfig, azureChat } from '@/lib/ai/azureOpenAI';

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
// Stub summary generator (offline / no-LLM path)
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
  // NOTE: alert messages are not included here - only counts/severities to avoid
  // accidentally surfacing raw DB strings in stub output.
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
          : `${criticalAlerts.length} critical and ${warnAlerts.length} warning alert(s) currently open.`,
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
// Numeric signals sent to the LLM (no raw message strings or tenant names)
// ---------------------------------------------------------------------------

interface NumericSignals {
  totalAgents: number;
  prodAgents: number;
  pocAgents: number;
  orphanAgents: number;
  criticalAlerts: number;
  warningAlerts: number;
  overageEnvCount: number;
  nearLimitEnvCount: number;
  openCritViolations: number;
  openWarnViolations: number;
  avgMaturityScore: number;
  cappedControls: number;
  avgErrorRatePct: number;
  avgLatencyMs: number;
  avgDeflectionRatePct: number;
  avgEscalationRatePct: number;
}

function buildNumericSignals(input: GovernanceSummaryInput): NumericSignals {
  const { agents, alerts, capacity, violations, maturityResults, healthMetrics, conversationKpis } =
    input;

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && a.state === 'open');
  const warnAlerts = alerts.filter((a) => a.severity === 'warning' && a.state === 'open');
  const overageEnvs = capacity.filter((c) => c.overage);
  const nearLimitEnvs = capacity.filter((c) => !c.overage && c.pct >= 80);
  const openCritViol = violations.filter((v) => v.state === 'open' && v.severity === 'critical');
  const openWarnViol = violations.filter((v) => v.state === 'open' && v.severity === 'warning');
  const maturityAvg = maturityResults.length > 0 ? avg(maturityResults.map((r) => r.score)) : 0;

  return {
    totalAgents: agents.length,
    prodAgents: agents.filter((a) => a.lifecycle === 'prod').length,
    pocAgents: agents.filter((a) => a.lifecycle === 'poc').length,
    orphanAgents: agents.filter((a) => a.state === 'Active' && !a.ownerEmail).length,
    criticalAlerts: criticalAlerts.length,
    warningAlerts: warnAlerts.length,
    overageEnvCount: overageEnvs.length,
    nearLimitEnvCount: nearLimitEnvs.length,
    openCritViolations: openCritViol.length,
    openWarnViolations: openWarnViol.length,
    avgMaturityScore: Math.round(maturityAvg * 10) / 10,
    cappedControls: maturityResults.filter((r) => r.capped).length,
    avgErrorRatePct: Math.round(avg(healthMetrics.map((h) => h.errorRate)) * 1000) / 10,
    avgLatencyMs: Math.round(avg(healthMetrics.map((h) => h.avgLatencyMs))),
    avgDeflectionRatePct:
      Math.round(avg(conversationKpis.map((k) => k.deflectionRate)) * 1000) / 10,
    avgEscalationRatePct:
      Math.round(avg(conversationKpis.map((k) => k.escalationRate)) * 1000) / 10,
  };
}

// ---------------------------------------------------------------------------
// One-time production warning flag (module-level, resets per cold start)
// ---------------------------------------------------------------------------
let _prodStubWarnedSummaries = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured AI governance summary from the provided signals.
 *
 * When AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT
 * are configured, calls Azure OpenAI and returns isMock:false.
 * Otherwise falls back to the deterministic stub (isMock:true).
 *
 * IMPORTANT: only numeric/aggregate counts are sent to the LLM - raw alert
 * message strings and agent names are never included in the prompt.
 */
export async function generateSummary(input: GovernanceSummaryInput): Promise<GovernanceSummary> {
  const cfg = getAzureConfig();

  if (!cfg) {
    // No live provider configured - use stub
    if (process.env.NODE_ENV === 'production' && !_prodStubWarnedSummaries) {
      _prodStubWarnedSummaries = true;
      console.warn(
        '[summaries] Running in production without Azure OpenAI configured - falling back to stub summary. ' +
          'Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT to enable live summaries.',
      );
    }
    return buildStubSummary(input);
  }

  // Live path: send numeric signals only (no raw message strings / tenant names)
  const signals = buildNumericSignals(input);

  const systemPrompt = `You are an AI governance analyst for a Power Platform agent fleet.
You will receive numeric signals about the tenant's governance posture and must return a JSON object
with exactly this shape:
{
  "headline": "<one sentence summary>",
  "sections": [
    { "title": "<section title>", "body": "<2-4 sentence analysis>", "rag": "green"|"amber"|"red" }
  ]
}
Sections must cover: Agent Inventory, Alerts, Credit Capacity, Compliance, Maturity, Operational Health, Conversation KPIs.
Base rag colours strictly on the numeric values. Do not invent data not present in the signals.
Respond with valid JSON only - no markdown fences.`;

  try {
    const raw = await azureChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(signals) },
      ],
      { temperature: 0.2, maxTokens: 1200 },
    );

    const parsed = JSON.parse(raw) as {
      headline: string;
      sections: GovernanceSummarySection[];
    };

    return {
      headline: parsed.headline,
      sections: parsed.sections,
      generatedAt: new Date().toISOString(),
      isMock: false,
    };
  } catch (err) {
    // LLM call failed - log and fall back to stub rather than crashing
    console.error('[summaries] Azure OpenAI call failed, falling back to stub:', err);
    const stub = buildStubSummary(input);
    return stub; // isMock: true from buildStubSummary
  }
}
