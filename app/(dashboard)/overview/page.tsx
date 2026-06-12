'use client';

/**
 * AgentLens - Executive Overview Dashboard
 *
 * Renders KPI cards + trend charts using Recharts and mock seed data.
 * All data is loaded client-side from the mock seed so the page works fully offline.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

import { computeExecPosture, type KpiCard, type TrendSeries } from '@/lib/reporting/exec';
import {
  mockAgents,
  mockEnvironments,
  mockMetrics,
  mockAlerts,
  mockCapacity,
  mockViolations,
  mockMaturityResults,
  mockConversationKpis,
  mockHealthMetrics,
} from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Derive posture once (this is a client component so it runs in the browser)
// ---------------------------------------------------------------------------
const posture = computeExecPosture({
  agents: mockAgents,
  environments: mockEnvironments,
  metrics: mockMetrics,
  alerts: mockAlerts,
  capacity: mockCapacity,
  violations: mockViolations,
  maturityResults: mockMaturityResults,
  conversationKpis: mockConversationKpis,
  healthMetrics: mockHealthMetrics,
});

// ---------------------------------------------------------------------------
// Sentiment -> colour mapping (Tailwind dark-theme)
// ---------------------------------------------------------------------------
const sentimentBorder: Record<KpiCard['sentiment'], string> = {
  positive: 'border-emerald-500',
  negative: 'border-red-500',
  warning: 'border-amber-400',
  neutral: 'border-slate-600',
};

const sentimentText: Record<KpiCard['sentiment'], string> = {
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  warning: 'text-amber-400',
  neutral: 'text-slate-300',
};

const trendIcon: Record<NonNullable<KpiCard['trend']>, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

// ---------------------------------------------------------------------------
// KPI Card component
// ---------------------------------------------------------------------------
function KpiCardBox({ card }: { card: KpiCard }) {
  return (
    <div
      className={`rounded-xl border-l-4 bg-slate-800 p-4 shadow-sm flex flex-col gap-1 ${sentimentBorder[card.sentiment]}`}
    >
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{card.label}</p>
      <p className={`text-2xl font-bold tabular-nums ${sentimentText[card.sentiment]}`}>
        {String(card.value)}
        {card.trend && (
          <span className="ml-2 text-base opacity-70">{trendIcon[card.trend]}</span>
        )}
      </p>
      {card.unit && <p className="text-xs text-slate-500">{card.unit}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart component
// ---------------------------------------------------------------------------
function TrendLineChart({
  series,
  color,
  yFormat,
}: {
  series: TrendSeries;
  color: string;
  yFormat?: (v: number) => string;
}) {
  return (
    <div className="rounded-xl bg-slate-800 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{series.label}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={series.data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yFormat}
            width={50}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8', fontSize: 12 }}
            itemStyle={{ color: color }}
            formatter={(v: number) => [yFormat ? yFormat(v) : v, series.label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capacity bar chart
// ---------------------------------------------------------------------------
function CapacityChart() {
  const data = posture.capacityRows.map((r) => ({
    name: r.envName.replace('AgentLens-', '').replace('Default Environment', 'Default'),
    pct: r.pct,
    overage: r.overage,
  }));

  return (
    <div className="rounded-xl bg-slate-800 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">Credit Capacity by Environment</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 120]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, 'Usage']}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.overage ? '#ef4444' : entry.pct >= 80 ? '#f59e0b' : '#10b981'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle pie chart
// ---------------------------------------------------------------------------
const LIFECYCLE_COLORS: Record<string, string> = {
  prod: '#10b981',
  pilot: '#3b82f6',
  poc: '#a78bfa',
};

function LifecyclePieChart() {
  const data = posture.lifecycleDist.map((d) => ({
    name: d.stage.toUpperCase(),
    value: d.count,
    pct: d.pct,
  }));

  return (
    <div className="rounded-xl bg-slate-800 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">Agent Lifecycle Distribution</h3>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={LIFECYCLE_COLORS[entry.name.toLowerCase()] ?? '#64748b'}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              itemStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs text-slate-300">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: LIFECYCLE_COLORS[d.name.toLowerCase()] ?? '#64748b' }}
              />
              <span className="font-medium">{d.name}</span>
              <span className="text-slate-500">
                {d.value} agent{d.value !== 1 ? 's' : ''} ({d.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maturity score visual
// ---------------------------------------------------------------------------
function MaturityScoreCard() {
  const score = posture.maturityScore;
  const pct = (score / 4) * 100;
  const color = score >= 3 ? '#10b981' : score >= 2 ? '#f59e0b' : '#ef4444';

  return (
    <div className="rounded-xl bg-slate-800 p-4 shadow-sm flex flex-col items-center justify-center gap-3">
      <h3 className="text-sm font-semibold text-slate-300">Maturity Score</h3>
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#334155" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${pct} 100`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute text-xl font-bold tabular-nums"
          style={{ color }}
        >
          {score.toFixed(1)}
        </span>
      </div>
      <p className="text-xs text-slate-500">out of 4.0</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const { kpiCards, costTrend, sessionTrend, deflectionTrend, errorRateTrend } = posture;

  return (
    <main className="min-h-screen bg-slate-900 p-6 text-slate-100">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Tenant posture snapshot - mock data - generated{' '}
            <span className="text-slate-300">{posture.generatedAt.slice(0, 10)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/report?format=json"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 transition-colors"
          >
            JSON
          </a>
          <a
            href="/api/report?format=markdown"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 transition-colors"
          >
            MD
          </a>
          <a
            href="/api/report?format=html"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
          >
            HTML Report
          </a>
        </div>
      </div>

      {/* KPI Cards grid */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Key Performance Indicators
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {kpiCards.map((card) => (
            <KpiCardBox key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* Trend charts - row 1: cost + sessions */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Trends
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TrendLineChart
            series={costTrend}
            color="#10b981"
            yFormat={(v) => `$${v.toFixed(0)}`}
          />
          <TrendLineChart
            series={sessionTrend}
            color="#3b82f6"
          />
        </div>
      </section>

      {/* Trend charts - row 2: deflection + error rate */}
      <section className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TrendLineChart
            series={deflectionTrend}
            color="#a78bfa"
            yFormat={(v) => `${(v * 100).toFixed(1)}%`}
          />
          <TrendLineChart
            series={errorRateTrend}
            color="#f87171"
            yFormat={(v) => `${(v * 100).toFixed(2)}%`}
          />
        </div>
      </section>

      {/* Bottom row: capacity + lifecycle + maturity */}
      <section className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <CapacityChart />
          </div>
          <div className="md:col-span-1">
            <LifecyclePieChart />
          </div>
          <div className="md:col-span-1">
            <MaturityScoreCard />
          </div>
        </div>
      </section>

      {/* Capacity detail table */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Environment Capacity Detail
        </h2>
        <div className="overflow-x-auto rounded-xl bg-slate-800 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Environment', 'Credits Used', 'Credit Limit', 'Usage %', 'Status'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {posture.capacityRows.map((row) => (
                <tr
                  key={row.envId}
                  className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-200">{row.envName}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">
                    {row.creditUsed.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">
                    {row.creditLimit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.min(row.pct, 100)}%`,
                            background: row.overage
                              ? '#ef4444'
                              : row.pct >= 80
                                ? '#f59e0b'
                                : '#10b981',
                          }}
                        />
                      </div>
                      <span
                        className={
                          row.overage
                            ? 'text-red-400'
                            : row.pct >= 80
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }
                      >
                        {row.pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.overage ? (
                      <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400">
                        OVERAGE
                      </span>
                    ) : row.pct >= 80 ? (
                      <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-400">
                        Near limit
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-600" suppressHydrationWarning>
        AgentLens v2 - Mock seed data - {posture.generatedAt}
      </footer>
    </main>
  );
}
