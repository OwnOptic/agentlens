import React from 'react';
import type { AgentMetricDaily } from '@/lib/types';

export const metadata = {
  title: 'Cost Analysis',
};

interface CostSummary {
  agentName: string;
  envId: string;
  botId: string;
  totalCost: number;
  messageCount: number;
  dailyMetrics: AgentMetricDaily[];
}

export default async function CostPage() {
  // TODO: Fetch cost metrics
  const costData: CostSummary[] = [];

  return (
    <div>
      <h2 className="mb-6 text-3xl font-bold">Cost Analysis</h2>

      {costData.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>No cost data available yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {costData.map((agent) => (
            <div
              key={`${agent.envId}-${agent.botId}`}
              className="rounded-lg border border-slate-700 bg-slate-800 p-6"
            >
              <h3 className="mb-4 text-lg font-semibold">{agent.agentName}</h3>
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-slate-900 p-4">
                  <p className="text-sm text-slate-400">Total Cost</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    ${agent.totalCost.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900 p-4">
                  <p className="text-sm text-slate-400">Messages</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {agent.messageCount}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900 p-4">
                  <p className="text-sm text-slate-400">Avg Cost/Message</p>
                  <p className="text-2xl font-bold text-purple-400">
                    $
                    {(
                      agent.totalCost / Math.max(agent.messageCount, 1)
                    ).toFixed(4)}
                  </p>
                </div>
              </div>
              {agent.dailyMetrics.length > 0 && (
                <div className="text-xs text-slate-400">
                  {agent.dailyMetrics.length} daily records
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
