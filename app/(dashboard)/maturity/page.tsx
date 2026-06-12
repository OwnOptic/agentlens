'use client';

/**
 * AgentLens Maturity Page
 *
 * Renders:
 *   1. Pillar/zone heatmap (Security / Management / Reporting)
 *   2. Per-pillar score cards with individual control rows
 *   3. Honesty note explaining the telemetry partial-cap rule
 *   4. Pending actions list
 *
 * Uses the mock seed directly so the page renders without a live tenant.
 * In production, replace the client-side useMemo with a SWR/fetch call
 * to GET /api/maturity.
 */

import React, { useMemo, useState } from 'react';
import { generateAssessment, buildHeatmap, getPendingActions } from '@/lib/maturity/report';
import { buildTelemetrySignals } from '@/lib/maturity/scoring';
import { PILLAR_DESCRIPTIONS, type Pillar } from '@/lib/maturity/controls';
import type { ControlAssessment, HeatmapCell, PillarAssessment } from '@/lib/maturity/report';
import type { ScoreBand } from '@/lib/maturity/scoring';

// ---------------------------------------------------------------------------
// Metadata (server-compatible export; page is client for interactivity)
// ---------------------------------------------------------------------------

// NOTE: metadata export is moved to a separate layout or head for 'use client' pages.
// Title is set via the document title effect below.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAND_TEXT: Record<ScoreBand, string> = {
  critical:   'Critical',
  low:        'Low',
  developing: 'Developing',
  managed:    'Managed',
  optimised:  'Optimised',
};

const BAND_RING: Record<ScoreBand, string> = {
  critical:   'ring-red-600',
  low:        'ring-orange-500',
  developing: 'ring-yellow-500',
  managed:    'ring-green-500',
  optimised:  'ring-emerald-400',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBadge({ score, band }: { score: number; band: ScoreBand }) {
  const text: Record<ScoreBand, string> = {
    critical:   'bg-red-700/20 text-red-400 ring-red-700/30',
    low:        'bg-orange-600/20 text-orange-400 ring-orange-600/30',
    developing: 'bg-yellow-600/20 text-yellow-400 ring-yellow-600/30',
    managed:    'bg-green-600/20 text-green-400 ring-green-600/30',
    optimised:  'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${text[band]}`}
    >
      {score.toFixed(1)} / 4 &mdash; {BAND_TEXT[band]}
    </span>
  );
}

function ControlRow({ ca }: { ca: ControlAssessment }) {
  const [expanded, setExpanded] = useState(false);
  const { control, result } = ca;
  const filled = Math.round(result.score);

  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Dot indicators for score 0-4 */}
          <div className="flex gap-0.5 shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={`inline-block h-2 w-2 rounded-full ${
                  i < filled ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
          <span className="text-sm text-slate-200 truncate">{control.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.capped && (
            <span className="text-xs text-amber-400 font-medium">capped</span>
          )}
          <span className="text-xs text-slate-400">
            {control.autoEvaluable ? 'auto' : 'manual'}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            aria-label="Toggle residual burden"
          >
            {expanded ? '- less' : '+ detail'}
          </button>
        </div>
      </div>
      {expanded && result.residualBurden && (
        <p className="text-xs text-slate-400 pl-5 leading-relaxed">
          {result.residualBurden}
        </p>
      )}
    </div>
  );
}

function PillarCard({ pillar: pa }: { pillar: PillarAssessment }) {
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-900 p-5 ring-1 ${BAND_RING[pa.band]} space-y-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-white">{pa.label}</h3>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            {PILLAR_DESCRIPTIONS[pa.pillar as Pillar]}
          </p>
        </div>
        <ScoreBadge score={pa.averageScore} band={pa.band} />
      </div>
      <div className="space-y-2">
        {pa.controls.map((ca) => (
          <ControlRow key={ca.control.id} ca={ca} />
        ))}
      </div>
    </div>
  );
}

function HeatmapTile({ cell }: { cell: HeatmapCell }) {
  return (
    <div
      className={`${cell.bgClass} rounded-xl p-5 flex flex-col items-center justify-center gap-1 min-h-[96px]`}
    >
      <span className="text-2xl font-bold text-white">
        {cell.score.toFixed(1)}
      </span>
      <span className="text-sm font-medium text-white/90">{cell.label}</span>
      <span className="text-xs text-white/70">{BAND_TEXT[cell.band]}</span>
    </div>
  );
}

function HonestyNote({ note }: { note: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-3">
      <div className="shrink-0 mt-0.5 text-amber-400 text-sm font-bold">!</div>
      <p className="text-sm text-amber-200 leading-relaxed">{note}</p>
    </div>
  );
}

function PendingActionsPanel({ items }: { items: ControlAssessment[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-3">
        <p className="text-sm text-emerald-300">No high-priority pending actions.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((ca) => (
        <div
          key={ca.control.id}
          className="rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 flex items-start gap-3"
        >
          <div className="shrink-0 mt-0.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                ca.result.score <= 1 ? 'bg-red-500' : 'bg-amber-400'
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{ca.control.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {ca.result.residualBurden}
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-500 font-mono">
            {ca.result.score}/4
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MaturityPage() {
  // Re-score on every render using mock seed (replaces with SWR in prod).
  const { assessment, heatmap, pending } = useMemo(() => {
    const signals    = buildTelemetrySignals();
    const assessment = generateAssessment(signals);
    const heatmap    = buildHeatmap(assessment);
    const pending    = getPendingActions(assessment);
    return { assessment, heatmap, pending };
  }, []);

  return (
    <div className="space-y-8 pb-12">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Maturity Assessment</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Governance maturity scored across Security, Management, and
            Reporting pillars. Auto-derived scores are capped at 3/4 by
            design &mdash; see the honesty note below.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <ScoreBadge score={assessment.overallScore} band={assessment.overallBand} />
          <p className="text-xs text-slate-500 mt-1">
            Generated{' '}
            {new Date(assessment.generatedAt).toLocaleTimeString([], {
              hour:   '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {/* Data quality warning */}
      {assessment.dataQualityWarning && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          Some telemetry sources were unavailable during this run. Scores may
          be lower than actual maturity.
        </div>
      )}

      {/* Heatmap */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Pillar Heatmap
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {heatmap.map((cell) => (
            <HeatmapTile key={cell.pillar} cell={cell} />
          ))}
        </div>
      </section>

      {/* Honesty note */}
      <HonestyNote note={assessment.honestyNote} />

      {/* Pillar detail cards */}
      <section className="space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Control Details
        </h2>
        {assessment.pillars.map((p) => (
          <PillarCard key={p.pillar} pillar={p} />
        ))}
      </section>

      {/* Pending actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Pending Actions ({pending.length})
        </h2>
        <PendingActionsPanel items={pending} />
      </section>

      {/* Source split */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Auto-Derived vs Manual Questionnaire
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
              Auto-Derived ({assessment.autoDerived.length})
            </p>
            <ul className="space-y-1">
              {assessment.autoDerived.map((ca) => (
                <li key={ca.control.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">
                    {ca.control.name}
                  </span>
                  <span className="text-xs font-mono text-slate-400 shrink-0">
                    {ca.result.score}/4{ca.result.capped ? ' (cap)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
              Manual Questionnaire ({assessment.manualQuestionnaire.length})
            </p>
            <ul className="space-y-1">
              {assessment.manualQuestionnaire.map((ca) => (
                <li key={ca.control.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">
                    {ca.control.name}
                  </span>
                  <span className="text-xs font-mono text-slate-400 shrink-0">
                    {ca.result.score}/4
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
