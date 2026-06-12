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
import {
  DoorClosed,
  ShieldCheck,
  FileText,
  ClipboardList,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
} from 'lucide-react';
import type { GatePolicy, GateDecision } from '@/lib/types';
import type { PolicyEvalSummary } from '@/lib/policy/gates';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
} from '@/components/ui';

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
    <Badge variant="success" dot>PASS</Badge>
  ) : (
    <Badge variant="critical" dot>BLOCK</Badge>
  );
}

function SigBadge({ valid, revoked }: { valid?: boolean; revoked: boolean }) {
  if (revoked) return <Badge variant="warning">revoked</Badge>;
  if (valid === true) return <Badge variant="success">sig valid</Badge>;
  if (valid === false) return <Badge variant="critical">sig invalid</Badge>;
  return <Badge variant="neutral">unverified</Badge>;
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
    <Card className="p-5">
      <SectionTitle icon={DoorClosed}>Run Gate Check</SectionTitle>

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
          <Button
            onClick={handleRun}
            variant="primary"
            icon={DoorClosed}
          >
            {loading ? 'Running...' : 'Run Gate'}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mt-3 px-3 py-2 border-red-800 bg-red-950/30">
          <p className="text-xs text-red-300">{error}</p>
        </Card>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Verdict panel
// ---------------------------------------------------------------------------

function VerdictPanel({ output }: { output: GateRunOutput }) {
  const { decision, policyResults, notification } = output;
  const [showNotif, setShowNotif] = useState(false);

  return (
    <Card
      className={`p-5 ${
        decision.verdict === 'pass'
          ? 'border-emerald-800 bg-emerald-950/20'
          : 'border-red-800 bg-red-950/20'
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
        <Button onClick={() => setShowNotif((v) => !v)} variant="ghost">
          {showNotif ? 'Hide' : 'Show'} Notification
        </Button>
      </div>

      {/* Advisory banner */}
      <Card className="mb-4 px-3 py-2 bg-slate-800/40">
        <p className="text-xs text-slate-400">
          Gate is <span className="font-semibold text-slate-200">advisory mode</span> - this verdict
          is recorded but does not automatically halt promotion. An operator must review and act.
        </p>
      </Card>

      {/* Per-policy results */}
      {policyResults.length > 0 && (
        <div className="mb-4 space-y-2">
          {policyResults.map((pr) => (
            <Card key={pr.policyId} className="px-3 py-2 bg-slate-800/30">
              <div className="flex items-center gap-2">
                <VerdictBadge verdict={pr.verdict} />
                <span className="text-sm font-medium text-slate-200">{pr.policyName}</span>
              </div>
              {pr.reasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pr.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0 text-red-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Reasons list */}
      {decision.reasons.length > 0 && (
        <div className="mb-4">
          <SectionTitle icon={ClipboardList}>Reasons</SectionTitle>
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
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
          {notification}
        </pre>
      )}
    </Card>
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
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle icon={ShieldCheck}>Signed Record</SectionTitle>
        {!decision.revoked && (
          <Button
            onClick={() => onRevoke(decision.id)}
            variant="ghost"
            icon={RotateCcw}
          >
            {revoking ? 'Revoking...' : 'Revoke Decision'}
          </Button>
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
    </Card>
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
    <Card className="p-5">
      <SectionTitle
        icon={ClipboardList}
        right={
          <Badge variant="neutral">{decisions.length}</Badge>
        }
      >
        Decision Audit Log
      </SectionTitle>

      {decisions.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-slate-500">
          <DoorClosed className="h-8 w-8 opacity-30" />
          <p className="text-sm">No gate decisions recorded yet.</p>
        </div>
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
                      <Button
                        onClick={() => onRevoke(d.id)}
                        variant="ghost"
                        icon={RotateCcw}
                      >
                        {revoking === d.id ? 'Revoking...' : 'Revoke'}
                      </Button>
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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Policy viewer (read-only YAML)
// ---------------------------------------------------------------------------

function PolicyViewer({ policies }: { policies: GatePolicy[] }) {
  const [selected, setSelected] = useState(policies[0]?.id ?? '');
  const policy = policies.find((p) => p.id === selected);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <SectionTitle icon={FileText}>Gate Policies</SectionTitle>
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
            <Badge variant={policy.enabled ? 'success' : 'neutral'}>
              {policy.enabled ? 'enabled' : 'disabled'}
            </Badge>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed">
            {policy.yaml}
          </pre>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReleaseGatesPage() {
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

  const activeBlocked = auditDecisions.filter((d) => d.verdict === 'block' && !d.revoked).length;
  const revokedCount = auditDecisions.filter((d) => d.revoked).length;
  const enabledPolicies = policies.filter((p) => p.enabled).length;

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        icon={DoorClosed}
        tone="emerald"
        title="Release Gates"
        subtitle="Advisory gate checks for agent promotion. All decisions are HMAC-signed for audit trail integrity. Gate is always advisory - it notifies but never force-blocks."
        actions={
          <Button icon={RefreshCw} variant="ghost" onClick={loadData}>
            Refresh
          </Button>
        }
      />

      {loadError && (
        <Card className="px-4 py-3 border-red-800 bg-red-950/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">Failed to load gate data: {loadError}</p>
          </div>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Policies"
          value={policies.length}
          tone="sky"
          sublabel={`${enabledPolicies} enabled`}
        />
        <StatCard
          icon={ClipboardList}
          label="Total Decisions"
          value={auditDecisions.length}
          tone="slate"
        />
        <StatCard
          icon={DoorClosed}
          label="Blocked"
          value={activeBlocked}
          tone={activeBlocked > 0 ? 'red' : 'emerald'}
          sublabel="active (not revoked)"
        />
        <StatCard
          icon={RotateCcw}
          label="Revoked"
          value={revokedCount}
          tone={revokedCount > 0 ? 'amber' : 'slate'}
        />
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
