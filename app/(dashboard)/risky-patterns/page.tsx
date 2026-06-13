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
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
  InfoTip,
  DataSourceBadge,
} from '@/components/ui';
import {
  AlertTriangle,
  Activity,
  Filter,
  Download,
  RefreshCw,
  Workflow,
  ShieldCheck,
  Boxes,
} from 'lucide-react';

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
// Risk score badge (mapped to design-system Badge)
// ---------------------------------------------------------------------------
function RiskBadge({ score }: { score: number }) {
  const variant =
    score >= 15
      ? 'critical' as const
      : score >= 8
      ? 'warning' as const
      : score >= 3
      ? 'neutral' as const
      : 'neutral' as const;
  return <Badge variant={variant}>{score}</Badge>;
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
// Summary stats bar - restyled as StatCards row
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
        <Card key={pattern} className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs text-slate-400">{label}</span>
          <Badge
            variant={count > 3 ? 'critical' : count > 1 ? 'warning' : 'neutral'}
            dot={count > 3}
          >
            {count}
          </Badge>
        </Card>
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

  const highRiskCount = allRows.filter((r) => r.riskScore >= 15).length;
  const mediumRiskCount = allRows.filter((r) => r.riskScore >= 8 && r.riskScore < 15).length;
  const patternsDetectedCount = ALL_RISKY_PATTERNS.filter((p) =>
    allRows.some((r) => r.patterns[p]),
  ).length;

  return (
    <div className="p-8">
      <PageHeader
        icon={AlertTriangle}
        title="Risky Patterns"
        subtitle="Matrix of agents versus detected governance risk patterns. Sorted by risk score."
        tone="amber"
        badge={
          <div className="flex items-center gap-2">
            {highRiskCount > 0 ? (
              <Badge variant="critical" dot>{highRiskCount} high risk</Badge>
            ) : (
              <Badge variant="success">All clear</Badge>
            )}
            <DataSourceBadge state="demo" source="sample data" />
          </div>
        }
        actions={
          <>
            <Button icon={RefreshCw} variant="ghost">Refresh</Button>
            <Button icon={Download} variant="ghost">Export</Button>
          </>
        }
      />

      {/* KPI stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="relative">
          <StatCard
            icon={AlertTriangle}
            label="High Risk Agents"
            value={highRiskCount}
            sublabel="risk score >= 15"
            tone={highRiskCount > 0 ? 'red' : 'emerald'}
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="High Risk Agents">
              Agents scoring 15+ on risk assessment. Sample data until live.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={Activity}
            label="Medium Risk Agents"
            value={mediumRiskCount}
            sublabel="risk score 8-14"
            tone={mediumRiskCount > 0 ? 'amber' : 'emerald'}
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Medium Risk Agents">
              Agents with moderate governance risk patterns. Sample data.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={Workflow}
            label="Patterns Detected"
            value={patternsDetectedCount}
            sublabel={`of ${ALL_RISKY_PATTERNS.length} total patterns`}
            tone="sky"
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Patterns Detected">
              Number of distinct risk patterns found. Sample data.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={Boxes}
            label="Agents Scanned"
            value={allRows.length}
            sublabel={`${filtered.length} match current filters`}
            tone="violet"
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Agents Scanned">
              Total agents evaluated for risk patterns. Sample data.
            </InfoTip>
          </div>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="mb-6">
        <SectionTitle icon={Activity}>Pattern Prevalence</SectionTitle>
        <StatBar rows={allRows} />
      </div>

      {/* Filters */}
      <Card className="mb-4 p-4">
        <SectionTitle icon={Filter}>Filters</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <select
            value={lifecycleFilter}
            onChange={(e) => setLifecycleFilter(e.target.value)}
            className="rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All lifecycles</option>
            {lifecycles.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select
            value={envTypeFilter}
            onChange={(e) => setEnvTypeFilter(e.target.value)}
            className="rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All env types</option>
            {envTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={patternFilter}
            onChange={(e) => setPatternFilter(e.target.value as RiskyPattern | 'all')}
            className="rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-slate-700 focus:outline-none"
          >
            <option value="all">All patterns</option>
            {ALL_RISKY_PATTERNS.map((p) => (
              <option key={p} value={p}>{PATTERN_LABELS[p]}</option>
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
      </Card>

      {/* Matrix */}
      <Card className="p-5">
        <SectionTitle icon={AlertTriangle}>Agent x Pattern Matrix</SectionTitle>
        <div className="overflow-x-auto">
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
      </Card>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-400">Legend:</span>
        <span className="flex items-center gap-1.5">
          <PatternCell active={true} />
          Pattern detected
        </span>
        <span className="flex items-center gap-1.5">
          <PatternCell active={false} />
          Not detected
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="critical">15+</Badge> High risk
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="warning">8-14</Badge> Medium risk
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="neutral">3-7</Badge> Low risk
        </span>
      </div>
    </div>
  );
}
