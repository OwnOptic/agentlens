'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Agent, Environment } from '@/lib/types';
import { mockAgents, mockEnvironments, mockCapacity, mockMetrics } from '@/lib/mock/seed';


type SortField = 'name' | 'env' | 'owner' | 'state' | 'lifecycle' | 'created' | 'activity';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  env: string;
  owner: string;
  state: string;
  lifecycle: string;
  modelMeter: string;
  auth: string;
}

export default function InventoryPage() {
  const [agents, setAgents] = React.useState<Agent[]>(mockAgents);
  const [environments, setEnvironments] = React.useState<Environment[]>(mockEnvironments);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<FilterState>({
    env: 'env-default-00000000',
    owner: '',
    state: '',
    lifecycle: '',
    modelMeter: '',
    auth: '',
  });

  const capacity = useMemo(() => {
    const cap = mockCapacity.find((c) => c.envId === filters.env);
    return cap || mockCapacity[0];
  }, [filters.env]);

  const envMetrics = useMemo(() => {
    return mockMetrics.filter((m) => m.envId === filters.env);
  }, [filters.env]);

  const totalCost = useMemo(() => {
    return envMetrics.reduce((sum, m) => sum + m.estimatedCost, 0);
  }, [envMetrics]);

  const avgProjectedMonthly = useMemo(() => {
    if (envMetrics.length === 0) return 0;
    const total = envMetrics.reduce((sum, m) => sum + (m.projectedMonthly || 0), 0);
    return total / envMetrics.length;
  }, [envMetrics]);

  const filtered = useMemo(() => {
    let result = agents.filter((a) => a.envId === filters.env);

    if (filters.owner) {
      result = result.filter((a) =>
        (a.ownerName || '')
          .toLowerCase()
          .includes(filters.owner.toLowerCase())
      );
    }

    if (filters.state) {
      result = result.filter((a) => a.state === filters.state);
    }

    if (filters.lifecycle) {
      result = result.filter((a) => a.lifecycle === filters.lifecycle);
    }

    return result;
  }, [agents, filters]);

  const sorted = useMemo(() => {
    const cpy = [...filtered];
    cpy.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortField === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortField === 'env') {
        aVal = a.envId;
        bVal = b.envId;
      } else if (sortField === 'owner') {
        aVal = a.ownerName || '';
        bVal = b.ownerName || '';
      } else if (sortField === 'state') {
        aVal = a.state;
        bVal = b.state;
      } else if (sortField === 'lifecycle') {
        aVal = a.lifecycle || '';
        bVal = b.lifecycle || '';
      } else if (sortField === 'created') {
        aVal = new Date(a.createdOn).getTime();
        bVal = new Date(b.createdOn).getTime();
      } else if (sortField === 'activity') {
        aVal = new Date(a.lastActivity || 0).getTime();
        bVal = new Date(b.lastActivity || 0).getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return cpy;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const envName =
    environments.find((e) => e.id === filters.env)?.name || 'Unknown';

  const lifecycleCounts = {
    poc: filtered.filter((a) => a.lifecycle === 'poc').length,
    pilot: filtered.filter((a) => a.lifecycle === 'pilot').length,
    prod: filtered.filter((a) => a.lifecycle === 'prod').length,
  };

  const stateCounts = {
    active: filtered.filter((a) => a.state === 'Active').length,
    inactive: filtered.filter((a) => a.state === 'Inactive').length,
  };

  const SortHeader = ({
    label,
    field,
  }: {
    label: string;
    field: SortField;
  }) => (
    <th
      className="cursor-pointer px-6 py-3 text-left text-sm font-semibold hover:bg-slate-800"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-2">
        {label}
        <span className="text-xs text-slate-500">
          {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '-'}
        </span>
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="mb-2 text-3xl font-bold">Agent Inventory</h2>
        <p className="text-slate-400">
          Filter and explore agents across your Copilot Studio environments
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Total Agents</p>
          <p className="mt-2 text-2xl font-bold">{filtered.length}</p>
          <p className="mt-1 text-xs text-slate-500">in {envName}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">
            Credit Usage
          </p>
          <p className="mt-2 text-2xl font-bold">
            {capacity.pct.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {capacity.creditUsed.toLocaleString()} / {capacity.creditLimit.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Daily Cost</p>
          <p className="mt-2 text-2xl font-bold">${totalCost.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Projected: ${avgProjectedMonthly.toFixed(2)}/mo
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Status</p>
          <div className="mt-2 flex gap-2 text-sm">
            <span className="inline-block rounded-full bg-emerald-900/60 px-2 py-1 text-emerald-300">
              {stateCounts.active} Active
            </span>
            <span className="inline-block rounded-full bg-slate-700/60 px-2 py-1 text-slate-400">
              {stateCounts.inactive} Inactive
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Environment Filter */}
          <div>
            <label className="mb-2 block text-sm font-medium">Environment</label>
            <select
              value={filters.env}
              onChange={(e) =>
                setFilters((f) => ({ ...f, env: e.target.value }))
              }
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>

          {/* Owner Filter */}
          <div>
            <label className="mb-2 block text-sm font-medium">Owner</label>
            <input
              type="text"
              placeholder="Filter by owner..."
              value={filters.owner}
              onChange={(e) =>
                setFilters((f) => ({ ...f, owner: e.target.value }))
              }
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* State Filter */}
          <div>
            <label className="mb-2 block text-sm font-medium">State</label>
            <select
              value={filters.state}
              onChange={(e) =>
                setFilters((f) => ({ ...f, state: e.target.value }))
              }
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All States</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Lifecycle Filter */}
          <div>
            <label className="mb-2 block text-sm font-medium">Lifecycle</label>
            <select
              value={filters.lifecycle}
              onChange={(e) =>
                setFilters((f) => ({ ...f, lifecycle: e.target.value }))
              }
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Stages</option>
              <option value="poc">PoC</option>
              <option value="pilot">Pilot</option>
              <option value="prod">Production</option>
            </select>
          </div>
        </div>

        {/* Lifecycle Quick Filters */}
        <div className="flex flex-wrap gap-2 border-t border-slate-700 pt-3">
          <span className="inline-block text-xs font-medium text-slate-400">
            Quick filter:
          </span>
          <button
            onClick={() =>
              setFilters((f) => ({ ...f, lifecycle: lifecycleCounts.poc > 0 ? 'poc' : '' }))
            }
            className="rounded-full bg-slate-700/50 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            {lifecycleCounts.poc} PoC
          </button>
          <button
            onClick={() =>
              setFilters((f) => ({
                ...f,
                lifecycle: lifecycleCounts.pilot > 0 ? 'pilot' : '',
              }))
            }
            className="rounded-full bg-slate-700/50 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            {lifecycleCounts.pilot} Pilot
          </button>
          <button
            onClick={() =>
              setFilters((f) => ({
                ...f,
                lifecycle: lifecycleCounts.prod > 0 ? 'prod' : '',
              }))
            }
            className="rounded-full bg-slate-700/50 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            {lifecycleCounts.prod} Prod
          </button>
        </div>
      </div>

      {/* Agents Table */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>No agents found matching your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800">
          <table className="w-full">
            <thead className="border-b border-slate-700 bg-slate-900">
              <tr>
                <SortHeader label="Agent Name" field="name" />
                <SortHeader label="Owner" field="owner" />
                <SortHeader label="State" field="state" />
                <SortHeader label="Lifecycle" field="lifecycle" />
                <SortHeader label="Created" field="created" />
                <SortHeader label="Last Activity" field="activity" />
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent) => (
                <tr
                  key={`${agent.envId}-${agent.botId}`}
                  className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-6 py-3 font-medium">{agent.name}</td>
                  <td className="px-6 py-3 text-sm text-slate-300">
                    {agent.ownerName || (
                      <span className="italic text-slate-600">orphaned</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span
                      className={[
                        'rounded-full px-3 py-1 text-xs font-medium',
                        agent.state === 'Active'
                          ? 'bg-emerald-900/60 text-emerald-200'
                          : 'bg-slate-700/60 text-slate-400',
                      ].join(' ')}
                    >
                      {agent.state}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {agent.lifecycle ? (
                      <span
                        className={[
                          'rounded-full px-3 py-1 text-xs font-medium',
                          agent.lifecycle === 'poc'
                            ? 'bg-blue-900/60 text-blue-200'
                            : agent.lifecycle === 'pilot'
                              ? 'bg-amber-900/60 text-amber-200'
                              : 'bg-emerald-900/60 text-emerald-200',
                        ].join(' ')}
                      >
                        {agent.lifecycle.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-400">
                    {new Date(agent.createdOn).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-400">
                    {agent.lastActivity
                      ? new Date(agent.lastActivity).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Link
                      href={`/agents/${agent.botId}` as any}
                      className="inline-block rounded-md bg-emerald-900/60 px-3 py-1 text-emerald-300 hover:bg-emerald-800/80 transition-colors"
                    >
                      View
                    </Link>
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
