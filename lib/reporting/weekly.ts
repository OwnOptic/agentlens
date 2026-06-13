/**
 * AgentLens Reporting - Weekly Governance Report Builder
 *
 * Produces a structured WeeklyReport object that can be serialised to:
 *   - Markdown (for Teams/email plain-text channels)
 *   - HTML (for email HTML body / PDF generation)
 *
 * The output is deterministic given the same input - no side effects.
 * It is designed to be called from a cron job or the /api/report route.
 */

import type {
  Agent,
  Environment,
  AgentMetricDaily,
  Alert,
  Capacity,
  ComplianceViolation,
  MaturityResult,
  ConversationKpi,
  HealthMetric,
  GateDecision,
} from '@/lib/types';
import { computeExecPosture, type ExecPostureInput } from './exec';
import { assertNotProduction } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface WeeklyReportSection {
  title: string;
  body: string; // markdown
}

export interface WeeklyReport {
  /** ISO date range covered, e.g. "2026-06-06 to 2026-06-12" */
  period: string;
  /** Generated timestamp */
  generatedAt: string;
  /** Short subject line suitable for email / Teams notification */
  subject: string;
  /** Full sections in order */
  sections: WeeklyReportSection[];
  /** Pre-rendered markdown string (all sections joined) */
  markdown: string;
  /** Pre-rendered HTML string (all sections joined, styled inline) */
  html: string;
  /** True when the report was built from mock seed data */
  isMock: boolean;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface WeeklyReportInput extends ExecPostureInput {
  gateDecisions: GateDecision[];
  /** Override the "period" label (defaults to last 7 days) */
  periodLabel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoToDisplay(iso: string): string {
  return iso.slice(0, 10);
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/**
 * Escape HTML special characters to prevent stored-XSS when DB strings
 * are injected into the HTML report template.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSummarySection(input: WeeklyReportInput, period: string): WeeklyReportSection {
  const posture = computeExecPosture(input);
  const openCritical = input.alerts.filter(
    (a) => a.state === 'open' && a.severity === 'critical',
  ).length;
  const openViol = input.violations.filter((v) => v.state === 'open').length;
  const overageEnvs = input.capacity.filter((c) => c.overage).length;

  const lines = [
    `**Period:** ${period}`,
    `**Generated:** ${isoToDisplay(posture.generatedAt)}`,
    '',
    `| KPI | Value |`,
    `| --- | --- |`,
    `| Total agents | **${input.agents.length}** (${input.agents.filter((a) => a.state === 'Active').length} active) |`,
    `| Compliance score | **${posture.kpiCards.find((k) => k.id === 'compliance-score')?.value ?? '-'}** |`,
    `| Open alerts | **${input.alerts.filter((a) => a.state === 'open').length}** (${openCritical} critical) |`,
    `| Open violations | **${openViol}** |`,
    `| Capacity overage | **${overageEnvs}** env(s) |`,
    `| Maturity score | **${posture.maturityScore.toFixed(1)} / 4.0** |`,
    `| Avg deflection rate | **${posture.kpiCards.find((k) => k.id === 'deflection-rate')?.value ?? '-'}** |`,
  ];

  return { title: 'Executive Summary', body: lines.join('\n') };
}

function buildAgentInventorySection(agents: Agent[], environments: Environment[]): WeeklyReportSection {
  const envMap = new Map(environments.map((e) => [e.id, e.name]));
  const byLifecycle = (stage: string) => agents.filter((a) => a.lifecycle === stage).length;

  const rows = [
    ['Production', String(byLifecycle('prod'))],
    ['Pilot', String(byLifecycle('pilot'))],
    ['PoC', String(byLifecycle('poc'))],
    ['Untagged', String(agents.filter((a) => !a.lifecycle).length)],
    ['Orphan (no owner)', String(agents.filter((a) => a.ownerEmail === null && a.state === 'Active').length)],
  ];

  const envRows = environments.map((e) => {
    const count = agents.filter((a) => a.envId === e.id).length;
    return [envMap.get(e.id) ?? e.id, e.type, String(count)];
  });

  const body = [
    '### Lifecycle breakdown',
    mdTable(['Stage', 'Count'], rows),
    '',
    '### By environment',
    mdTable(['Environment', 'Type', 'Agents'], envRows),
  ].join('\n');

  return { title: 'Agent Inventory', body };
}

function buildCostSection(
  metrics: AgentMetricDaily[],
  capacity: Capacity[],
  environments: Environment[],
): WeeklyReportSection {
  const envMap = new Map(environments.map((e) => [e.id, e.name]));

  // Latest day total + projected monthly
  const dates = [...new Set(metrics.map((m) => m.date))].sort();
  const latestDate = dates.at(-1) ?? '';
  const latestMetrics = metrics.filter((m) => m.date === latestDate);
  const dailyTotal = latestMetrics.reduce((s, m) => s + m.estimatedCost, 0);
  const projectedMonthly = latestMetrics.reduce((s, m) => s + (m.projectedMonthly ?? 0), 0);

  // Top agents by cost on latest day
  const sorted = [...latestMetrics].sort((a, b) => b.estimatedCost - a.estimatedCost);
  const topRows = sorted.slice(0, 5).map((m) => [
    m.botId,
    `$${m.estimatedCost.toFixed(2)}`,
    `$${(m.projectedMonthly ?? 0).toFixed(0)}/mo`,
    m.modelMeter ?? '-',
  ]);

  // Capacity
  const capRows = capacity.map((c) => [
    envMap.get(c.envId) ?? c.envId,
    String(c.creditUsed.toLocaleString()),
    String(c.creditLimit.toLocaleString()),
    `${c.pct.toFixed(1)}%`,
    c.overage ? '**OVER**' : c.pct >= 80 ? 'Near limit' : 'OK',
  ]);

  const body = [
    `**Daily spend (${latestDate}):** $${dailyTotal.toFixed(2)}  `,
    `**Projected monthly:** $${projectedMonthly.toFixed(0)}`,
    '',
    '### Top agents by daily cost',
    mdTable(['Agent', 'Daily ($)', 'Projected/mo', 'Meter'], topRows),
    '',
    '### Environment capacity',
    mdTable(['Environment', 'Used', 'Limit', 'Pct', 'Status'], capRows),
  ].join('\n');

  return { title: 'Cost & Capacity', body };
}

function buildComplianceSection(
  violations: ComplianceViolation[],
  agents: Agent[],
): WeeklyReportSection {
  const open = violations.filter((v) => v.state === 'open');
  const acked = violations.filter((v) => v.state === 'acknowledged');
  const resolved = violations.filter((v) => v.state === 'resolved');

  const agentMap = new Map(agents.map((a) => [`${a.envId}/${a.botId}`, a.name]));

  const openRows = open.map((v) => [
    agentMap.get(v.agentRef) ?? v.agentRef,
    v.ruleId,
    v.severity.toUpperCase(),
    isoToDisplay(v.detectedAt),
  ]);

  const lines = [
    `Open: **${open.length}** | Acknowledged: **${acked.length}** | Resolved: **${resolved.length}**`,
  ];

  if (openRows.length > 0) {
    lines.push('', '### Open violations', mdTable(['Agent', 'Rule', 'Severity', 'Detected'], openRows));
  } else {
    lines.push('', '_No open violations this week._');
  }

  return { title: 'Compliance', body: lines.join('\n') };
}

function buildAlertsSection(alerts: Alert[], agents: Agent[]): WeeklyReportSection {
  const openAlerts = alerts.filter((a) => a.state === 'open');
  const agentMap = new Map(agents.map((a) => [`${a.envId}/${a.botId}`, a.name]));

  const rows = openAlerts.map((a) => [
    a.severity.toUpperCase(),
    a.type,
    a.botId ? (agentMap.get(`${a.envId}/${a.botId}`) ?? a.botId) : a.envId,
    a.message.slice(0, 80) + (a.message.length > 80 ? '...' : ''),
  ]);

  const body =
    rows.length > 0
      ? mdTable(['Severity', 'Type', 'Target', 'Message'], rows)
      : '_No open alerts._';

  return { title: 'Open Alerts', body };
}

function buildMaturitySection(results: MaturityResult[]): WeeklyReportSection {
  const pillarMap: Record<string, MaturityResult[]> = {};
  const ctrlIds = results.map((r) => r.controlId);

  // We can't join to controls without injecting them; infer pillar from controlId prefix
  for (const r of results) {
    const pillar = r.controlId.startsWith('ctrl-sec')
      ? 'Security'
      : r.controlId.startsWith('ctrl-mgmt')
        ? 'Management'
        : 'Reporting';
    const arr = pillarMap[pillar] ?? [];
    arr.push(r);
    pillarMap[pillar] = arr;
  }

  const rows = Object.entries(pillarMap).map(([pillar, items]) => {
    const avgScore = items.reduce((s, r) => s + r.score, 0) / items.length;
    return [
      pillar,
      `${avgScore.toFixed(1)} / 4.0`,
      String(items.filter((r) => r.capped).length),
    ];
  });

  const details = results
    .filter((r) => r.score < 3)
    .map((r) => `- **${r.controlId}** (score ${r.score}/4): ${r.residualBurden}`)
    .join('\n');

  const body = [
    mdTable(['Pillar', 'Avg Score', 'Capped'], rows),
    '',
    details ? '### Controls requiring attention\n' + details : '_All controls at target._',
  ].join('\n');

  return { title: 'Maturity Assessment', body };
}

function buildConversationSection(kpis: ConversationKpi[], health: HealthMetric[]): WeeklyReportSection {
  const dates = [...new Set(kpis.map((k) => k.date))].sort();
  const latestDate = dates.at(-1) ?? '';
  const latestKpis = kpis.filter((k) => k.date === latestDate);
  const totalSessions = latestKpis.reduce((s, k) => s + k.sessions, 0);
  const wDeflection =
    totalSessions > 0
      ? latestKpis.reduce((s, k) => s + k.deflectionRate * k.sessions, 0) / totalSessions
      : 0;
  const wEscalation =
    totalSessions > 0
      ? latestKpis.reduce((s, k) => s + k.escalationRate * k.sessions, 0) / totalSessions
      : 0;

  const latestHealth = health.filter((h) => h.date === latestDate);
  const avgErrorRate =
    latestHealth.length > 0
      ? latestHealth.reduce((s, h) => s + h.errorRate, 0) / latestHealth.length
      : 0;
  const avgLatency =
    latestHealth.length > 0
      ? latestHealth.reduce((s, h) => s + h.avgLatencyMs, 0) / latestHealth.length
      : 0;

  const rows = latestKpis.map((k) => [
    k.botId,
    String(k.sessions),
    pct(Math.round(k.deflectionRate * k.sessions), k.sessions),
    pct(Math.round(k.escalationRate * k.sessions), k.sessions),
  ]);

  const body = [
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total sessions (${latestDate}) | ${totalSessions} |`,
    `| Weighted deflection rate | ${(wDeflection * 100).toFixed(1)}% |`,
    `| Weighted escalation rate | ${(wEscalation * 100).toFixed(1)}% |`,
    `| Avg error rate | ${(avgErrorRate * 100).toFixed(2)}% |`,
    `| Avg latency | ${Math.round(avgLatency)}ms |`,
    '',
    '### Per-agent breakdown',
    mdTable(['Agent', 'Sessions', 'Deflection', 'Escalation'], rows),
  ].join('\n');

  return { title: 'Conversation KPIs & Health', body };
}

function buildGatesSection(decisions: GateDecision[], agents: Agent[]): WeeklyReportSection {
  const agentMap = new Map(agents.map((a) => [`${a.envId}/${a.botId}`, a.name]));
  const recent = [...decisions].sort((a, b) => b.signedAt.localeCompare(a.signedAt)).slice(0, 10);

  const rows = recent.map((d) => [
    agentMap.get(d.agentRef) ?? d.agentRef,
    d.verdict === 'pass' ? 'PASS' : 'BLOCK',
    isoToDisplay(d.signedAt),
    d.reasons[0]?.slice(0, 60) ?? '-',
  ]);

  const body =
    rows.length > 0
      ? mdTable(['Agent', 'Verdict', 'Date', 'Reason'], rows)
      : '_No gate decisions recorded this week._';

  return { title: 'Release Gates', body };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function sectionsToMarkdown(
  subject: string,
  period: string,
  sections: WeeklyReportSection[],
): string {
  const header = `# ${subject}\n\n_Period: ${period}_\n\n---\n`;
  const body = sections.map((s) => `## ${s.title}\n\n${s.body}`).join('\n\n---\n\n');
  return header + body;
}

function sectionsToHtml(
  subject: string,
  period: string,
  sections: WeeklyReportSection[],
): string {
  // Minimal inline-styled HTML suitable for email clients
  const wrapSection = (s: WeeklyReportSection): string => {
    // Process line-by-line so we can escape DB content before injecting into HTML,
    // then apply controlled markdown transforms (bold/italic) on the already-safe text.
    const bodyHtml = s.body
      .split('\n')
      .map((rawLine) => {
        if (rawLine.startsWith('|')) {
          // Table row: escape each cell value, then emit <td> tags
          const cells = rawLine.split('|').filter((c) => c.trim() !== '');
          const isSep = cells.every((c) => /^-+$/.test(c.trim()));
          if (isSep) return '';
          const tag = 'td';
          return `<tr>${cells
            .map((c) => {
              // Escape first, then apply controlled inline markdown within the cell
              const safe = escapeHtml(c.trim())
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/_(.+?)_/g, '<em>$1</em>');
              return `<${tag} style="padding:4px 8px;border:1px solid #ddd">${safe}</${tag}>`;
            })
            .join('')}</tr>`;
        }
        // Paragraph line: escape first, then apply controlled inline markdown
        const safe = escapeHtml(rawLine)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/_(.+?)_/g, '<em>$1</em>');
        return `<p style="margin:4px 0">${safe}</p>`;
      })
      .filter(Boolean)
      .join('\n');

    // Wrap consecutive <tr> blocks in a table
    const withTable = bodyHtml.replace(/(<tr>[\s\S]+?<\/tr>\n?)+/g, (match) => {
      return `<table style="border-collapse:collapse;font-size:13px;margin:8px 0">\n${match}</table>`;
    });

    return `
<div style="margin-bottom:24px">
  <h2 style="font-size:16px;color:#1f2937;border-bottom:2px solid #10b981;padding-bottom:4px">${escapeHtml(s.title)}</h2>
  <div style="font-size:13px;color:#374151;line-height:1.6">${withTable}</div>
</div>`;
  };

  const safeSubject = escapeHtml(subject);
  const safePeriod = escapeHtml(period);
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${safeSubject}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;background:#fff;color:#111">
  <h1 style="font-size:22px;color:#065f46">${safeSubject}</h1>
  <p style="color:#6b7280;font-size:13px">Period: ${safePeriod}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  ${sections.map(wrapSection).join('\n')}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p style="font-size:11px;color:#9ca3af">Generated by AgentLens v2 &bull; ${escapeHtml(new Date().toISOString())}</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period =
    input.periodLabel ??
    `${isoToDisplay(sevenDaysAgo.toISOString())} to ${isoToDisplay(now.toISOString())}`;

  const subject = `AgentLens Weekly Governance Report - ${period}`;

  const sections: WeeklyReportSection[] = [
    buildSummarySection(input, period),
    buildAgentInventorySection(input.agents, input.environments),
    buildCostSection(input.metrics, input.capacity, input.environments),
    buildComplianceSection(input.violations, input.agents),
    buildAlertsSection(input.alerts, input.agents),
    buildMaturitySection(input.maturityResults),
    buildConversationSection(input.conversationKpis, input.healthMetrics),
    buildGatesSection(input.gateDecisions, input.agents),
  ];

  const markdown = sectionsToMarkdown(subject, period, sections);
  const html = sectionsToHtml(subject, period, sections);

  return {
    period,
    generatedAt: now.toISOString(),
    subject,
    sections,
    markdown,
    html,
    isMock: false,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build from mock seed (offline fallback)
// ---------------------------------------------------------------------------
export function buildWeeklyReportFromMock(): WeeklyReport {
  assertNotProduction();

  const seed = require('@/lib/mock/seed');

  const report = buildWeeklyReport({
    agents: seed.mockAgents,
    environments: seed.mockEnvironments,
    metrics: seed.mockMetrics,
    alerts: seed.mockAlerts,
    capacity: seed.mockCapacity,
    violations: seed.mockViolations,
    maturityResults: seed.mockMaturityResults,
    conversationKpis: seed.mockConversationKpis,
    healthMetrics: seed.mockHealthMetrics,
    gateDecisions: seed.mockGateDecisions,
  });

  return { ...report, isMock: true };
}
