import React from 'react';
import type { Environment } from '@/lib/types';

export const metadata = {
  title: 'Environment Sprawl',
};

interface EnvironmentSprawlCard {
  environment: Environment;
  agentCount: number;
}

export default async function SprawlPage() {
  // TODO: Fetch environments and agent counts
  const sprawlData: EnvironmentSprawlCard[] = [];

  return (
    <div>
      <h2 className="mb-6 text-3xl font-bold">Environment Sprawl</h2>

      {sprawlData.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>No environments found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sprawlData.map((item) => (
            <div
              key={item.environment.id}
              className="rounded-lg border border-slate-700 bg-slate-800 p-6"
            >
              <h3 className="mb-2 text-lg font-semibold">
                {item.environment.name}
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                {item.environment.type}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Region:</span>
                  <span className="font-medium">{item.environment.region}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Agents:</span>
                  <span className="font-medium text-emerald-400">
                    {item.agentCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Default:</span>
                  <span className="font-medium">
                    {item.environment.isDefault ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
