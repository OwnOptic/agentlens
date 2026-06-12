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

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: 'bg-red-700 text-red-100 border border-red-600',
  warning:  'bg-yellow-700 text-yellow-100 border border-yellow-600',
  info:     'bg-blue-700 text-blue-100 border border-blue-600',
};

const STATE_BADGE: Record<AlertState, string> = {
  open:     'bg-red-900/50 text-red-300 border border-red-800',
  ack:      'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
  resolved: 'bg-emerald-900/50 text-emerald-300 border border-emerald-800',
};

const TYPE_LABEL: Record<AlertType, string> = {
  budget_breach:         'Budget Breach',
  volume_spike:          'Volume Spike',
  new_default_env_agent: 'Default Env Agent',
  model_meter_mismatch:  'Meter Mismatch',
  orphan_idle:           'Orphan / Idle',
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

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
  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-lg border p-4 transition-colors',
        selected
          ? 'border-emerald-600 bg-slate-800'
          : 'border-slate-700 bg-slate-800/70 hover:border-slate-600',
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
          <Badge className={SEVERITY_BADGE[alert.severity]}>
            {alert.severity.toUpperCase()}
          </Badge>
          <Badge className="bg-slate-700 text-slate-300 border border-slate-600">
            {TYPE_LABEL[alert.type] ?? alert.type}
          </Badge>
          <Badge className={STATE_BADGE[alert.state]}>
            {alert.state}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 gap-2">
          {alert.state === 'open' && (
            <button
              onClick={() => onAck(alert.id)}
              className="rounded px-2.5 py-1 text-xs font-medium bg-yellow-900/40 text-yellow-300 hover:bg-yellow-900/70 border border-yellow-800 transition-colors"
            >
              Ack
            </button>
          )}
          {alert.state !== 'resolved' && (
            <button
              onClick={() => onResolve(alert.id)}
              className="rounded px-2.5 py-1 text-xs font-medium bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70 border border-emerald-800 transition-colors"
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="ml-7 text-sm text-slate-200">{alert.message}</p>

      {/* Footer metadata */}
      <div className="ml-7 flex flex-wrap gap-4 text-xs text-slate-500">
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
    </div>
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
      {[
        { label: 'Open',     value: total,    cls: 'border-slate-700 text-white' },
        { label: 'Critical', value: critical, cls: 'border-red-700 text-red-300' },
        { label: 'Warning',  value: warning,  cls: 'border-yellow-700 text-yellow-300' },
        { label: 'Info',     value: info,     cls: 'border-blue-700 text-blue-300' },
      ].map(({ label, value, cls }) => (
        <div key={label} className={`rounded-lg border ${cls} bg-slate-800/50 p-4`}>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
        </div>
      ))}
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
      const data = await res.json() as Alert[];
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
    <div className="min-h-screen text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium shadow-lg text-white">
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Governance Alerts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Automated rule evaluations across all environments and agents.
          </p>
        </div>
        <button
          onClick={() => void runEvaluation()}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {running ? <Spinner /> : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {running ? 'Evaluating...' : 'Re-evaluate Rules'}
        </button>
      </div>

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
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-700 bg-emerald-900/20 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-300">
            {selected.size} selected
          </span>
          <button
            onClick={() => void bulkAction('ack')}
            className="rounded px-3 py-1 text-xs font-medium bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900 border border-yellow-800 transition-colors"
          >
            Bulk Ack
          </button>
          <button
            onClick={() => void bulkAction('resolve')}
            className="rounded px-3 py-1 text-xs font-medium bg-emerald-900/50 text-emerald-300 hover:bg-emerald-900 border border-emerald-800 transition-colors"
          >
            Bulk Resolve
          </button>
          <button
            onClick={clearSelection}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Clear selection
          </button>
        </div>
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
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={() => void fetchAlerts()}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
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
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-slate-400">No alerts match the current filters.</p>
          <p className="mt-1 text-xs text-slate-600">
            Run an evaluation or adjust filters to see results.
          </p>
        </div>
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
