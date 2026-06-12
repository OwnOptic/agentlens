'use client';

import React, { useEffect, useState } from 'react';
import type { ConversationKpi } from '@/lib/types';


interface ChartDataPoint {
  date: string;
  sessions: number;
  deflectionRate: number;
  escalationRate: number;
}

function ConversationKpisPage() {
  const [kpis, setKpis] = useState<ConversationKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aggregate data by date for trend analysis
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  useEffect(() => {
    const fetchKpis = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/kpis');
        if (!response.ok) {
          throw new Error('Failed to fetch KPIs');
        }
        const data: ConversationKpi[] = await response.json();
        setKpis(data);

        // Aggregate by date for trend charts
        const aggregates: Record<string, ChartDataPoint> = {};
        data.forEach((kpi) => {
          if (!aggregates[kpi.date]) {
            aggregates[kpi.date] = {
              date: kpi.date,
              sessions: 0,
              deflectionRate: 0,
              escalationRate: 0,
            };
          }
          aggregates[kpi.date].sessions += kpi.sessions;
          // Average the rates
          const currentCnt = aggregates[kpi.date];
          currentCnt.deflectionRate =
            (currentCnt.deflectionRate + kpi.deflectionRate) / 2;
          currentCnt.escalationRate =
            (currentCnt.escalationRate + kpi.escalationRate) / 2;
        });

        const sortedChart = Object.values(aggregates).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setChartData(sortedChart);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchKpis();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Conversation KPIs</h1>
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Conversation KPIs</h1>
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  // Calculate aggregate metrics
  const totalSessions = kpis.reduce((sum, k) => sum + k.sessions, 0);
  const avgDeflection =
    kpis.length > 0
      ? (kpis.reduce((sum, k) => sum + k.deflectionRate, 0) / kpis.length * 100).toFixed(1)
      : '0';
  const avgEscalation =
    kpis.length > 0
      ? (kpis.reduce((sum, k) => sum + k.escalationRate, 0) / kpis.length * 100).toFixed(1)
      : '0';

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Conversation KPIs</h1>
        <p className="text-slate-400">
          Aggregate conversation health metrics: volume, deflection, escalation.
          <br />
          Data is aggregated across all agents - no conversation content or user identifiers included.
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="text-sm font-medium text-slate-400 mb-2">Total Sessions</div>
          <div className="text-3xl font-bold text-emerald-400">{totalSessions}</div>
          <div className="text-xs text-slate-500 mt-2">Across all agents, all dates</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="text-sm font-medium text-slate-400 mb-2">Avg Deflection Rate</div>
          <div className="text-3xl font-bold text-blue-400">{avgDeflection}%</div>
          <div className="text-xs text-slate-500 mt-2">Sessions resolved without escalation</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="text-sm font-medium text-slate-400 mb-2">Avg Escalation Rate</div>
          <div className="text-3xl font-bold text-amber-400">{avgEscalation}%</div>
          <div className="text-xs text-slate-500 mt-2">Sessions escalated to human agent</div>
        </div>
      </div>

      {/* Trend Charts (ASCII-based fallback for demonstration) */}
      <div className="space-y-8 mb-8">
        {/* Volume Trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Session Volume Trend</h2>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {chartData.length > 0 ? (
                <div>
                  {/* Simple bar chart visualization */}
                  {chartData.map((point) => {
                    const maxSessions = Math.max(
                      ...chartData.map((d) => d.sessions)
                    );
                    const barWidth =
                      maxSessions > 0
                        ? Math.ceil((point.sessions / maxSessions) * 40)
                        : 0;
                    return (
                      <div key={point.date} className="flex items-center gap-3 mb-3">
                        <div className="w-20 text-sm text-slate-400">{point.date}</div>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-6 bg-emerald-600 rounded"
                            style={{ width: `${barWidth * 8}px` }}
                          />
                          <span className="text-sm text-slate-300 ml-2">
                            {point.sessions}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-400">No data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Deflection Rate Trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Deflection Rate Trend</h2>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {chartData.length > 0 ? (
                <div>
                  {chartData.map((point) => (
                    <div key={`def-${point.date}`} className="flex items-center gap-3 mb-3">
                      <div className="w-20 text-sm text-slate-400">{point.date}</div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 bg-blue-600 rounded"
                          style={{
                            width: `${point.deflectionRate * 40}px`,
                          }}
                        />
                        <span className="text-sm text-slate-300 ml-2">
                          {(point.deflectionRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">No data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Escalation Rate Trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Escalation Rate Trend</h2>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {chartData.length > 0 ? (
                <div>
                  {chartData.map((point) => (
                    <div key={`esc-${point.date}`} className="flex items-center gap-3 mb-3">
                      <div className="w-20 text-sm text-slate-400">{point.date}</div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 bg-amber-600 rounded"
                          style={{
                            width: `${point.escalationRate * 40}px`,
                          }}
                        />
                        <span className="text-sm text-slate-300 ml-2">
                          {(point.escalationRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Raw Data Table (if available) */}
      {kpis.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Raw Data by Agent & Date</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-300 font-medium">Date</th>
                  <th className="text-left py-2 px-3 text-slate-300 font-medium">Bot</th>
                  <th className="text-right py-2 px-3 text-slate-300 font-medium">Sessions</th>
                  <th className="text-right py-2 px-3 text-slate-300 font-medium">
                    Deflection Rate
                  </th>
                  <th className="text-right py-2 px-3 text-slate-300 font-medium">
                    Escalation Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((kpi) => (
                  <tr key={`${kpi.envId}/${kpi.botId}/${kpi.date}`} className="border-b border-slate-800">
                    <td className="py-2 px-3 text-slate-400">{kpi.date}</td>
                    <td className="py-2 px-3 text-slate-400">{kpi.botId}</td>
                    <td className="py-2 px-3 text-slate-300 text-right">{kpi.sessions}</td>
                    <td className="py-2 px-3 text-slate-300 text-right">
                      {(kpi.deflectionRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-slate-300 text-right">
                      {(kpi.escalationRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpis.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400">No KPI data available yet.</p>
        </div>
      )}
    </div>
  );
}

export default ConversationKpisPage;
