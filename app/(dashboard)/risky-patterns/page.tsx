'use client';

/**
 * AgentLens - Risky Patterns Page
 *
 * Renders a matrix of agents x RiskyPattern columns.
 * Each cell shows a filled indicator if the pattern is detected.
 * Rows are sorted by total risk score descending.
 * Filter controls: lifecycle, envType, pattern.
 */

import React, { useState, useMemo } from 'react';
import type { RiskyPattern } from '@/lib/types';
import { mockAgents, mockEnvironments } from '@/lib/mock/seed';
import {
  buildPatternsMatrix,
  ALL_RISKY_PATTERNS,
  PATTERN_LABELS,
  type AgentPatternResult,
} from '@/lib/compliance/riskyPatterns';

// ---------------------------------------------------------------------------
// Cell indicator
// ---------------------------------------------------------------------------
function PatternCell({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        title="Detected"
        className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-700/80 text-red-200"
        aria-label="detected"
      >
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
          <circle cx="6" cy="6" r="4" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title="Not detected"
      className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-slate-700"
      aria-label="not detected"
    >
      <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
        <circle cx="6" cy="6" r="2" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Risk score badge
// ---------------------------------------------------------------------------
function RiskBadge({ score }: { score: number }) {
  const cls =
    score >= 15
      ? 'bg-red-900/60 text-red-300 border border-red-700'
      : score >= 8
      ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
      : score >= 3
      ? 'bg-slate-700 text-slate-300 border border-slate-600'
      : 'bg-slate-800 text-slate-500 border border-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{score}</span>
  );
}

// ---------------------------------------------------------------------------
// Pattern column header (rotated)
// ---------------------------------------------------------------------------
function PatternHeader({ label }: { label: string }) {
  return (
    <th className="pb-2 pr-1 text-center">
      <div
        className="inline-block origin-bottom-left -rotate-45 whitespace-nowrap text-xs text-slate-400"
        style={{ minWidth: '2.5rem' }}
      >
        {label}
      </div>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Summary stats bar
// ---------------------------------------------------------------------------
function StatBar({ rows }: { rows: AgentPatternResult[] }) {
  const patternTotals = ALL_RISKY_PATTERNS.map((p) => ({
    pattern: p,
    label: PATTERN_LABELS[p],
    count: rows.filter((r) => r.patterns[p]).length,
  }));

  return (
    <div className="flex flex-wrap gap-3">
      {patternTotals.map(({ pattern, label, count }) => (
        <div
          key={pattern}
          className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-3 py-1.5"
        >
          <span className="text-xs text-slate-400">{label}</span>
          <span
            className={`text-sm font-bold ${
              count > 3 ? 'text-red-400' : count > 1 ? 'text-yellow-400' : 'text-slate-300'
            }`}
          >
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------


export default function RiskyPatternsPage() {
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [envTypeFilter, setEnvTypeFilter] = useState<string>('all');
  const [patternFilter, setPatternFilter] = useState<RiskyPattern | 'all'>('all');
  const [minRisk, setMinRisk] = useState<number>(0);

  const allRows = useMemo(
    () => buildPatternsMatrix(mockAgents, mockEnvironments),
    [],
  );

  const envTypes = Array.from(new Set(allRows.map((r) => r.envType)));
  const lifecycles = Array.from(new Set(allRows.map((r) => r.lifecycle ?? 'unknown')));

  const filtered = useMemo(() => {
    return allRows.filter((row) => {
      if (lifecycleFilter !== 'all' && (row.lifecycle ?? 'unknown') !== lifecycleFilter) {
        return false;
      }
      if (envTypeFilter !== 'all' && row.envType !== envTypeFilter) return false;
      if (patternFilter !== 'all' && !row.patterns[patternFilter]) return false;
      if (row.riskScore < minRisk) return false;
      return true;
    });
  }, [allRows, lifecycleFilter, envTypeFilter, patternFilter, minRisk]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Risky Patterns</h1>
        <p className="mt-1 text-sm text-slate-400">
          Matrix of agents versus detected governance risk patterns. Sorted by risk score.
        </p>
      </div>

      {/* Summary stats */}
      <StatBar rows={allRows} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value)}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All lifecycles</option>
          {lifecycles.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={envTypeFilter}
          onChange={(e) => setEnvTypeFilter(e.target.value)}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All env types</option>
          {envTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={patternFilter}
          onChange={(e) => setPatternFilter(e.target.value as RiskyPattern | 'all')}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All patterns</option>
          {ALL_RISKY_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Min risk</label>
          <input
            type="range"
            min={0}
            max={30}
            value={minRisk}
            onChange={(e) => setMinRisk(Number(e.target.value))}
            className="w-24 accent-emerald-500"
          />
          <span className="min-w-[1.5rem] text-xs font-medium text-slate-300">{minRisk}</span>
        </div>
        <span className="ml-auto self-center text-xs text-slate-500">
          {filtered.length} of {allRows.length} agents
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="pb-2 pr-4 text-left text-xs uppercase tracking-wider text-slate-500">
                Agent
              </th>
              <th className="pb-2 pr-4 text-left text-xs uppercase tracking-wider text-slate-500">
                Env / Lifecycle
              </th>
              {ALL_RISKY_PATTERNS.map((p) => (
                <PatternHeader key={p} label={PATTERN_LABELS[p]} />
              ))}
              <th className="pb-2 pl-4 text-left text-xs uppercase tracking-wider text-slate-500">
                Risk
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={ALL_RISKY_PATTERNS.length + 3}
                  className="py-10 text-center text-slate-500"
                >
                  No agents match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.agentRef}
                  className="border-b border-slate-800/60 hover:bg-slate-800/30"
                >
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-slate-200">{row.agentName}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">
                    <span className="block">{row.envType}</span>
                    <span className="text-slate-600">{row.lifecycle ?? 'unset'}</span>
                  </td>
                  {ALL_RISKY_PATTERNS.map((p) => (
                    <td key={p} className="px-1 py-2.5 text-center">
                      <PatternCell active={row.patterns[p]} />
                    </td>
                  ))}
                  <td className="py-2.5 pl-4">
                    <RiskBadge score={row.riskScore} />
                    {row.patternCount > 0 && (
                      <span className="ml-1 text-xs text-slate-500">
                        ({row.patternCount}p)
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-400">Legend:</span>
        <span className="flex items-center gap-1">
          <PatternCell active={true} />
          Pattern detected
        </span>
        <span className="flex items-center gap-1">
          <PatternCell active={false} />
          Not detected
        </span>
        <span className="flex items-center gap-1">
          <RiskBadge score={15} /> High risk ({'>='}15)
        </span>
        <span className="flex items-center gap-1">
          <RiskBadge score={8} /> Medium risk (8-14)
        </span>
        <span className="flex items-center gap-1">
          <RiskBadge score={3} /> Low risk (3-7)
        </span>
      </div>
    </div>
  );
}
