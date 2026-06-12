'use client';

import React, { useState, useMemo } from 'react';
import type { Environment, MigrationStatus } from '@/lib/types';
import { mockEnvironments, mockAgents, mockCapacity } from '@/lib/mock/seed';


interface EnvironmentSprawlCard {
  environment: Environment;
  agentCount: number;
  activeAgents: number;
  inactiveAgents: number;
  migrationStatus: Record<MigrationStatus, number>;
}

export default function SprawlPage() {
  const [migrationState, setMigrationState] = useState<
    Record<string, MigrationStatus>
  >({});

  const sprawlData: EnvironmentSprawlCard[] = useMemo(() => {
    return mockEnvironments.map((env) => {
      const agents = mockAgents.filter((a) => a.envId === env.id);
      const activeAgents = agents.filter((a) => a.state === 'Active').length;
      const inactiveAgents = agents.filter((a) => a.state === 'Inactive').length;

      const migrationCounts: Record<MigrationStatus, number> = {
        to_migrate: 0,
        notified: 0,
        moved: 0,
      };

      agents.forEach((agent) => {
        const key = `${agent.envId}/${agent.botId}`;
        const status = migrationState[key] || 'to_migrate';
        migrationCounts[status]++;
      });

      return {
        environment: env,
        agentCount: agents.length,
        activeAgents,
        inactiveAgents,
        migrationStatus: migrationCounts,
      };
    });
  }, [migrationState]);

  const totalAgents = mockAgents.length;
  const totalEnvs = mockEnvironments.length;
  const defaultEnvData = sprawlData.find((s) => s.environment.isDefault);
  const prodEnvCount = sprawlData.filter(
    (s) => s.environment.type === 'Production'
  ).length;

  const overallMigrationProgress = useMemo(() => {
    let toMigrate = 0;
    let notified = 0;
    let moved = 0;

    sprawlData.forEach((env) => {
      toMigrate += env.migrationStatus.to_migrate;
      notified += env.migrationStatus.notified;
      moved += env.migrationStatus.moved;
    });

    const total = toMigrate + notified + moved;
    return {
      toMigrate,
      notified,
      moved,
      pctMoved: total > 0 ? Math.round((moved / total) * 100) : 0,
    };
  }, [sprawlData]);

  const handleMigrationStateChange = (
    envId: string,
    botId: string,
    newStatus: MigrationStatus
  ) => {
    setMigrationState((prev) => ({
      ...prev,
      [`${envId}/${botId}`]: newStatus,
    }));
  };

  const MigrationButton = ({
    envId,
    botId,
    status,
    targetStatus,
    label,
  }: {
    envId: string;
    botId: string;
    status: MigrationStatus;
    targetStatus: MigrationStatus;
    label: string;
  }) => (
    <button
      onClick={() => handleMigrationStateChange(envId, botId, targetStatus)}
      className={[
        'rounded-md px-2 py-1 text-xs font-medium transition-colors',
        status === targetStatus
          ? 'bg-emerald-900/80 text-emerald-200'
          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="mb-2 text-3xl font-bold">Environment Sprawl</h2>
        <p className="text-slate-400">
          Monitor multi-environment agent distribution and migration progress
        </p>
      </div>

      {/* Overall KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Total Environments</p>
          <p className="mt-2 text-2xl font-bold">{totalEnvs}</p>
          <p className="mt-1 text-xs text-slate-500">
            {prodEnvCount} Production
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Total Agents</p>
          <p className="mt-2 text-2xl font-bold">{totalAgents}</p>
          <p className="mt-1 text-xs text-slate-500">across all environments</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Default Env Agents</p>
          <p className="mt-2 text-2xl font-bold">
            {defaultEnvData?.agentCount || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {defaultEnvData?.activeAgents || 0} active
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Migration Progress</p>
          <p className="mt-2 text-2xl font-bold">
            {overallMigrationProgress.pctMoved}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {overallMigrationProgress.moved} agents moved
          </p>
        </div>
      </div>

      {/* Overall Migration Progress Bar */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Rollup Migration Progress</h3>
          <span className="text-sm text-slate-400">
            {overallMigrationProgress.moved} / {totalAgents} agents
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-6 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-900">
            <div
              className="flex h-full items-center"
              style={{
                width: `${overallMigrationProgress.pctMoved}%`,
                background: 'linear-gradient(90deg, #059669, #10b981)',
              }}
            >
              <span className="ml-2 text-xs font-bold text-white">
                {overallMigrationProgress.pctMoved > 10 &&
                  `${overallMigrationProgress.pctMoved}%`}
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-xs text-slate-400">
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1"></span>
              To Migrate: {overallMigrationProgress.toMigrate}
            </div>
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
              Notified: {overallMigrationProgress.notified}
            </div>
            <div>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1"></span>
              Moved: {overallMigrationProgress.moved}
            </div>
          </div>
        </div>
      </div>

      {/* Environment Cards with Agent Lists */}
      <div className="space-y-4">
        {sprawlData.map((data) => (
          <div
            key={data.environment.id}
            className="rounded-lg border border-slate-700 bg-slate-800/30 p-6"
          >
            {/* Env Header */}
            <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-4">
              <div>
                <h3 className="text-lg font-semibold">{data.environment.name}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {data.environment.type} • {data.environment.region}
                </p>
              </div>
              <div className="rounded-full bg-slate-700/50 px-3 py-1 text-sm font-medium">
                {data.agentCount} agents
              </div>
            </div>

            {/* Env Stats */}
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-900/50 p-3">
                <p className="text-xs font-medium text-slate-400">Status</p>
                <div className="mt-2 flex gap-2">
                  <span className="inline-block rounded-full bg-emerald-900/60 px-2 py-1 text-xs text-emerald-300">
                    {data.activeAgents} Active
                  </span>
                  <span className="inline-block rounded-full bg-slate-700/60 px-2 py-1 text-xs text-slate-400">
                    {data.inactiveAgents} Inactive
                  </span>
                </div>
              </div>
              <div className="rounded-md bg-slate-900/50 p-3">
                <p className="text-xs font-medium text-slate-400">Migration</p>
                <div className="mt-2 flex gap-2">
                  <span className="inline-block rounded-full bg-blue-900/60 px-2 py-1 text-xs text-blue-300">
                    {data.migrationStatus.to_migrate} To Migrate
                  </span>
                  <span className="inline-block rounded-full bg-amber-900/60 px-2 py-1 text-xs text-amber-300">
                    {data.migrationStatus.notified} Notified
                  </span>
                </div>
              </div>
              <div className="rounded-md bg-slate-900/50 p-3">
                <p className="text-xs font-medium text-slate-400">Capacity</p>
                <div className="mt-2">
                  {(() => {
                    const cap = mockCapacity.find(
                      (c) => c.envId === data.environment.id
                    );
                    if (!cap) return <span className="text-xs text-slate-500">N/A</span>;
                    return (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full border border-slate-600 bg-slate-900">
                          <div
                            className={[
                              'h-full rounded-full transition-colors',
                              cap.overage
                                ? 'bg-red-500'
                                : cap.pct > 80
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500',
                            ].join(' ')}
                            style={{ width: `${Math.min(cap.pct, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-slate-400">
                          {cap.pct.toFixed(1)}% {cap.overage && '(OVERAGE)'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Agent Migration State Buttons */}
            {data.agentCount > 0 && (
              <div className="rounded-md border border-slate-700 bg-slate-900/50 p-4">
                <p className="mb-3 text-sm font-medium">Agents</p>
                <div className="space-y-2">
                  {mockAgents
                    .filter((a) => a.envId === data.environment.id)
                    .map((agent) => {
                      const key = `${agent.envId}/${agent.botId}`;
                      const status = migrationState[key] || 'to_migrate';
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-md bg-slate-800/50 p-2"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{agent.name}</p>
                            <p className="text-xs text-slate-500">
                              {agent.ownerName || 'orphaned'}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <MigrationButton
                              envId={agent.envId}
                              botId={agent.botId}
                              status={status}
                              targetStatus="to_migrate"
                              label="To Migrate"
                            />
                            <MigrationButton
                              envId={agent.envId}
                              botId={agent.botId}
                              status={status}
                              targetStatus="notified"
                              label="Notified"
                            />
                            <MigrationButton
                              envId={agent.envId}
                              botId={agent.botId}
                              status={status}
                              targetStatus="moved"
                              label="Moved"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
