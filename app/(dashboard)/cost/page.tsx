'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type {
  AgentMetricDaily,
  Capacity,
  Agent,
  CreditBreakdown,
} from '@/lib/types';
import { mockMetrics, mockCapacity, mockAgents } from '@/lib/mock/seed';
import {
  baseline7Day,
  mtdCost,
  formatCost,
  featurePercentages,
  aggregateFeatureBreakdown,
} from '@/lib/cost/projections';
import {
  DollarSign,
  TrendingUp,
  Activity,
  Boxes,
  Gauge,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
  DataSourceBadge,
  InfoTip,
} from '@/components/ui';
import { SkeletonCard } from '@/components/Skeleton';

interface TopBurner {
  agent: Agent | undefined;
  mtdCost: number;
  projectedMonthly: number;
  avgDaily: number;
  estimatedLabel: string;
}

interface CostSummary {
  totalMtd: number;
  totalProjectedMonthly: number;
  totalBaseline7: number;
  totalBaseline30: number;
  agentCount: number;
  topBurnerCount: number;
}

const COLORS = ['#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6'];

const featureLabels: Record<string, string> = {
  generativeAnswers: 'Generative Answers',
  agentActions: 'Agent Actions',
  agentFlows: 'Agent Flows',
  textTools: 'Text Tools',
};

