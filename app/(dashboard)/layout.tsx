'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------
const NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { label: 'Live (MVP)',        href: '/live' },
      { label: 'Overview',          href: '/' },
      { label: 'Inventory',         href: '/inventory' },
      { label: 'Sprawl',            href: '/sprawl' },
      { label: 'Cost',              href: '/cost' },
      { label: 'Alerts',            href: '/alerts' },
      { label: 'Conversation KPIs', href: '/conversation-kpis' },
      { label: 'Health',            href: '/health' },
    ],
  },
  {
    label: 'Govern',
    items: [
      { label: 'Compliance',      href: '/compliance' },
      { label: 'Risky Patterns',  href: '/risky-patterns' },
      { label: 'Maturity',        href: '/maturity' },
      { label: 'Release Gates',   href: '/release-gates' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Lifecycle',   href: '/lifecycle' },
      { label: 'Maker View',  href: '/maker-view' },
      { label: 'Ask (AI)',    href: '/ask' },
      { label: 'Settings',    href: '/settings' },
    ],
  },
];

// ---------------------------------------------------------------------------
// NavItem
// ---------------------------------------------------------------------------
function NavItem({ label, href }: { label: string; href: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link
      href={href as any}
      className={[
        'block rounded-md px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-emerald-900/60 text-emerald-300 font-medium'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={[
        'flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      ].join(' ')}
    >
      {/* Logo / brand bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-emerald-400">AgentLens</span>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          {/* Simple chevron icon via SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={['h-4 w-4 transition-transform', collapsed ? 'rotate-180' : ''].join(' ')}
          >
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-slate-600">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) =>
                collapsed ? (
                  // Collapsed: show dot only, full label in title tooltip
                  <li key={item.href}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Link
                      href={item.href as any}
                      title={item.label}
                      className="flex h-8 w-full items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    </Link>
                  </li>
                ) : (
                  <li key={item.href}>
                    <NavItem label={item.label} href={item.href} />
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="shrink-0 border-t border-slate-800 px-4 py-3">
          <p className="text-xs text-slate-600">v2.0.0-beta</p>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
