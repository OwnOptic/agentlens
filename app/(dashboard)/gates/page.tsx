'use client';

/**
 * AgentLens - Release Gates Page
 *
 * Features:
 *   - Select an agent and gate policy, run the gate (POST /api/gates)
 *   - Verdict panel with pass/block badge + per-reason list
 *   - Signed record panel (signature, revoke action)
 *   - Audit log table of all decisions (from GET /api/gates)
 *   - All UI backed by mock seed via the API route (runs fully offline)
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { GatePolicy, GateDecision } from '@/lib/types';
import type { PolicyEvalSummary } from '@/lib/policy/gates';
import type { DecisionSummary } from '@/lib/policy/signing';

// ---------------------------------------------------------------------------
// Types (local, mirrors API response)
// ---------------------------------------------------------------------------

interface GateRunOutput {
  decision: GateDecision;
  policyResults: PolicyEvalSummary[];
  notification: string;
}

interface AnnotatedDecision extends GateDecision {
  _signatureValid?: boolean;
}

interface GetGatesResponse {
  policies: GatePolicy[];
  decisions: AnnotatedDecision[];
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: 'pass' | 'block' }) {
  return verdict === 'pass' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/70 px-3 py-1 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-900/70 px-3 py-1 text-sm font-semibold text-red-300 ring-1 ring-red-700">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      BLOCK
    </span>
  );
}

function SigBadge({ valid, revoked }: { valid?: boolean; revoked: boolean }) {
  if (revoked) {
    return (
      <span className="inline-block rounded bg-orange-900/50 px-2 py-0.5 text-xs font-medium text-orange-300">
        revoked
      </span>
    );
  }
  return valid === true ? (
    <span className="inline-block rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300">
      sig valid
    </span>
  ) : valid === false ? (
    <span className="inline-block rounded bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-300">
      sig invalid
    </span>
  ) : (
    <span className="inline-block rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-400">
      unverified
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gate runner panel
// ---------------------------------------------------------------------------

const AGENT_OPTIONS = [
  { label: 'Customer Care Agent (prod)', value: 'env-prod-33333333/bot-prod-customercare-hhh' },
  { label: 'Employee Onboarding (prod)', value: 'env-prod-33333333/bot-prod-onboarding-iii' },
  { label: 'Finance Reporting (UAT)', value: 'env-uat-22222222/bot-uat-finance-fff' },
  { label: 'Procurement Orchestrator (UAT)', value: 'env-uat-22222222/bot-uat-procurement-ggg' },
  { label: 'HR Self-Service (default - anon)', value: 'env-default-00000000/bot-anon-hr-aaa' },
  { label: 'IT Helpdesk (default - no auth)', value: 'env-default-00000000/bot-anon-it-bbb' },
  { label: 'Sales Intelligence (dev)', value: 'env-dev-11111111/bot-dev-sales-ddd' },
  { label: 'External API Orchestrator (dev - HTTP)', value: 'env-dev-11111111/bot-dev-http-eee' },
];

interface RunnerPanelProps {
  policies: GatePolicy[];
  onResult: (output: GateRunOutput) => void;
}

function RunnerPanel({ policies, onResult }: RunnerPanelProps) {
  const [agentRef, setAgentRef] = useState(AGENT_OPTIONS[0].value);
  const [policyId, setPolicyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentRef, policyId: policyId || undefined }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as GateRunOutput;
      onResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-200">Run Gate Check</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Agent selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">Agent</label>
          <select
            value={agentRef}
            onChange={(e) => setAgentRef(e.target.value)}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          >
            {AGENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Policy selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-slate-500">Gate Policy</label>
          <select
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">All enabled policies</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.enabled}>
                {p.name}{p.enabled ? '' : ' (disabled)'}
              </option>
            ))}
          </select>
        </div>

        {/* Run button */}
        <div className="flex flex-col justify-end">
          <button
            onClick={handleRun}
            disabled={loading}
            className="rounded-lg bg-emerald-700 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {loading ? 'Running...' : 'Run Gate'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict panel
