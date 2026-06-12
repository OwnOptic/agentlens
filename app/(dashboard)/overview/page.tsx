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
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  LayoutDashboard,
  Bot,
  DollarSign,
  ShieldCheck,
  Bell,
  Gauge,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Users,
  Activity,
  FileText,
  Download,
  RefreshCw,
  Workflow,
  Network,
  type LucideIcon,
} from 'lucide-react';

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
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
  type Tone,
} from '@/components/ui';

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
// KPI id -> icon + tone mapping
// ---------------------------------------------------------------------------
const KPI_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  'total-agents':      { icon: Bot,          tone: 'emerald' },
  'daily-cost':        { icon: DollarSign,   tone: 'amber'   },
  'compliance-score':  { icon: ShieldCheck,  tone: 'sky'     },
  'open-alerts':       { icon: Bell,         tone: 'red'     },
  'capacity-overage':  { icon: Gauge,        tone: 'amber'   },
  'maturity-score':    { icon: Sparkles,     tone: 'violet'  },
  'deflection-rate':   { icon: TrendingUp,   tone: 'emerald' },
  'avg-error-rate':    { icon: Activity,     tone: 'red'     },
  'orphan-agents':     { icon: Users,        tone: 'amber'   },
};

// sentiment -> StatCard delta prop
const SENTIMENT_DELTA: Record<KpiCard['sentiment'], 'up' | 'down' | 'flat'> = {
  positive: 'up',
  negative: 'down',
  warning:  'flat',
  neutral:  'flat',
};

// sentiment -> tone override when the KPI_META tone should be colored by status
const SENTIMENT_TONE: Record<KpiCard['sentiment'], Tone> = {
  positive: 'emerald',
  negative: 'red',
  warning:  'amber',
  neutral:  'slate',
};

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
    <Card className="p-4">
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
    </Card>
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
    <Card className="p-4">
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
    </Card>
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
    <Card className="p-4">
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
    </Card>
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
    <Card className="p-4 flex flex-col items-center justify-center gap-3">
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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const { kpiCards, costTrend, sessionTrend, deflectionTrend, errorRateTrend } = posture;

  return (
    <div className="p-8">
      <PageHeader
        icon={LayoutDashboard}
        title="Executive Overview"
        subtitle={`Tenant posture snapshot - mock data - generated ${posture.generatedAt.slice(0, 10)}`}
        badge={<Badge variant="neutral">Mock data</Badge>}
        actions={
          <>
            <Button icon={FileText} href="/api/report?format=json" target="_blank" rel="noreferrer" variant="ghost">
              JSON
            </Button>
            <Button icon={RefreshCw} href="/api/report?format=markdown" target="_blank" rel="noreferrer" variant="ghost">
              MD
            </Button>
            <Button icon={Download} href="/api/report?format=html" target="_blank" rel="noreferrer" variant="primary">
              HTML Report
            </Button>
          </>
        }
        tone="emerald"
      />

      {/* KPI Cards grid */}
      <section className="mb-8">
        <SectionTitle icon={Sparkles}>Key Performance Indicators</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {kpiCards.map((card) => {
            const meta = KPI_META[card.id] ?? { icon: Activity, tone: 'slate' as Tone };
            const tone: Tone = SENTIMENT_TONE[card.sentiment];
            return (
              <StatCard
                key={card.id}
                icon={meta.icon}
                label={card.label}
                value={String(card.value)}
                sublabel={card.unit}
                delta={SENTIMENT_DELTA[card.sentiment]}
                tone={tone}
              />
            );
          })}
        </div>
      </section>

      {/* Trend charts - row 1: cost + sessions */}
      <section className="mb-6">
        <SectionTitle icon={TrendingUp}>Trends</SectionTitle>
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
        <SectionTitle icon={Gauge}>Environment Health</SectionTitle>
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
        <SectionTitle icon={Network}>Environment Capacity Detail</SectionTitle>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Environment', 'Credits Used', 'Credit Limit', 'Usage %', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posture.capacityRows.map((row) => (
                  <tr
                    key={row.envId}
                    className="border-b border-slate-800/50 last:border-0 transition-colors hover:bg-slate-800/30"
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
                        <Badge variant="critical">OVERAGE</Badge>
                      ) : row.pct >= 80 ? (
                        <Badge variant="warning">Near limit</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-600" suppressHydrationWarning>
        AgentLens v2 - Mock seed data - {posture.generatedAt}
      </footer>
    </div>
  );
}
