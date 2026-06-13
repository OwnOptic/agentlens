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
import {
  Gauge,
  ShieldCheck,
  Settings2,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Layers,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { generateAssessment, buildHeatmap, getPendingActions } from '@/lib/maturity/report';
import { buildTelemetrySignals } from '@/lib/maturity/scoring';
import { PILLAR_DESCRIPTIONS, type Pillar } from '@/lib/maturity/controls';
import type { ControlAssessment, HeatmapCell, PillarAssessment } from '@/lib/maturity/report';
import type { ScoreBand } from '@/lib/maturity/scoring';
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

const BAND_VARIANT: Record<ScoreBand, 'critical' | 'warning' | 'info' | 'success' | 'neutral'> = {
  critical:   'critical',
  low:        'warning',
  developing: 'info',
  managed:    'success',
  optimised:  'success',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBadge({ score, band }: { score: number; band: ScoreBand }) {
  return (
    <Badge variant={BAND_VARIANT[band]}>
      {score.toFixed(1)} / 4 &mdash; {BAND_TEXT[band]}
    </Badge>
  );
}

function ControlRow({ ca }: { ca: ControlAssessment }) {
  const [expanded, setExpanded] = useState(false);
  const { control, result } = ca;
  const filled = Math.round(result.score);

  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700/60 p-3 space-y-1">
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
            <Badge variant="warning">capped</Badge>
          )}
          <Badge variant="neutral">
            {control.autoEvaluable ? 'auto' : 'manual'}
          </Badge>
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
    <Card className={`p-5 ring-1 ${BAND_RING[pa.band]} space-y-4`}>
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
    </Card>
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
    <Card className="px-4 py-3 border-amber-500/30 bg-amber-500/5">
      <div className="flex gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
        <div className="flex-1 flex items-start gap-2 flex-wrap">
          <p className="text-sm text-amber-200 leading-relaxed flex-1">{note}</p>
          <Badge variant="warning">partial-cap</Badge>
        </div>
      </div>
    </Card>
  );
}

function PendingActionsPanel({ items }: { items: ControlAssessment[] }) {
  if (items.length === 0) {
    return (
      <Card className="px-4 py-3 border-emerald-700/40 bg-emerald-900/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">No high-priority pending actions.</p>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((ca) => (
        <Card key={ca.control.id} className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  ca.result.score <= 1 ? 'bg-red-500' : 'bg-amber-400'
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{ca.control.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {ca.result.residualBurden}
              </p>
            </div>
            <Badge variant={ca.result.score <= 1 ? 'critical' : 'warning'}>
              {ca.result.score}/4
            </Badge>
          </div>
        </Card>
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
    <div className="p-8 space-y-8 pb-12">
      <PageHeader
        icon={Gauge}
        tone="emerald"
        title="Maturity Assessment"
        subtitle="Governance maturity scored across Security, Management, and Reporting pillars. Auto-derived scores are capped at 3/4 by design - see the honesty note below."
        badge={
          <div className="flex items-center gap-2">
            <ScoreBadge score={assessment.overallScore} band={assessment.overallBand} />
            <DataSourceBadge state="demo" source="sample data" />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">
              Generated{' '}
              {new Date(assessment.generatedAt).toLocaleTimeString([], {
                hour:   '2-digit',
                minute: '2-digit',
              })}
            </p>
            <Button icon={RefreshCw} variant="ghost">Refresh</Button>
          </div>
        }
      />

      {/* Data quality warning */}
      {assessment.dataQualityWarning && (
        <Card className="px-4 py-3 border-red-500/30 bg-red-900/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">
              Some telemetry sources were unavailable during this run. Scores may
              be lower than actual maturity.
            </p>
          </div>
        </Card>
      )}

      {/* Pillar StatCards summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {assessment.pillars.map((p) => (
          <div key={p.pillar} className="relative">
            <StatCard
              icon={
                p.pillar === 'security'
                  ? ShieldCheck
                  : p.pillar === 'management'
                  ? Settings2
                  : BarChart3
              }
              label={p.label}
              value={`${p.averageScore.toFixed(1)} / 4`}
              tone={
                p.band === 'optimised' || p.band === 'managed'
                  ? 'emerald'
                  : p.band === 'developing'
                  ? 'amber'
                  : 'red'
              }
              sublabel={BAND_TEXT[p.band]}
            />
            <div className="absolute top-4 right-4">
              <InfoTip label={`${p.label} Pillar`}>
                Maturity score for the {p.label.toLowerCase()} pillar. Sample data until live assessment connected.
              </InfoTip>
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <section>
        <SectionTitle icon={Layers}>Pillar Heatmap</SectionTitle>
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
        <SectionTitle icon={ShieldCheck}>Control Details</SectionTitle>
        {assessment.pillars.map((p) => (
          <PillarCard key={p.pillar} pillar={p} />
        ))}
      </section>

      {/* Pending actions */}
      <section className="space-y-3">
        <SectionTitle icon={ClipboardList} right={
          <Badge variant={pending.length === 0 ? 'success' : 'warning'}>
            {pending.length} pending
          </Badge>
        }>
          Pending Actions
        </SectionTitle>
        <PendingActionsPanel items={pending} />
      </section>

      {/* Source split */}
      <section>
        <SectionTitle icon={Activity}>Auto-Derived vs Manual Questionnaire</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                Auto-Derived
              </p>
              <Badge variant="info">{assessment.autoDerived.length}</Badge>
            </div>
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
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                Manual Questionnaire
              </p>
              <Badge variant="neutral">{assessment.manualQuestionnaire.length}</Badge>
            </div>
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
          </Card>
        </div>
      </section>
    </div>
  );
}
