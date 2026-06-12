import React from 'react';
import { ArrowDown, Database, Cloud, BarChart3, Sparkles, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';

/**
 * Data-flow diagram: which real source feeds which AgentLens feature, and what's
 * connected right now. Transparency-first - shows live vs not-connected at a glance.
 */

export type SourceState = 'live' | 'not_connected';

export interface FlowSource {
  key: string;
  label: string;       // e.g. "Azure Resource Graph"
  powers: string;      // e.g. "Inventory, Sprawl, Discovery, Overview"
  state: SourceState;
  role: string;        // required role/token
}

const SOURCE_ICON: Record<string, LucideIcon> = {
  arg: Cloud,
  dataverse: Database,
  licensing: BarChart3,
  appinsights: BarChart3,
  openai: Sparkles,
  graph: ShieldCheck,
};

function Chip({ label, state }: { label: string; state: SourceState }) {
  const live = state === 'live';
  return (
    <div
      className={[
        'rounded-lg border px-3 py-2 text-xs font-medium',
        live ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/60 text-slate-400',
      ].join(' ')}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{ background: live ? '#10b981' : '#64748b' }} />
      {label}
    </div>
  );
}

export function DataFlowDiagram({ sources }: { sources: FlowSource[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">How AgentLens gets its data</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> connected</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> not connected</span>
        </div>
      </div>

      {/* Sources band */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Data sources (Microsoft APIs)</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => {
          const Icon = SOURCE_ICON[s.key] ?? Cloud;
          return (
            <div key={s.key} className="group relative">
              <div className={['flex items-center gap-1.5', ].join(' ')}>
                <Chip label={s.label} state={s.state} />
              </div>
              {/* hover detail */}
              <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-60 rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-300 shadow-xl group-hover:block">
                <div className="flex items-center gap-1.5 font-medium text-slate-200"><Icon className="h-3.5 w-3.5" /> {s.label}</div>
                <p className="mt-1 text-slate-400">Powers: {s.powers}</p>
                <p className="mt-0.5 text-slate-500">Requires: {s.role}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-3 flex justify-center"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      {/* AgentLens band */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 py-2.5 text-center">
        <span className="text-sm font-semibold text-emerald-300">AgentLens</span>
        <span className="ml-2 text-xs text-slate-400">ingest · analyze (intent/sentiment) · govern · alert</span>
      </div>

      <div className="my-3 flex justify-center"><ArrowDown className="h-4 w-4 text-slate-600" /></div>

      {/* Surfaces band */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Surfaces (what you see)</p>
      <div className="flex flex-wrap gap-2">
        {['Overview', 'Inventory', 'Discovery', 'Conversation KPIs', 'Compliance', 'Cost', 'Health', 'Ask (AI)'].map((f) => (
          <span key={f} className="rounded-md bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 ring-1 ring-slate-700">{f}</span>
        ))}
      </div>
    </Card>
  );
}
