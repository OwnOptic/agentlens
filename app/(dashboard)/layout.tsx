import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'AgentLens Dashboard',
  description: 'Copilot Studio agent governance and insights',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 p-6">
        <h1 className="mb-8 text-2xl font-bold text-emerald-400">AgentLens</h1>
        <nav className="space-y-2">
          <Link
            href="/inventory"
            className="block rounded-lg px-4 py-2 hover:bg-slate-800"
          >
            Inventory
          </Link>
          <Link
            href="/sprawl"
            className="block rounded-lg px-4 py-2 hover:bg-slate-800"
          >
            Sprawl
          </Link>
          <Link
            href="/cost"
            className="block rounded-lg px-4 py-2 hover:bg-slate-800"
          >
            Cost
          </Link>
          <Link
            href="/alerts"
            className="block rounded-lg px-4 py-2 hover:bg-slate-800"
          >
            Alerts
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
