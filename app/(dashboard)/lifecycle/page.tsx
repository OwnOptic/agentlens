'use client';

/**
 * Lifecycle page
 *
 * Shows agents grouped by lifecycle stage (poc / pilot / prod).
 * The prod column includes a prod-entry checklist for each agent.
 */

import React, { useState } from 'react';
import type { Agent, LifecycleStage } from '@/lib/types';
import { mockAgents, mockEnvironments, mockGatePolicies, mockGateDecisions } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENV_MAP = Object.fromEntries(mockEnvironments.map((e) => [e.id, e.name]));

const STAGES: LifecycleStage[] = ['poc', 'pilot', 'prod'];

const STAGE_LABELS: Record<LifecycleStage, string> = {
  poc: 'PoC',
  pilot: 'Pilot',
  prod: 'Production',
};

const STAGE_COLORS: Record<LifecycleStage, string> = {
  poc: 'border-slate-700 bg-slate-900',
  pilot: 'border-amber-800/50 bg-amber-950/20',
  prod: 'border-emerald-800/50 bg-emerald-950/20',
};

const STAGE_HEADER_COLORS: Record<LifecycleStage, string> = {
  poc: 'text-slate-400',
  pilot: 'text-amber-400',
  prod: 'text-emerald-400',
};

// ---------------------------------------------------------------------------
// Prod-entry checklist items
// Each item has a label + a function that evaluates whether the agent passes.
// ---------------------------------------------------------------------------
interface ChecklistItem {
  id: string;
  label: string;
  check: (agent: Agent) => boolean;
}

const PROD_CHECKLIST: ChecklistItem[] = [
  {
    id: 'owner',
    label: 'Registered owner',
    check: (a) => a.ownerEmail !== null,
  },
  {
    id: 'active',
    label: 'Agent is Active',
    check: (a) => a.state === 'Active',
  },
  {
    id: 'gate_pass',
    label: 'Release gate passed',
    check: (a) => {
      const ref = `${a.envId}/${a.botId}`;
      const decision = mockGateDecisions.find(
        (d) => d.agentRef === ref && !d.revoked
      );
      return decision?.verdict === 'pass';
    },
  },
  {
    id: 'gate_policy_enabled',
    label: 'Prod gate policy enabled',
    check: () => mockGatePolicies.some((p) => p.id === 'gate-policy-prod' && p.enabled),
  },
  {
    id: 'recent_activity',
    label: 'Activity in last 30 days',
    check: (a) => {
      if (!a.lastActivity) return false;
      const days = (Date.now() - new Date(a.lastActivity).getTime()) / 86_400_000;
      return days <= 30;
    },
  },
];

// ---------------------------------------------------------------------------
// ProdChecklist component
// ---------------------------------------------------------------------------
function ProdChecklist({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false);
  const results = PROD_CHECKLIST.map((item) => ({
    ...item,
    pass: item.check(agent),
  }));
  const passCount = results.filter((r) => r.pass).length;
  const allPass = passCount === results.length;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${allPass ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        Prod checklist ({passCount}/{results.length})
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul className="mt-2 space-y-1 rounded-md border border-slate-800 bg-slate-950 p-3">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              {r.pass ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-red-400"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              )}
              <span className={r.pass ? 'text-slate-400' : 'text-red-400'}>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentCard
// ---------------------------------------------------------------------------
function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <div className="font-medium text-sm text-slate-200">{agent.name}</div>
      <div className="mt-0.5 text-xs text-slate-600 font-mono truncate">{agent.botId}</div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="text-slate-500">{ENV_MAP[agent.envId] ?? agent.envId}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 font-medium ${
            agent.state === 'Active'
              ? 'bg-emerald-900/40 text-emerald-400'
              : 'bg-slate-800 text-slate-500'
          }`}
        >
          {agent.state}
        </span>
        {agent.ownerName && (
          <span className="text-slate-500">{agent.ownerName}</span>
        )}
      </div>

      {/* Prod checklist only on agents in prod stage */}
      {agent.lifecycle === 'prod' && <ProdChecklist agent={agent} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StageColumn
// ---------------------------------------------------------------------------
function StageColumn({ stage }: { stage: LifecycleStage }) {
  const agents = mockAgents.filter((a) => a.lifecycle === stage);

  return (
    <div
      className={`flex flex-col rounded-lg border p-4 ${STAGE_COLORS[stage]}`}
      style={{ minHeight: '300px' }}
    >
      {/* Column header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`font-semibold ${STAGE_HEADER_COLORS[stage]}`}>
          {STAGE_LABELS[stage]}
        </h2>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {agents.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {agents.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No agents at this stage.</p>
        ) : (
          agents.map((agent) => (
            <AgentCard key={`${agent.envId}/${agent.botId}`} agent={agent} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LifecyclePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Lifecycle</h1>
        <p className="mt-1 text-sm text-slate-400">
          Agents grouped by operational lifecycle stage. Production agents include
          the prod-entry checklist derived from the release gate policy.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1" />
          All checklist items pass
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-1" />
          Checklist incomplete
        </span>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STAGES.map((stage) => (
          <StageColumn key={stage} stage={stage} />
        ))}
      </div>

      <p className="text-xs text-slate-600">
        Prod-entry checklist evaluates: owner registration, Active state, release gate
        pass, gate policy enabled, and activity within 30 days.
      </p>
    </div>
  );
}
