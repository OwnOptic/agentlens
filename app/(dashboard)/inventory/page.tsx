'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Agent, Environment } from '@/lib/types';
import { mockAgents, mockEnvironments, mockCapacity, mockMetrics } from '@/lib/mock/seed';
import {
  Boxes,
  Users,
  Gauge,
  DollarSign,
  Activity,
  Filter,
  ExternalLink,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
} from '@/components/ui';

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
        (a.ownerName || '').toLowerCase().includes(filters.owner.toLowerCase())
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

  const envName = environments.find((e) => e.id === filters.env)?.name || 'Unknown';

  const lifecycleCounts = {
    poc: filtered.filter((a) => a.lifecycle === 'poc').length,
    pilot: filtered.filter((a) => a.lifecycle === 'pilot').length,
    prod: filtered.filter((a) => a.lifecycle === 'prod').length,
  };

  const stateCounts = {
    active: filtered.filter((a) => a.state === 'Active').length,
    inactive: filtered.filter((a) => a.state === 'Inactive').length,
  };

  const SortHeader = ({ label, field }: { label: string; field: SortField }) => (
    <th
      className="cursor-pointer px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500 hover:bg-slate-800/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-2">
        {label}
        <span className="text-slate-600">
          {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '-'}
        </span>
      </div>
    </th>
  );

  const lifecycleBadgeVariant = (lc: string | undefined) => {
    if (lc === 'poc') return 'info' as const;
    if (lc === 'pilot') return 'warning' as const;
    if (lc === 'prod') return 'success' as const;
    return 'neutral' as const;
  };

  return (
    <div className="p-8">
      <PageHeader
        icon={Boxes}
        title="Agent Inventory"
        subtitle="Filter and explore agents across your Copilot Studio environments"
        tone="emerald"
        actions={
          <>
            <Button icon={RefreshCw} variant="ghost">Refresh</Button>
            <Button icon={Download} variant="ghost">Export</Button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Boxes}
          label="Total Agents"
          value={filtered.length}
          sublabel={`in ${envName}`}
          tone="emerald"
        />
        <StatCard
          icon={Gauge}
          label="Credit Usage"
          value={`${capacity.pct.toFixed(1)}%`}
          sublabel={`${capacity.creditUsed.toLocaleString()} / ${capacity.creditLimit.toLocaleString()}`}
          tone={capacity.pct > 90 ? 'red' : capacity.pct > 75 ? 'amber' : 'sky'}
        />
        <StatCard
          icon={DollarSign}
          label="Daily Cost"
          value={`$${totalCost.toFixed(2)}`}
          sublabel={`Projected: $${avgProjectedMonthly.toFixed(2)}/mo`}
          tone="violet"
        />
        <StatCard
          icon={Activity}
          label="Active Agents"
          value={stateCounts.active}
          sublabel={`${stateCounts.inactive} inactive`}
          delta="flat"
          tone="emerald"
        />
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <SectionTitle icon={Filter}>Filters</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Environment Filter */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Environment</label>
            <select
              value={filters.env}
              onChange={(e) => setFilters((f) => ({ ...f, env: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>{env.name}</option>
              ))}
            </select>
          </div>

          {/* Owner Filter */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Owner</label>
            <input
              type="text"
              placeholder="Filter by owner..."
              value={filters.owner}
              onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* State Filter */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">State</label>
            <select
              value={filters.state}
              onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All States</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Lifecycle Filter */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Lifecycle</label>
            <select
              value={filters.lifecycle}
              onChange={(e) => setFilters((f) => ({ ...f, lifecycle: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Stages</option>
              <option value="poc">PoC</option>
              <option value="pilot">Pilot</option>
              <option value="prod">Production</option>
            </select>
          </div>
        </div>

        {/* Lifecycle Quick Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <span className="text-xs font-medium text-slate-500">Quick filter:</span>
          <button
            onClick={() => setFilters((f) => ({ ...f, lifecycle: lifecycleCounts.poc > 0 ? 'poc' : '' }))}
            className="rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-400 ring-1 ring-sky-500/25 hover:bg-sky-500/20 transition-colors"
          >
            {lifecycleCounts.poc} PoC
          </button>
          <button
            onClick={() => setFilters((f) => ({ ...f, lifecycle: lifecycleCounts.pilot > 0 ? 'pilot' : '' }))}
            className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-400 ring-1 ring-amber-500/25 hover:bg-amber-500/20 transition-colors"
          >
            {lifecycleCounts.pilot} Pilot
          </button>
          <button
            onClick={() => setFilters((f) => ({ ...f, lifecycle: lifecycleCounts.prod > 0 ? 'prod' : '' }))}
            className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
          >
            {lifecycleCounts.prod} Prod
          </button>
        </div>
      </Card>

      {/* Agents Table */}
      <Card>
        <SectionTitle icon={Users} right={<span className="text-xs text-slate-500">{sorted.length} agents</span>}>
          <span className="px-4 pt-4 block">Agents</span>
        </SectionTitle>
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p>No agents found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800 bg-slate-950/50">
                <tr>
                  <SortHeader label="Agent Name" field="name" />
                  <SortHeader label="Owner" field="owner" />
                  <SortHeader label="State" field="state" />
                  <SortHeader label="Lifecycle" field="lifecycle" />
                  <SortHeader label="Created" field="created" />
                  <SortHeader label="Last Activity" field="activity" />
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((agent) => (
                  <tr
                    key={`${agent.envId}-${agent.botId}`}
                    className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30"
                  >
                    <td className="px-6 py-3 font-medium text-slate-100">{agent.name}</td>
                    <td className="px-6 py-3 text-sm text-slate-300">
                      {agent.ownerName || (
                        <span className="italic text-slate-600">orphaned</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <Badge variant={agent.state === 'Active' ? 'success' : 'neutral'} dot={agent.state === 'Active'}>
                        {agent.state}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {agent.lifecycle ? (
                        <Badge variant={lifecycleBadgeVariant(agent.lifecycle)}>
                          {agent.lifecycle.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-400">
                      {new Date(agent.createdOn).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-400">
                      {agent.lastActivity ? new Date(agent.lastActivity).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Button icon={ExternalLink} href={`/agents/${agent.botId}` as any} variant="ghost">
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
