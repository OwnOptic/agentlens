'use client';

import React, { useEffect, useState } from 'react';
import type { HealthMetric } from '@/lib/types';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Hash, Percent, Timer, Bot } from 'lucide-react';
import { PageHeader, DataSourceBadge, StatCard, SectionTitle, Card, Badge } from '@/components/ui';
import { SkeletonTable } from '@/components/Skeleton';


interface AgentHealthSummary {
  botId: string;
  envId: string;
  latestDate: string;
  latestErrorRate: number;
  latestLatencyMs: number;
  latestFailedSessions: number;
  avgErrorRate: number;
  avgLatencyMs: number;
  totalFailedSessions: number;
  trend: 'improving' | 'stable' | 'degrading';
}

function HealthPage() {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentSummaries, setAgentSummaries] = useState<AgentHealthSummary[]>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('Failed to fetch health metrics');
        }
        const body = await response.json() as { metrics: HealthMetric[] };
        const data: HealthMetric[] = body.metrics ?? [];
        setMetrics(data);

        // Compute per-agent summaries
        const summariesMap: Record<string, HealthMetric[]> = {};
        data.forEach((m) => {
          const key = `${m.envId}/${m.botId}`;
          if (!summariesMap[key]) {
            summariesMap[key] = [];
          }
          summariesMap[key].push(m);
        });

        const summaries: AgentHealthSummary[] = Object.entries(summariesMap).map(
          ([key, items]) => {
            const sorted = items.sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const latest = sorted[0];
            const avg = {
              errorRate:
                items.reduce((sum, m) => sum + m.errorRate, 0) / items.length,
              latencyMs:
                items.reduce((sum, m) => sum + m.avgLatencyMs, 0) / items.length,
              failedSessions: items.reduce((sum, m) => sum + m.failedSessions, 0),
            };

            // Determine trend based on comparison of first and last items
            let trend: 'improving' | 'stable' | 'degrading' = 'stable';
            if (sorted.length > 1) {
              const oldest = sorted[sorted.length - 1];
              const delta = latest.errorRate - oldest.errorRate;
              if (delta < -0.005) trend = 'improving';
              else if (delta > 0.005) trend = 'degrading';
            }

            const [envId, botId] = key.split('/');
            return {
              botId,
              envId,
              latestDate: latest.date,
              latestErrorRate: latest.errorRate,
              latestLatencyMs: latest.avgLatencyMs,
              latestFailedSessions: latest.failedSessions,
              avgErrorRate: avg.errorRate,
              avgLatencyMs: avg.latencyMs,
              totalFailedSessions: avg.failedSessions,
              trend,
            };
          }
        );

        setAgentSummaries(
          summaries.sort((a, b) => b.latestErrorRate - a.latestErrorRate)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const getErrorRateVariant = (rate: number): 'critical' | 'warning' | 'success' => {
    if (rate > 0.05) return 'critical';
    if (rate > 0.02) return 'warning';
    return 'success';
  };

  const getLatencyVariant = (latencyMs: number): 'critical' | 'warning' | 'success' => {
    if (latencyMs > 1500) return 'critical';
    if (latencyMs > 1000) return 'warning';
    return 'success';
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving':
        return '↑';
      case 'degrading':
        return '↓';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: string): string => {
    switch (trend) {
      case 'improving':
        return 'text-green-400';
      case 'degrading':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader
          icon={Activity}
          title="Agent Health"
          subtitle="Operational health per agent. Connect Azure App Insights to see live data."
          badge={<DataSourceBadge state="demo" source="sample data" />}
          tone="emerald"
        />
        <SkeletonTable rowCount={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageHeader
          icon={Activity}
          title="Agent Health"
          subtitle="Operational health per agent. Connect Azure App Insights to see live data."
          badge={<DataSourceBadge state="demo" source="sample data" />}
          tone="emerald"
        />
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  // Calculate aggregate health metrics
  const totalFailedSessions = metrics.reduce((sum, m) => sum + m.failedSessions, 0);
  const avgErrorRate =
    metrics.length > 0
      ? (metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length * 100).toFixed(2)
      : '0';
  const avgLatency =
    metrics.length > 0
      ? (metrics.reduce((sum, m) => sum + m.avgLatencyMs, 0) / metrics.length).toFixed(0)
      : '0';

  const healthyAgents = agentSummaries.filter((a) => a.latestErrorRate < 0.02).length;
  const warningAgents = agentSummaries.filter(
    (a) => a.latestErrorRate >= 0.02 && a.latestErrorRate < 0.05
  ).length;
  const criticalAgents = agentSummaries.filter((a) => a.latestErrorRate >= 0.05).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <PageHeader
        icon={Activity}
        title="Agent Health"
        subtitle="Operational health per agent. Connect Azure App Insights to see live data."
        badge={<DataSourceBadge state="demo" source="sample data" />}
        tone="emerald"
      />

      {/* Health Status Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard icon={CheckCircle2} label="Healthy Agents" value={healthyAgents} sublabel="Error rate < 2%" tone="emerald" />
        <StatCard icon={AlertTriangle} label="Warning Agents" value={warningAgents} sublabel="Error rate 2-5%" tone="amber" />
        <StatCard icon={XCircle} label="Critical Agents" value={criticalAgents} sublabel="Error rate > 5%" tone="red" />
        <StatCard icon={Hash} label="Total Failed Sessions" value={totalFailedSessions} sublabel="Across all agents" tone="slate" />
      </div>

      {/* Aggregate Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard icon={Percent} label="Avg Error Rate" value={`${avgErrorRate}%`} sublabel="Across all agents" tone="slate" />
        <StatCard icon={Timer} label="Avg Latency" value={`${avgLatency} ms`} sublabel="Mean response time" tone="slate" />
        <StatCard icon={Bot} label="Agents Monitored" value={agentSummaries.length} sublabel="Unique bots with metrics" tone="sky" />
      </div>

      {/* Per-Agent Health Table */}
      {agentSummaries.length > 0 && (
        <Card className="p-6 mb-8">
          <SectionTitle icon={Activity}>Per-Agent Health Metrics</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300 font-medium">Bot ID</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-medium">Environment</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-medium">Latest Date</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-medium">Current Error Rate</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-medium">Avg Error Rate</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-medium">Current Latency</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-medium">Avg Latency</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-medium">Failed Sessions</th>
                  <th className="text-center py-3 px-4 text-slate-300 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {agentSummaries.map((summary) => (
                  <tr key={`${summary.envId}/${summary.botId}`} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-slate-300 font-mono text-xs">
                      {summary.botId.substring(0, 20)}...
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{summary.envId}</td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{summary.latestDate}</td>
                    <td className="py-3 px-4 text-right">
                      <Badge variant={getErrorRateVariant(summary.latestErrorRate)}>
                        {(summary.latestErrorRate * 100).toFixed(2)}%
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {(summary.avgErrorRate * 100).toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Badge variant={getLatencyVariant(summary.latestLatencyMs)}>
                        {summary.latestLatencyMs} ms
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {Math.round(summary.avgLatencyMs)} ms
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {summary.totalFailedSessions}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-lg font-bold ${getTrendColor(summary.trend)}`}>
                        {getTrendIcon(summary.trend)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Error Rate Distribution Chart */}
      {agentSummaries.length > 0 && (
        <Card className="p-6 mb-8">
          <SectionTitle icon={Percent}>Error Rate Distribution</SectionTitle>
          <div className="space-y-2">
            {agentSummaries.slice(0, 10).map((summary) => (
              <div key={`chart-${summary.botId}`} className="flex items-center gap-3">
                <div className="w-32 truncate text-xs text-slate-400">
                  {summary.botId.substring(0, 30)}
                </div>
                <div className="flex-1 bg-slate-800 rounded h-6 overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      summary.latestErrorRate > 0.05
                        ? 'bg-red-600'
                        : summary.latestErrorRate > 0.02
                          ? 'bg-amber-600'
                          : 'bg-green-600'
                    }`}
                    style={{
                      width: `${Math.min(summary.latestErrorRate * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className="w-16 text-right text-xs text-slate-300">
                  {(summary.latestErrorRate * 100).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Latency Trend Chart */}
      {agentSummaries.length > 0 && (
        <Card className="p-6">
          <SectionTitle icon={Timer}>Latency by Agent (Top 10)</SectionTitle>
          <div className="space-y-2">
            {agentSummaries
              .slice(0, 10)
              .sort((a, b) => b.latestLatencyMs - a.latestLatencyMs)
              .map((summary) => (
                <div key={`latency-${summary.botId}`} className="flex items-center gap-3">
                  <div className="w-32 truncate text-xs text-slate-400">
                    {summary.botId.substring(0, 30)}
                  </div>
                  <div className="flex-1 bg-slate-800 rounded h-6 overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        summary.latestLatencyMs > 1500
                          ? 'bg-red-600'
                          : summary.latestLatencyMs > 1000
                            ? 'bg-amber-600'
                            : 'bg-green-600'
                      }`}
                      style={{
                        width: `${Math.min((summary.latestLatencyMs / 2000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-slate-300">
                    {summary.latestLatencyMs} ms
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {agentSummaries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400">No health metrics available yet.</p>
        </div>
      )}
    </div>
  );
}

export default HealthPage;
