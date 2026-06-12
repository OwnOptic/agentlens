'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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

  useEffect(() => {
    async function fetchCostData() {
      try {
        const res = await fetch('/api/cost');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Failed to fetch cost data:', error);
        // Fallback to mock
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
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Loading cost data...</p>
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
    <div className="min-h-screen bg-slate-950 p-8 text-slate-50">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Cost & Capacity</h1>
        <p className="text-slate-400">
          Monitor credit consumption, projections, and environment capacity
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Last updated: {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </div>

      {/* Cost Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <p className="text-sm font-medium text-slate-400">MTD Cost</p>
          <p className="text-2xl font-bold text-emerald-400">
            {formatCost(data.summary.totalMtd)}
          </p>
          <p className="text-xs text-slate-500 mt-1">(estimated)</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <p className="text-sm font-medium text-slate-400">
            Projected Monthly
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {formatCost(data.summary.totalProjectedMonthly)}
          </p>
          <p className="text-xs text-slate-500 mt-1">(estimated)</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <p className="text-sm font-medium text-slate-400">
            7-Day Baseline
          </p>
          <p className="text-2xl font-bold text-cyan-400">
            {formatCost(data.summary.totalBaseline7)}
          </p>
          <p className="text-xs text-slate-500 mt-1">(estimated)</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <p className="text-sm font-medium text-slate-400">Active Agents</p>
          <p className="text-2xl font-bold text-blue-400">
            {data.summary.agentCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">with cost data</p>
        </div>
      </div>

      {/* Top Burners Table */}
      <div className="mb-8 rounded-lg border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">
          Top Cost Drivers (Last 7 Days)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Agent</th>
                <th className="px-4 py-2 text-left font-medium">Environment</th>
                <th className="px-4 py-2 text-right font-medium">
                  MTD Cost
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Projected Monthly
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Avg Daily
                </th>
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
                  <td className="px-4 py-3 text-right text-cyan-400">
                    {formatCost(burner.mtdCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                    {formatCost(burner.projectedMonthly)}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-400">
                    {formatCost(burner.avgDaily)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Row */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost Trend */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Daily Cost Trend
          </h3>
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
        </div>

        {/* Feature Breakdown */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Feature Breakdown (by credits)
          </h3>
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
        </div>
      </div>

      {/* Environment Capacity Gauges */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Environment Capacity
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.capacity.map((cap) => {
            const envName = data.metrics
              .find((m) => m.envId === cap.envId)
              ?.envId?.split('-')
              .slice(1)
              .join('-') || cap.envId;

            return (
              <div
                key={cap.envId}
                className="rounded-lg border border-slate-700 bg-slate-800 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium text-slate-300">{envName}</p>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      cap.overage
                        ? 'bg-red-900 text-red-200'
                        : 'bg-emerald-900 text-emerald-200'
                    }`}
                  >
                    {cap.overage ? 'OVERAGE' : 'OK'}
                  </span>
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
                            ? 'bg-yellow-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(cap.pct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Note */}
      <div className="mt-8 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500">
          All costs are <strong>estimated</strong> based on daily metrics and
          Copilot Studio consumption meters. For production usage, consult your
          Power Platform billing dashboard. Capacity overage is triggered when
          creditUsed exceeds creditLimit.
        </p>
      </div>
    </div>
  );
}
