'use client';

/**
 * AgentLens - Compliance Page
 *
 * Features:
 *  - Tenant + per-agent compliance score cards
 *  - Rule management table (toggle enabled/disabled, filter by type/severity)
 *  - Violation queue with bulk acknowledge / resolve actions
 */

import React, { useState, useMemo, useTransition } from 'react';
import type { ComplianceRule, ComplianceViolation } from '@/lib/types';
import {
  mockAgents,
  mockEnvironments,
  mockComplianceRules,
  mockViolations,
} from '@/lib/mock/seed';
import { defaultRulePack } from '@/lib/compliance/rules';
import { evaluateAgents } from '@/lib/compliance/evaluator';
import { scoreTenant, scoreBand, type AgentComplianceScore } from '@/lib/compliance/scoring';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
} from '@/components/ui';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Users,
  Filter,
  CheckCheck,
  XCircle,
  Activity,
  Download,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityVariant(s: ComplianceRule['severity'] | ComplianceViolation['severity']) {
  if (s === 'critical') return 'critical' as const;
  if (s === 'warning') return 'warning' as const;
  return 'neutral' as const;
}

function stateVariant(state: ComplianceViolation['state']) {
  if (state === 'open') return 'critical' as const;
  if (state === 'acknowledged') return 'warning' as const;
  if (state === 'resolved') return 'success' as const;
  return 'neutral' as const;
}

function scoreBandTone(band: ReturnType<typeof scoreBand>) {
  if (band === 'excellent') return 'emerald' as const;
  if (band === 'good') return 'emerald' as const;
  if (band === 'warning') return 'amber' as const;
  return 'red' as const;
}

