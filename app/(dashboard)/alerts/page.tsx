import React from 'react';
import type { Alert } from '@/lib/types';

export const metadata = {
  title: 'Governance Alerts',
};

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-900 text-red-200';
    case 'warning':
      return 'bg-yellow-900 text-yellow-200';
    case 'info':
      return 'bg-blue-900 text-blue-200';
    default:
      return 'bg-slate-700 text-slate-200';
  }
}

function getStateColor(state: string): string {
  switch (state) {
    case 'open':
      return 'bg-red-900/30 text-red-300';
    case 'ack':
      return 'bg-yellow-900/30 text-yellow-300';
    case 'resolved':
      return 'bg-green-900/30 text-green-300';
    default:
      return 'bg-slate-700/30 text-slate-300';
  }
}

export default async function AlertsPage() {
  // TODO: Fetch alerts from backend
  const alerts: Alert[] = [];

  return (
    <div>
      <h2 className="mb-6 text-3xl font-bold">Governance Alerts</h2>

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>No active alerts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-lg border border-slate-700 bg-slate-800 p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex flex-1 items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getSeverityColor(alert.severity)}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-sm font-medium text-slate-300">
                    {alert.type}
                  </span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStateColor(alert.state)}`}
                >
                  {alert.state}
                </span>
              </div>
              <p className="mb-3 text-sm">{alert.message}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {alert.botId
                    ? `Agent: ${alert.botId}`
                    : `Environment: ${alert.envId}`}
                </span>
                <span>
                  {new Date(alert.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
