'use client';

/**
 * Maker View page
 *
 * Role-aware view that shows an agent maker their own agents only.
 * Owner is mocked by selecting from the seed's distinct owner emails.
 * In production: replace the owner selector with the signed-in user's
 * Entra identity (read from the session / MSAL token).
 */

import React, { useState, useMemo } from 'react';
import type { Agent, LifecycleStage } from '@/lib/types';
import { mockAgents, mockEnvironments, mockMetrics, mockAlerts } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_MAP = Object.fromEntries(mockEnvironments.map((e) => [e.id, e.name]));

function lifecycleBadge(stage: LifecycleStage | undefined) {
  const map: Record<LifecycleStage, { label: string; cls: string }> = {
    poc: { label: 'PoC', cls: 'bg-slate-700 text-slate-300' },
    pilot: { label: 'Pilot', cls: 'bg-amber-900/60 text-amber-300' },
    prod: { label: 'Prod', cls: 'bg-emerald-900/60 text-emerald-300' },
  };
  if (!stage) return null;
  const { label, cls } = map[stage];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function stateBadge(state: string) {
  const active = state === 'Active';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-500'
      }`}
    >
      {state}
    </span>
  );
}

function relativeDate(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// AgentRow
// ---------------------------------------------------------------------------
interface AgentRowProps {
  agent: Agent;
  latestCost: number | null;
  openAlerts: number;
}

function AgentRow({ agent, latestCost, openAlerts }: AgentRowProps) {
  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-200 text-sm">{agent.name}</div>
        <div className="text-xs text-slate-600 font-mono">{agent.botId}</div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {ENV_MAP[agent.envId] ?? agent.envId}
      </td>
      <td className="px-4 py-3">{lifecycleBadge(agent.lifecycle)}</td>
      <td className="px-4 py-3">{stateBadge(agent.state)}</td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {relativeDate(agent.lastActivity)}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {latestCost !== null ? `$${latestCost.toFixed(2)}/day` : '-'}
      </td>
      <td className="px-4 py-3">
        {openAlerts > 0 ? (
          <span className="inline-flex items-center rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-300">
            {openAlerts} alert{openAlerts > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-slate-600">-</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Distinct owners from seed (excluding nulls)
const ALL_OWNERS: Array<{ email: string; name: string }> = Array.from(
  new Map(
    mockAgents
      .filter((a): a is Agent & { ownerEmail: string; ownerName: string } =>
        a.ownerEmail !== null && a.ownerName !== null
      )
      .map((a) => [a.ownerEmail, { email: a.ownerEmail, name: a.ownerName }])
  ).values()
);

export default function MakerPage() {
  const [selectedOwner, setSelectedOwner] = useState<string>(
    ALL_OWNERS[0]?.email ?? ''
  );

  const myAgents = useMemo(
    () => mockAgents.filter((a) => a.ownerEmail === selectedOwner),
    [selectedOwner]
  );

  // Latest daily cost per botId
  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of mockMetrics) {
      const existing = map.get(m.botId);
      if (existing === undefined || m.date > (existing as unknown as string)) {
        map.set(m.botId, m.estimatedCost);
      }
    }
    return map;
  }, []);

  // Open alerts per botId
  const alertMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of mockAlerts) {
      if (a.botId && (a.state === 'open' || a.state === 'ack')) {
        map.set(a.botId, (map.get(a.botId) ?? 0) + 1);
      }
    }
    return map;
  }, []);

  const pocCount = myAgents.filter((a) => a.lifecycle === 'poc').length;
  const pilotCount = myAgents.filter((a) => a.lifecycle === 'pilot').length;
  const prodCount = myAgents.filter((a) => a.lifecycle === 'prod').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Maker View</h1>
          <p className="mt-1 text-sm text-slate-400">
            Scoped to your agents only. In production this reflects the signed-in
            maker&apos;s identity.
          </p>
        </div>

        {/* Owner selector (mock auth) */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap" htmlFor="owner-select">
            Viewing as:
          </label>
          <select
            id="owner-select"
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm
                       text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            {ALL_OWNERS.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name} ({o.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total agents', value: myAgents.length, cls: 'text-white' },
          { label: 'PoC', value: pocCount, cls: 'text-slate-400' },
          { label: 'Pilot', value: pilotCount, cls: 'text-amber-400' },
          { label: 'Prod', value: prodCount, cls: 'text-emerald-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-3xl font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Agents table */}
      {myAgents.length === 0 ? (
        <div className="rounded-md border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
          No agents found for this owner.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-left text-xs font-medium uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3">Daily cost</th>
                <th className="px-4 py-3">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {myAgents.map((agent) => (
                <AgentRow
                  key={`${agent.envId}/${agent.botId}`}
                  agent={agent}
                  latestCost={costMap.get(agent.botId) ?? null}
                  openAlerts={alertMap.get(agent.botId) ?? 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Mock data - owner filter applied client-side. Connect Microsoft Graph to
        resolve the signed-in user&apos;s Entra object ID for live scoping.
      </p>
    </div>
  );
}
