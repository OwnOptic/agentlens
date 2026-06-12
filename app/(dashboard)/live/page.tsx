'use client';

/**
 * Live (MVP) - the ONE page wired to real tenant data via Azure Resource Graph.
 * Every other page renders mock seed data; this one calls /api/live which queries
 * the real MVP tenant. Proves the ARG backbone end-to-end.
 */

import { useEffect, useState } from 'react';

interface LiveEnv {
  id: string;
  displayName: string;
  environmentType: string;
  region: string;
  isDefault: boolean;
}
interface LiveData {
  source: string;
  tenant: string;
  fetchedAt: string;
  summary: { type: string; count: number }[];
  environments: LiveEnv[];
  agents: { name: string; properties: Record<string, unknown> }[];
  error?: string;
  hint?: string;
}

const TYPE_LABEL: Record<string, string> = {
  'microsoft.copilotstudio/agents': 'Copilot Studio agents',
  'microsoft.powerplatformconnector/connectors': 'Connectors',
  'microsoft.powerapps/modeldrivenapps': 'Model-driven apps',
  'microsoft.powerapps/canvasapps': 'Canvas apps',
  'microsoft.powerautomate/cloudflows': 'Cloud flows',
  'microsoft.powerplatform/environments': 'Environments',
};

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/live', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error + (json.hint ? ` - ${json.hint}` : ''));
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-100">Live - MVP Tenant</h1>
            <span className="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/40">
              ● Live ARG data
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real data from your tenant via Azure Resource Graph (<code className="text-slate-300">PowerPlatformResources</code>).
            Every other page uses demo seed data.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-slate-400">Querying Azure Resource Graph...</p>}

      {err && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300">
          <p className="font-semibold">Live query failed</p>
          <p className="mt-1 text-red-400">{err}</p>
        </div>
      )}

      {data && (
        <div className="space-y-8">
          <p className="text-xs text-slate-500">
            Tenant: <span className="text-slate-300">{data.tenant}</span> · fetched{' '}
            <span suppressHydrationWarning className="text-slate-300">{new Date(data.fetchedAt).toLocaleString()}</span>
          </p>

          {/* Resource summary */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Tenant resource inventory (live)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.summary.map((s) => (
                <div key={s.type} className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
                  <p className="text-2xl font-semibold text-slate-100">{s.count.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-400">{TYPE_LABEL[s.type] ?? s.type}</p>
                </div>
              ))}
              <div className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
                <p className="text-2xl font-semibold text-emerald-400">{data.agents.length}</p>
                <p className="mt-1 text-xs text-slate-400">Copilot Studio agents</p>
              </div>
            </div>
            {data.agents.length === 0 && (
              <p className="mt-3 text-xs text-amber-400">
                No Copilot Studio agents in this tenant yet - create one in copilotstudio.microsoft.com and it appears here within ~15 min.
              </p>
            )}
          </section>

          {/* Environments */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Environments (live) - {data.environments.length}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2">Name</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Region</th>
                  <th className="py-2">Default</th>
                </tr>
              </thead>
              <tbody>
                {data.environments.map((e) => (
                  <tr key={e.id} className="border-b border-slate-900">
                    <td className="py-2 text-slate-200">{e.displayName}</td>
                    <td className="py-2 text-slate-400">{String(e.environmentType)}</td>
                    <td className="py-2 text-slate-400">{String(e.region)}</td>
                    <td className="py-2">
                      {e.isDefault ? (
                        <span className="rounded bg-blue-600/20 px-2 py-0.5 text-xs text-blue-300">Default</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Agents (if any) */}
          {data.agents.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Copilot Studio agents (live)
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2">Agent</th>
                    <th className="py-2">Owner</th>
                    <th className="py-2">Auth</th>
                    <th className="py-2">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => {
                    const p = a.properties ?? {};
                    return (
                      <tr key={a.name} className="border-b border-slate-900">
                        <td className="py-2 text-slate-200">{String(p.displayName ?? a.name)}</td>
                        <td className="py-2 text-slate-400">{String(p.ownerId ?? '-')}</td>
                        <td className="py-2 text-slate-400">{String(p.authentication ?? '-')}</td>
                        <td className="py-2 text-slate-400">{String(p.model ?? '-')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