// ---------------------------------------------------------------------------

function VerdictPanel({ output }: { output: GateRunOutput }) {
  const { decision, policyResults, notification } = output;
  const [showNotif, setShowNotif] = useState(false);

  return (
    <div
      className={`rounded-xl border p-5 ${
        decision.verdict === 'pass'
          ? 'border-emerald-800 bg-emerald-950/30'
          : 'border-red-800 bg-red-950/30'
      }`}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <VerdictBadge verdict={decision.verdict} />
          <p className="mt-2 text-xs text-slate-400">Agent: {decision.agentRef}</p>
          <p className="text-xs text-slate-500">
            Evaluated at {new Date(decision.signedAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => setShowNotif((v) => !v)}
          className="rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
        >
          {showNotif ? 'Hide' : 'Show'} Notification
        </button>
      </div>

      {/* Advisory banner */}
      <div className="mb-4 rounded bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
        Gate is <span className="font-semibold text-slate-200">advisory mode</span> - this verdict
        is recorded but does not automatically halt promotion. An operator must review and act.
      </div>

      {/* Per-policy results */}
      {policyResults.length > 0 && (
        <div className="mb-4 space-y-2">
          {policyResults.map((pr) => (
            <div key={pr.policyId} className="rounded bg-slate-800/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <VerdictBadge verdict={pr.verdict} />
                <span className="text-sm font-medium text-slate-200">{pr.policyName}</span>
              </div>
              {pr.reasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pr.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="mt-0.5 text-red-400">x</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reasons list */}
      {decision.reasons.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-slate-500">Reasons</p>
          <ul className="space-y-1">
            {decision.reasons.map((r, i) => (
              <li key={i} className="text-xs text-slate-300">
                <span className="mr-2 text-slate-500">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notification text */}
      {showNotif && (
        <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-400">
          {notification}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed record panel
// ---------------------------------------------------------------------------

interface SignedRecordPanelProps {
  decision: GateDecision;
  onRevoke: (id: string) => void;
  revoking: boolean;
}

function SignedRecordPanel({ decision, onRevoke, revoking }: SignedRecordPanelProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-200">Signed Record</h2>
        {!decision.revoked && (
          <button
            onClick={() => onRevoke(decision.id)}
            disabled={revoking}
            className="rounded bg-orange-900/50 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-900 disabled:opacity-50"
          >
            {revoking ? 'Revoking...' : 'Revoke Decision'}
          </button>
        )}
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Decision ID</dt>
          <dd className="break-all font-mono text-xs text-slate-300">{decision.id}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Agent Ref</dt>
          <dd className="font-mono text-xs text-slate-300">{decision.agentRef}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Verdict</dt>
          <dd>
            <VerdictBadge verdict={decision.verdict} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Signed At</dt>
          <dd className="text-slate-300">{new Date(decision.signedAt).toLocaleString()}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Status</dt>
          <dd>
            <SigBadge valid revoked={decision.revoked} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-slate-500">Signature</dt>
          <dd className="break-all font-mono text-xs text-emerald-400/80">{decision.signature}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-600">
        HMAC-SHA256 of &quot;{'{id}:{agentRef}:{verdict}:{signedAt}'}&quot;. Revocation preserves
        the original payload for audit trail integrity.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log table
// ---------------------------------------------------------------------------

function AuditLog({
  decisions,
  onRevoke,
  revoking,
}: {
  decisions: AnnotatedDecision[];
  onRevoke: (id: string) => void;
  revoking: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-200">
        Decision Audit Log{' '}
        <span className="ml-2 text-sm font-normal text-slate-500">({decisions.length})</span>
      </h2>

      {decisions.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No gate decisions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Verdict</th>
                <th className="pb-2 pr-4">Signed At</th>
                <th className="pb-2 pr-4">Signature</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-slate-200">
                      {d.agentRef.split('/')[1] ?? d.agentRef}
                    </span>
                    <span className="block text-xs text-slate-500">{d.agentRef.split('/')[0]}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <VerdictBadge verdict={d.verdict} />
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {new Date(d.signedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <SigBadge valid={d._signatureValid} revoked={d.revoked} />
                  </td>
                  <td className="py-2">
                    {!d.revoked ? (
                      <button
                        onClick={() => onRevoke(d.id)}
                        disabled={revoking === d.id}
                        className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400 hover:bg-orange-900/40 hover:text-orange-300 disabled:opacity-50"
                      >
                        {revoking === d.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">revoked</span>
                    )}
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

// ---------------------------------------------------------------------------
// Policy viewer (read-only YAML)
// ---------------------------------------------------------------------------

function PolicyViewer({ policies }: { policies: GatePolicy[] }) {
  const [selected, setSelected] = useState(policies[0]?.id ?? '');
  const policy = policies.find((p) => p.id === selected);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-200">Gate Policies</h2>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="ml-auto rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 focus:outline-none"
        >
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.enabled ? '' : '(disabled)'}
            </option>
          ))}
        </select>
      </div>

      {policy && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">ID: {policy.id}</span>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                policy.enabled
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {policy.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
          <pre className="overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed">
            {policy.yaml}
          </pre>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GatesPage() {
  const [policies, setPolicies] = useState<GatePolicy[]>([]);
  const [auditDecisions, setAuditDecisions] = useState<AnnotatedDecision[]>([]);
  const [lastResult, setLastResult] = useState<GateRunOutput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/gates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GetGatesResponse;
      setPolicies(data.policies);
      setAuditDecisions(data.decisions);
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleResult(output: GateRunOutput) {
    setLastResult(output);
    // Optimistically prepend new decision to audit log
    setAuditDecisions((prev) => [
      { ...output.decision, _signatureValid: true },
      ...prev,
    ]);
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/gates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Update in-memory audit log and lastResult
      setAuditDecisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, revoked: true } : d))
      );
      if (lastResult?.decision.id === id) {
        setLastResult((prev) =>
          prev ? { ...prev, decision: { ...prev.decision, revoked: true } } : null
        );
      }
    } catch (err) {
      console.error('Revoke failed:', err);
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Release Gates</h1>
        <p className="mt-1 text-sm text-slate-400">
          Advisory gate checks for agent promotion. All decisions are HMAC-signed for audit
          trail integrity. Gate is always advisory - it notifies but never force-blocks.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Failed to load gate data: {loadError}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Policies</p>
          <p className="mt-1 text-3xl font-bold text-slate-200">{policies.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {policies.filter((p) => p.enabled).length} enabled
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Total Decisions</p>
          <p className="mt-1 text-3xl font-bold text-slate-200">{auditDecisions.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Blocked</p>
          <p className="mt-1 text-3xl font-bold text-red-400">
            {auditDecisions.filter((d) => d.verdict === 'block' && !d.revoked).length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">active (not revoked)</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Revoked</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">
            {auditDecisions.filter((d) => d.revoked).length}
          </p>
        </div>
      </div>

      {/* Runner */}
      {policies.length > 0 && (
        <RunnerPanel policies={policies} onResult={handleResult} />
      )}

      {/* Verdict + Signed record (shown after a run) */}
      {lastResult && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <VerdictPanel output={lastResult} />
          <SignedRecordPanel
            decision={lastResult.decision}
            onRevoke={handleRevoke}
            revoking={revoking === lastResult.decision.id}
          />
        </div>
      )}

      {/* Policy viewer */}
      {policies.length > 0 && <PolicyViewer policies={policies} />}

      {/* Audit log */}
      <AuditLog
        decisions={auditDecisions}
        onRevoke={handleRevoke}
        revoking={revoking}
      />
    </div>
  );
}