export default function CostPage() {
  const [data, setData] = useState<{
    metrics: AgentMetricDaily[];
    capacity: Capacity[];
    topBurners: TopBurner[];
    summary: CostSummary;
    timestamp: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    async function fetchCostData() {
      setFetchError(false);
      try {
        const res = await fetch('/api/cost');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Failed to fetch cost data:', error);
        setFetchError(true);
        // Still populate with mock so the rest of the page renders
        setData({
          metrics: mockMetrics,
          capacity: mockCapacity,
          topBurners: mockMetrics
            .slice(0, 3)
            .map((m) => ({
              agent: mockAgents.find(
                (a) => a.envId === m.envId && a.botId === m.botId
              ),
              mtdCost: m.estimatedCost,
              projectedMonthly: m.projectedMonthly || 0,
              avgDaily: m.estimatedCost,
              estimatedLabel: '(estimated)',
            })),
          summary: {
            totalMtd: mtdCost(mockMetrics),
            totalProjectedMonthly: mockMetrics.reduce(
              (sum, m) => sum + (m.projectedMonthly || 0),
              0
            ),
            totalBaseline7: baseline7Day(mockMetrics),
            totalBaseline30: 0,
            agentCount: new Set(
              mockMetrics.map((m) => `${m.envId}/${m.botId}`)
            ).size,
            topBurnerCount: 3,
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    }

    fetchCostData();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-8">
        <PageHeader
          icon={DollarSign}
          title="Cost & Capacity"
          subtitle="Monitor credit consumption, projections, and environment capacity"
          tone="emerald"
          badge={<DataSourceBadge state="demo" source="sample data" />}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Prepare trend chart data (last 7 days)
  const trendData = data.metrics
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((m) => ({
      date: m.date,
      cost: m.estimatedCost,
      sessions: m.sessionCount,
    }));

  // Prepare feature breakdown data
  const aggregatedBreakdown = aggregateFeatureBreakdown(data.metrics);
  const percentages = featurePercentages(aggregatedBreakdown);
  const featureChartData = [
    {
      name: featureLabels.generativeAnswers,
      value: percentages.generativeAnswers,
    },
    {
      name: featureLabels.agentActions,
      value: percentages.agentActions,
    },
    {
      name: featureLabels.agentFlows,
      value: percentages.agentFlows,
    },
    {
      name: featureLabels.textTools,
      value: percentages.textTools,
    },
  ];

  return (
    <div className="p-8">
      <PageHeader
        icon={DollarSign}
        title="Cost & Capacity"
        subtitle="Monitor credit consumption, projections, and environment capacity"
        tone="emerald"
        badge={
          <div className="flex items-center gap-2">
            <DataSourceBadge state="demo" source="sample data" />
            <span className="text-xs text-slate-500" suppressHydrationWarning>
              Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          </div>
        }
      />

      {fetchError && (
        <Card className="mb-6 flex items-center gap-3 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            Live cost data unavailable - showing sample data. Check the API connection.
          </p>
        </Card>
      )}

      {/* Cost Summary StatCards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="MTD Cost"
          value={
            <span className="inline-flex items-center gap-1.5">
              {formatCost(data.summary.totalMtd)}
              <InfoTip>Sample figure - connect the PPAC Licensing API to see real MTD cost.</InfoTip>
            </span>
          }
          sublabel="sample data"
          tone="emerald"
        />
        <StatCard
          icon={TrendingUp}
          label="Projected Monthly"
          value={
            <span className="inline-flex items-center gap-1.5">
              {formatCost(data.summary.totalProjectedMonthly)}
              <InfoTip>Sample figure - projected monthly spend derived from seed data until a live source is wired.</InfoTip>
            </span>
          }
          sublabel="sample data"
          tone="sky"
        />
        <StatCard
          icon={Activity}
          label="7-Day Baseline"
          value={
            <span className="inline-flex items-center gap-1.5">
              {formatCost(data.summary.totalBaseline7)}
              <InfoTip>Sample figure - 7-day rolling baseline from seed metrics.</InfoTip>
            </span>
          }
          sublabel="sample data"
          tone="violet"
        />
        <StatCard
          icon={Boxes}
          label="Active Agents"
          value={
            <span className="inline-flex items-center gap-1.5">
              {data.summary.agentCount}
              <InfoTip>Count from sample seed data - not your live tenant.</InfoTip>
            </span>
          }
          sublabel="sample data"
          tone="slate"
        />
      </div>

      {/* Top Burners Table */}
      <Card className="mb-8 p-6">
        <SectionTitle icon={TrendingUp}>Top Cost Drivers (Last 7 Days)</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Agent</th>
                <th className="px-4 py-2 text-left font-medium">Environment</th>
                <th className="px-4 py-2 text-right font-medium">MTD Cost</th>
                <th className="px-4 py-2 text-right font-medium">Projected Monthly</th>
                <th className="px-4 py-2 text-right font-medium">Avg Daily</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.topBurners.slice(0, 5).map((burner, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-emerald-300">
                      {burner.agent?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {burner.agent?.lifecycle || 'untagged'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {burner.agent?.envId || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-right text-sky-400">
                    {formatCost(burner.mtdCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                    {formatCost(burner.projectedMonthly)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {formatCost(burner.avgDaily)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts Row */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost Trend */}
        <Card className="p-6">
          <SectionTitle icon={Activity}>Daily Cost Trend</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatCost(value)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ fill: '#06b6d4', r: 4 }}
                activeDot={{ r: 6 }}
                name="Daily Cost (USD)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Feature Breakdown */}
        <Card className="p-6">
          <SectionTitle icon={DollarSign}>Feature Breakdown (by credits)</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={featureChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) =>
                  `${name}: ${value.toFixed(1)}%`
                }
                outerRadius={100}
                fill="#06b6d4"
                dataKey="value"
              >
                {featureChartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value.toFixed(2)}%`}
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Environment Capacity Gauges */}
      <Card className="mb-8 p-6">
        <SectionTitle icon={Gauge}>Environment Capacity</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.capacity.map((cap) => {
            const envName =
              data.metrics
                .find((m) => m.envId === cap.envId)
                ?.envId?.split('-')
                .slice(1)
                .join('-') || cap.envId;

            return (
              <Card key={cap.envId} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium text-slate-300">{envName}</p>
                  <Badge variant={cap.overage ? 'critical' : 'success'}>
                    {cap.overage ? 'OVERAGE' : 'OK'}
                  </Badge>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-slate-400">
                      {cap.creditUsed.toLocaleString()} /{' '}
                      {cap.creditLimit.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-slate-300">
                      {cap.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        cap.overage
                          ? 'bg-red-500'
                          : cap.pct > 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(cap.pct, 100)}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      {/* Data Note */}
      <Card className="p-4">
        <p className="text-xs text-slate-500">
          All costs are <strong>estimated</strong> based on daily metrics and
          Copilot Studio consumption meters. For production usage, consult your
          Power Platform billing dashboard. Capacity overage is triggered when
          creditUsed exceeds creditLimit.
        </p>
      </Card>
    </div>
  );
}
