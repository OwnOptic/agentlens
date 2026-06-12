import React from 'react';
import type { Agent } from '@/lib/types';

export const metadata = {
  title: 'Agent Inventory',
};

export default async function InventoryPage() {
  // TODO: Fetch agents from /api/agents
  const agents: Agent[] = [];

  return (
    <div>
      <h2 className="mb-6 text-3xl font-bold">Agent Inventory</h2>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>No agents found. Ingestion may be in progress.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800">
          <table className="w-full">
            <thead className="border-b border-slate-700 bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Agent Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Environment
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  State
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={`${agent.envId}-${agent.botId}`}
                  className="border-b border-slate-700 hover:bg-slate-700/50"
                >
                  <td className="px-6 py-3 font-medium">{agent.name}</td>
                  <td className="px-6 py-3 text-sm text-slate-300">
                    {agent.envId}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-300">
                    {agent.ownerName || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span className="rounded-full bg-emerald-900 px-3 py-1 text-emerald-200">
                      {agent.state}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-400">
                    {new Date(agent.createdOn).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