function scoreBandColor(band: ReturnType<typeof scoreBand>) {
  if (band === 'excellent') return 'text-emerald-400';
  if (band === 'good') return 'text-green-400';
  if (band === 'warning') return 'text-amber-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Rules table
// ---------------------------------------------------------------------------
function RulesPanel({ rules }: { rules: ComplianceRule[] }) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const types = Array.from(new Set(rules.map((r) => r.type)));
  const severities = Array.from(new Set(rules.map((r) => r.severity)));

  const filtered = rules.filter(
    (r) =>
      (typeFilter === 'all' || r.type === typeFilter) &&
      (severityFilter === 'all' || r.severity === severityFilter),
  );

  return (
    <Card className="p-5">
      <SectionTitle icon={ListChecks} right={
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All severities</option>
            {severities.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      }>
        Rule Pack
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Severity</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rule) => (
              <tr key={rule.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="py-2.5 pr-4 font-medium text-slate-200">{rule.name}</td>
                <td className="py-2.5 pr-4 text-slate-400">{rule.type}</td>
                <td className="py-2.5 pr-4">
                  <Badge variant={severityVariant(rule.severity)}>{rule.severity}</Badge>
                </td>
                <td className="py-2.5">
                  <Badge variant={rule.enabled ? 'success' : 'neutral'}>
                    {rule.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Violation queue
// ---------------------------------------------------------------------------
function ViolationQueue({
  violations,
  rules,
  onBulkAction,
}: {
  violations: ComplianceViolation[];
  rules: ComplianceRule[];
  onBulkAction: (ids: string[], action: 'acknowledged' | 'resolved') => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<string>('open');
  const [, startTransition] = useTransition();

  const ruleIndex = useMemo(
    () => new Map<string, ComplianceRule>(rules.map((r) => [r.id, r])),
    [rules],
  );

  const filtered = violations.filter(
    (v) => stateFilter === 'all' || v.state === stateFilter,
  );

  const allIds = filtered.map((v) => v.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulk(action: 'acknowledged' | 'resolved') {
    startTransition(() => {
      onBulkAction(Array.from(selected), action);
      setSelected(new Set());
    });
  }

  return (
    <Card className="p-5">
      <SectionTitle icon={AlertTriangle} right={
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button
                icon={CheckCheck}
                onClick={() => handleBulk('acknowledged')}
                variant="ghost"
              >
                Acknowledge ({selected.size})
              </Button>
              <Button
                icon={CheckCircle2}
                onClick={() => handleBulk('resolved')}
                variant="primary"
              >
                Resolve ({selected.size})
              </Button>
            </>
          )}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All states</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="suppressed">Suppressed</option>
          </select>
        </div>
      }>
        Violation Queue
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-emerald-500"
                />
              </th>
              <th className="pb-2 pr-4">Agent</th>
              <th className="pb-2 pr-4">Rule</th>
              <th className="pb-2 pr-4">Severity</th>
              <th className="pb-2 pr-4">State</th>
              <th className="pb-2">Detected</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  No violations in this view.
                </td>
              </tr>
            ) : (
              filtered.map((v) => {
                const rule = ruleIndex.get(v.ruleId);
                const [envId, botId] = v.agentRef.split('/');
                return (
                  <tr
                    key={v.id}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30"
                  >
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => toggle(v.id)}
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-slate-200">{botId}</span>
                      <span className="block text-xs text-slate-500">{envId}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {rule?.name ?? v.ruleId}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={severityVariant(v.severity)}>{v.severity}</Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={stateVariant(v.state)} dot={v.state === 'open'}>{v.state}</Badge>
                    </td>
                    <td className="py-2.5 text-xs text-slate-500">
                      {new Date(v.detectedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Agent score table
// ---------------------------------------------------------------------------
function AgentScoreTable({ scores }: { scores: AgentComplianceScore[] }) {
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  return (
    <Card className="p-5">
      <SectionTitle icon={Users}>Per-Agent Scores</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-4">Agent</th>
              <th className="pb-2 pr-4">Env Type</th>
              <th className="pb-2 pr-4">Score</th>
              <th className="pb-2 pr-4">Critical</th>
              <th className="pb-2 pr-4">Warning</th>
              <th className="pb-2">Info</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const band = scoreBand(s.score);
              const color = scoreBandColor(band);
              const tone = scoreBandTone(band);
              return (
                <tr key={s.agentRef} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-slate-200">{s.agentName}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400">{s.envType}</td>
                  <td className={`py-2.5 pr-4 font-bold ${color}`}>{s.score}</td>
                  <td className="py-2.5 pr-4">
                    {s.criticalCount ? (
                      <Badge variant="critical">{s.criticalCount}</Badge>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {s.warningCount ? (
                      <Badge variant="warning">{s.warningCount}</Badge>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-400">{s.infoCount || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  // Merge default rule pack with seed rules (seed has 6; pack has 9 - union by ID)
  const allRules = useMemo(() => {
    const seedIds = new Set(mockComplianceRules.map((r) => r.id));
    const extra = defaultRulePack.filter((r) => !seedIds.has(r.id));
    return [...mockComplianceRules, ...extra];
  }, []);

  // Evaluate agents to get full violation list
  const [violations, setViolations] = useState<ComplianceViolation[]>(() =>
    evaluateAgents(mockAgents, mockEnvironments, allRules, mockViolations),
  );

  const tenantScore = useMemo(
    () => scoreTenant(mockAgents, mockEnvironments, allRules, violations),
    [violations, allRules],
  );

  function handleBulkAction(ids: string[], action: 'acknowledged' | 'resolved') {
    setViolations((prev) =>
      prev.map((v) => (ids.includes(v.id) ? { ...v, state: action } : v)),
    );
  }

  const openCount = violations.filter((v) => v.state === 'open').length;
  const criticalOpen = violations.filter(
    (v) => v.state === 'open' && v.severity === 'critical',
  ).length;

  const tenantBand = scoreBand(tenantScore.score);

  return (
    <div className="p-8">
      <PageHeader
        icon={ShieldCheck}
        title="Compliance"
        subtitle="Rule evaluation, violation queue, and weighted compliance scores."
        tone={tenantBand === 'warning' || tenantBand === 'critical' ? 'amber' : 'emerald'}
        badge={
          <Badge variant={tenantBand === 'excellent' || tenantBand === 'good' ? 'success' : tenantBand === 'warning' ? 'warning' : 'critical'}>
            {tenantBand}
          </Badge>
        }
        actions={
          <>
            <Button icon={RefreshCw} variant="ghost">Refresh</Button>
            <Button icon={Download} variant="ghost">Export</Button>
          </>
        }
      />

      {/* Score cards row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          label="Tenant Score"
          value={tenantScore.score}
          sublabel={`${tenantScore.compliantAgentPct}% agents compliant`}
          tone={tenantBand === 'excellent' || tenantBand === 'good' ? 'emerald' : tenantBand === 'warning' ? 'amber' : 'red'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Violations"
          value={openCount}
          sublabel={`${criticalOpen} critical`}
          tone={openCount === 0 ? 'emerald' : criticalOpen > 0 ? 'red' : 'amber'}
        />
        <StatCard
          icon={ListChecks}
          label="Rules Active"
          value={allRules.filter((r) => r.enabled).length}
          sublabel={`of ${allRules.length} total`}
          tone="sky"
        />
        <StatCard
          icon={Users}
          label="Agents Assessed"
          value={mockAgents.length}
          sublabel={`across ${mockEnvironments.length} envs`}
          tone="violet"
        />
      </div>

      <div className="space-y-6">
        {/* Rules panel */}
        <RulesPanel rules={allRules} />

        {/* Violation queue */}
        <ViolationQueue
          violations={violations}
          rules={allRules}
          onBulkAction={handleBulkAction}
        />

        {/* Per-agent scores */}
        <AgentScoreTable scores={tenantScore.agentScores} />
      </div>
    </div>
  );
}
