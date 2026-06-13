'use client';

/**
 * AgentLens - Governance Alerts Page
 *
 * Features:
 *   - Live list of alerts fetched from /api/alerts
 *   - Filter by severity and state
 *   - Ack / resolve individual alerts
 *   - Bulk select with ack / resolve operations
 *   - Re-evaluate rules via POST /api/alerts { action: 'run' }
 *   - Tailwind dark theme
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { Alert, AlertSeverity, AlertType } from '@/lib/types';
import {
  Bell,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
} from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertState = Alert['state'];

interface BulkResult {
  updated: number;
}

interface RunResult {
  generated: number;
  alerts: Alert[];
}

// ---------------------------------------------------------------------------
// Helpers / style maps
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

const TYPE_LABEL: Record<AlertType, string> = {
  budget_breach:         'Budget Breach',
  volume_spike:          'Volume Spike',
  new_default_env_agent: 'Default Env Agent',
  model_meter_mismatch:  'Meter Mismatch',
  orphan_idle:           'Orphan / Idle',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-emerald-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Alert row
// ---------------------------------------------------------------------------

function AlertRow({
  alert,
  selected,
  onSelect,
  onAck,
  onResolve,
}: {
  alert: Alert;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onAck: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const severityVariant =
    alert.severity === 'critical' ? 'critical' :
    alert.severity === 'warning'  ? 'warning'  : 'info';

  const stateVariant =
    alert.state === 'open'     ? 'critical' :
    alert.state === 'ack'      ? 'warning'  : 'success';

  return (
    <Card
      hover
      className={[
        'p-4 transition-colors',
        selected ? 'ring-1 ring-emerald-600' : '',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-700 accent-emerald-500"
          checked={selected}
          onChange={(e) => onSelect(alert.id, e.target.checked)}
          aria-label={`Select alert ${alert.id}`}
        />

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Badge variant={severityVariant}>
            {alert.severity.toUpperCase()}
          </Badge>
          <Badge variant="neutral">
            {TYPE_LABEL[alert.type] ?? alert.type}
          </Badge>
          <Badge variant={stateVariant}>
            {alert.state}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 gap-2">
          {alert.state === 'open' && (
            <Button
              variant="ghost"
              onClick={() => onAck(alert.id)}
            >
              Ack
            </Button>
          )}
          {alert.state !== 'resolved' && (
            <Button
              variant="primary"
              icon={CheckCircle}
              onClick={() => onResolve(alert.id)}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="ml-7 mt-2 text-sm text-slate-200">{alert.message}</p>

      {/* Footer metadata */}
      <div className="ml-7 mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
        <span>
          <span className="text-slate-400">Env:</span>{' '}
          <code className="text-slate-300">{alert.envId}</code>
        </span>
        {alert.botId && (
          <span>
            <span className="text-slate-400">Agent:</span>{' '}
            <code className="text-slate-300">{alert.botId}</code>
          </span>
        )}
        <span>
          <span className="text-slate-400">Raised:</span>{' '}
          {formatDate(alert.createdAt)}
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({ alerts }: { alerts: Alert[] }) {
  const critical = alerts.filter((a) => a.severity === 'critical' && a.state === 'open').length;
  const warning  = alerts.filter((a) => a.severity === 'warning'  && a.state === 'open').length;
  const info     = alerts.filter((a) => a.severity === 'info'     && a.state === 'open').length;
  const total    = alerts.filter((a) => a.state === 'open').length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
      <StatCard icon={Bell}          label="Open"     value={total}    tone="slate" />
      <StatCard icon={AlertTriangle} label="Critical" value={critical} tone="red" />
      <StatCard icon={AlertTriangle} label="Warning"  value={warning}  tone="amber" />
      <StatCard icon={Bell}          label="Info"     value={info}     tone="sky" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [filterState, setFilterState] = useState<AlertState | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all');

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterState !== 'all') params.set('state', filterState);
      if (filterSeverity !== 'all') params.set('severity', filterSeverity);
      const res = await fetch(`/api/alerts?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { alerts: Alert[] };
      const data = body.alerts ?? [];
      // Client-side sort: critical first, then createdAt desc
      data.sort((a, b) => {
        const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sd !== 0) return sd;
        return b.createdAt.localeCompare(a.createdAt);
      });
      setAlerts(data);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [filterState, filterSeverity]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ---------------------------------------------------------------------------
  // Single alert mutations
  // ---------------------------------------------------------------------------

  async function mutateAlert(id: string, state: AlertState) {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, state }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAlerts();
      showToast(`Alert ${state === 'ack' ? 'acknowledged' : 'resolved'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  const handleAck = (id: string) => void mutateAlert(id, 'ack');
  const handleResolve = (id: string) => void mutateAlert(id, 'resolved');

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  async function bulkAction(action: 'ack' | 'resolve') {
    if (selected.size === 0) return;
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as BulkResult;
      await fetchAlerts();
      showToast(`${data.updated} alert(s) ${action === 'ack' ? 'acknowledged' : 'resolved'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
    }
  }

  // ---------------------------------------------------------------------------
  // Re-evaluate rules
  // ---------------------------------------------------------------------------

  async function runEvaluation() {
    setRunning(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as RunResult;
      await fetchAlerts();
      showToast(`Evaluation complete: ${data.generated} new alert(s) generated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setRunning(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(alerts.map((a) => a.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const allSelected = alerts.length > 0 && selected.size === alerts.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium shadow-lg text-white">
          {toast}
        </div>
      )}

      <PageHeader
        icon={Bell}
        title="Governance Alerts"
        subtitle="Automated rule evaluations across all environments and agents."
        tone="amber"
        actions={
          <Button
            variant="primary"
            icon={running ? undefined : RefreshCw}
            onClick={() => void runEvaluation()}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Evaluating...
              </span>
            ) : (
              'Re-evaluate Rules'
            )}
          </Button>
        }
      />

      {/* Stats */}
      {!loading && <StatsBar alerts={alerts} />}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as AlertSeverity | 'all')}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value as AlertState | 'all')}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">All States</option>
          <option value="open">Open</option>
          <option value="ack">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>

        <span className="ml-auto text-sm text-slate-500">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 px-4 py-2.5 ring-1 ring-emerald-700">
          <span className="text-sm font-medium text-emerald-300">
            {selected.size} selected
          </span>
          <Button variant="ghost" onClick={() => void bulkAction('ack')}>
            Bulk Ack
          </Button>
          <Button variant="primary" icon={CheckCircle} onClick={() => void bulkAction('resolve')}>
            Bulk Resolve
          </Button>
          <button
            onClick={clearSelection}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Clear selection
          </button>
        </Card>
      )}

      {/* Select-all control */}
      {alerts.length > 0 && !loading && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-700 accent-emerald-500"
            checked={allSelected}
            onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
            aria-label="Select all alerts"
          />
          <span>Select all</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="mb-4 border-red-800 px-4 py-3">
          <p className="text-sm text-red-300">
            {error}
            <button
              onClick={() => void fetchAlerts()}
              className="ml-3 underline hover:no-underline"
            >
              Retry
            </button>
          </p>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Spinner />
          <span className="ml-3 text-sm">Loading alerts...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && alerts.length === 0 && (
        <Card className="p-12 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No alerts match the current filters.</p>
          <p className="mt-1 text-xs text-slate-600">
            Run an evaluation or adjust filters to see results.
          </p>
        </Card>
      )}

      {/* Alert list */}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              selected={selected.has(alert.id)}
              onSelect={toggleSelect}
              onAck={handleAck}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}
