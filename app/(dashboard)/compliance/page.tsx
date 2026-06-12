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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityBadge(s: ComplianceRule['severity'] | ComplianceViolation['severity']) {
  const cls =
    s === 'critical'
      ? 'bg-red-900/60 text-red-300 border border-red-700'
      : s === 'warning'
      ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
      : 'bg-slate-700 text-slate-300 border border-slate-600';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>
  );
}

function stateBadge(state: ComplianceViolation['state']) {
  const cls =
    state === 'open'
      ? 'bg-red-900/50 text-red-300'
      : state === 'acknowledged'
      ? 'bg-yellow-900/50 text-yellow-300'
      : state === 'resolved'
      ? 'bg-emerald-900/50 text-emerald-300'
      : 'bg-slate-700 text-slate-400';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{state}</span>
  );
}

function scoreBandColor(band: ReturnType<typeof scoreBand>) {
  if (band === 'excellent') return 'text-emerald-400';
  if (band === 'good') return 'text-green-400';
  if (band === 'warning') return 'text-yellow-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Score card
// ---------------------------------------------------------------------------
function ScoreCard({ label, score, sub }: { label: string; score: number; sub?: string }) {
  const band = scoreBand(score);
  const color = scoreBandColor(band);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-4xl font-bold ${color}`}>{score}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
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
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-slate-200">Rule Pack</h2>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="ml-auto rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All severities</option>
          {severities.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
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
                <td className="py-2 pr-4 font-medium text-slate-200">{rule.name}</td>
                <td className="py-2 pr-4 text-slate-400">{rule.type}</td>
                <td className="py-2 pr-4">{severityBadge(rule.severity)}</td>
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      rule.enabled
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {rule.enabled ? 'enabled' : 'disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-slate-200">Violation Queue</h2>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="ml-auto rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All states</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="suppressed">Suppressed</option>
        </select>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => handleBulk('acknowledged')}
              className="rounded bg-yellow-700 px-3 py-1 text-xs font-medium text-yellow-100 hover:bg-yellow-600"
            >
              Acknowledge ({selected.size})
            </button>
            <button
              onClick={() => handleBulk('resolved')}
              className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-600"
            >
              Resolve ({selected.size})
            </button>
          </div>
        )}
      </div>
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
                <td colSpan={6} className="py-8 text-center text-slate-500">
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
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => toggle(v.id)}
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-200">{botId}</span>
                      <span className="block text-xs text-slate-500">{envId}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">
                      {rule?.name ?? v.ruleId}
                    </td>
                    <td className="py-2 pr-4">{severityBadge(v.severity)}</td>
                    <td className="py-2 pr-4">{stateBadge(v.state)}</td>
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(v.detectedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent score table
// ---------------------------------------------------------------------------
function AgentScoreTable({ scores }: { scores: AgentComplianceScore[] }) {
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-200">Per-Agent Scores</h2>
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
              return (
                <tr key={s.agentRef} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-slate-200">{s.agentName}</span>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">{s.envType}</td>
                  <td className={`py-2 pr-4 font-bold ${color}`}>{s.score}</td>
                  <td className="py-2 pr-4 text-red-400">{s.criticalCount || '-'}</td>
                  <td className="py-2 pr-4 text-yellow-400">{s.warningCount || '-'}</td>
                  <td className="py-2 text-slate-400">{s.infoCount || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Compliance</h1>
        <p className="mt-1 text-sm text-slate-400">
          Rule evaluation, violation queue, and weighted compliance scores.
        </p>
      </div>

      {/* Score cards row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ScoreCard
          label="Tenant Score"
          score={tenantScore.score}
          sub={`${tenantScore.compliantAgentPct}% agents compliant`}
        />
        <ScoreCard
          label="Open Violations"
          score={openCount}
          sub={`${criticalOpen} critical`}
        />
        <ScoreCard
          label="Rules Active"
          score={allRules.filter((r) => r.enabled).length}
          sub={`of ${allRules.length} total`}
        />
        <ScoreCard
          label="Agents Assessed"
          score={mockAgents.length}
          sub={`across ${mockEnvironments.length} envs`}
        />
      </div>

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
  );
}
