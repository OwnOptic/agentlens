'use client';

import React, { useState, useMemo } from 'react';
import type { Environment, MigrationStatus } from '@/lib/types';
import { mockEnvironments, mockAgents, mockCapacity } from '@/lib/mock/seed';
import {
  Network,
  Server,
  Boxes,
  TrendingUp,
  Workflow,
  Activity,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
  InfoTip,
  DataSourceBadge,
} from '@/components/ui';

interface EnvironmentSprawlCard {
  environment: Environment;
  agentCount: number;
  activeAgents: number;
  inactiveAgents: number;
  migrationStatus: Record<MigrationStatus, number>;
}

export default function SprawlPage() {
  const [migrationState, setMigrationState] = useState<Record<string, MigrationStatus>>({});

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
  const prodEnvCount = sprawlData.filter((s) => s.environment.type === 'Production').length;

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

  const migrationBadgeVariant = (status: MigrationStatus) => {
    if (status === 'moved') return 'success' as const;
    if (status === 'notified') return 'warning' as const;
    return 'info' as const;
  };

  const migrationLabel: Record<MigrationStatus, string> = {
    to_migrate: 'To Migrate',
    notified: 'Notified',
    moved: 'Moved',
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
          ? 'bg-emerald-600/80 text-emerald-100'
          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="p-8">
      <PageHeader
        icon={Network}
        title="Environment Sprawl"
        subtitle="Monitor multi-environment agent distribution and migration progress"
        tone="sky"
        badge={<DataSourceBadge state="demo" source="sample data" />}
        actions={
          <Button icon={RefreshCw} variant="ghost">Refresh</Button>
        }
      />

      {/* Overall KPIs */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <StatCard
            icon={Server}
            label="Total Environments"
            value={totalEnvs}
            sublabel={`${prodEnvCount} Production`}
            tone="sky"
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Total Environments">
              All Copilot Studio environments in the tenant. Sample data until connected.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={Boxes}
            label="Total Agents"
            value={totalAgents}
            sublabel="across all environments"
            tone="emerald"
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Total Agents">
              Aggregate count across all environments. Sample data until live.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={AlertTriangle}
            label="Default Env Agents"
            value={defaultEnvData?.agentCount || 0}
            sublabel={`${defaultEnvData?.activeAgents || 0} active`}
            tone="amber"
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Default Environment">
              Agents in the default environment. Often a sprawl risk. Sample data.
            </InfoTip>
          </div>
        </div>
        <div className="relative">
          <StatCard
            icon={TrendingUp}
            label="Migration Progress"
            value={`${overallMigrationProgress.pctMoved}%`}
            sublabel={`${overallMigrationProgress.moved} agents moved`}
            tone={overallMigrationProgress.pctMoved === 100 ? 'emerald' : overallMigrationProgress.pctMoved > 50 ? 'sky' : 'amber'}
          />
          <div className="absolute top-4 right-4">
            <InfoTip label="Migration Progress">
              Track of agents migrated to dedicated environments. Stateful demo.
            </InfoTip>
          </div>
        </div>
      </div>

      {/* Overall Migration Progress Bar */}
      <Card className="mb-6 p-4">
        <SectionTitle icon={Workflow} right={
          <span className="text-xs text-slate-500">
            {overallMigrationProgress.moved} / {totalAgents} agents
          </span>
        }>
          Rollup Migration Progress
        </SectionTitle>
        <div className="space-y-3">
          <div className="h-6 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-950">
            <div
              className="flex h-full items-center transition-all duration-500"
              style={{
                width: `${overallMigrationProgress.pctMoved}%`,
                background: 'linear-gradient(90deg, #059669, #10b981)',
              }}
            >
              <span className="ml-2 text-xs font-bold text-white">
                {overallMigrationProgress.pctMoved > 10 && `${overallMigrationProgress.pctMoved}%`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <Badge variant="info">{overallMigrationProgress.toMigrate} To Migrate</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="warning">{overallMigrationProgress.notified} Notified</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="success">{overallMigrationProgress.moved} Moved</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Environment Cards with Agent Lists */}
      <div className="space-y-4">
        <SectionTitle icon={Network}>Environments</SectionTitle>
        {sprawlData.map((data) => (
          <Card key={data.environment.id} className="p-6">
            {/* Env Header */}
            <div className="mb-4 flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-100">{data.environment.name}</h3>
                  {data.environment.isDefault && (
                    <Badge variant="info">Default</Badge>
                  )}
                  {data.environment.type === 'Production' && (
                    <Badge variant="accent">Production</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {data.environment.type} &bull; {data.environment.region}
                </p>
              </div>
              <Badge variant="neutral">{data.agentCount} agents</Badge>
            </div>

            {/* Env Stats */}
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-950/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success" dot>{data.activeAgents} Active</Badge>
                  <Badge variant="neutral">{data.inactiveAgents} Inactive</Badge>
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Migration</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">{data.migrationStatus.to_migrate} To Migrate</Badge>
                  <Badge variant="warning">{data.migrationStatus.notified} Notified</Badge>
                  <Badge variant="success">{data.migrationStatus.moved} Moved</Badge>
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Capacity</p>
                {(() => {
                  const cap = mockCapacity.find((c) => c.envId === data.environment.id);
                  if (!cap) return <span className="text-xs text-slate-500">N/A</span>;
                  return (
                    <div className="space-y-1.5">
                      <div className="h-1.5 w-full rounded-full bg-slate-800">
                        <div
                          className={[
                            'h-full rounded-full transition-all',
                            cap.overage ? 'bg-red-500' : cap.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500',
                          ].join(' ')}
                          style={{ width: `${Math.min(cap.pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{cap.pct.toFixed(1)}%</span>
                        {cap.overage && <Badge variant="critical">OVERAGE</Badge>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Agent Migration State Buttons */}
            {data.agentCount > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                <SectionTitle icon={Activity} right={
                  <span className="text-xs text-slate-500">{data.agentCount} agents</span>
                }>
                  Agents
                </SectionTitle>
                <div className="space-y-2">
                  {mockAgents
                    .filter((a) => a.envId === data.environment.id)
                    .map((agent) => {
                      const key = `${agent.envId}/${agent.botId}`;
                      const status = migrationState[key] || 'to_migrate';
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-200">{agent.name}</p>
                            <p className="text-xs text-slate-500">
                              {agent.ownerName || 'orphaned'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={migrationBadgeVariant(status)}>
                              {migrationLabel[status]}
                            </Badge>
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
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
