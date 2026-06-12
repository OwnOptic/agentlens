'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ScanEye, Radio, Radar, LayoutDashboard, Boxes, Network, DollarSign, Bell,
  MessagesSquare, HeartPulse, ShieldCheck, AlertTriangle, Gauge, DoorClosed,
  Workflow, UserCog, Sparkles, Settings, ChevronLeft, type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Nav structure (with icons)
// ---------------------------------------------------------------------------
type NavItemT = { label: string; href: string; icon: LucideIcon };
const NAV_GROUPS: { label: string; items: NavItemT[] }[] = [
  {
    label: 'Monitor',
    items: [
      { label: 'Live (MVP)',        href: '/live',              icon: Radio },
      { label: 'Agent Discovery',   href: '/discovery',         icon: Radar },
      { label: 'Overview',          href: '/',                  icon: LayoutDashboard },
      { label: 'Inventory',         href: '/inventory',         icon: Boxes },
      { label: 'Sprawl',            href: '/sprawl',            icon: Network },
      { label: 'Cost',              href: '/cost',              icon: DollarSign },
      { label: 'Alerts',            href: '/alerts',            icon: Bell },
      { label: 'Conversation KPIs', href: '/conversation-kpis', icon: MessagesSquare },
      { label: 'Health',            href: '/health',            icon: HeartPulse },
    ],
  },
  {
    label: 'Govern',
    items: [
      { label: 'Compliance',     href: '/compliance',     icon: ShieldCheck },
      { label: 'Risky Patterns', href: '/risky-patterns', icon: AlertTriangle },
      { label: 'Maturity',       href: '/maturity',       icon: Gauge },
      { label: 'Release Gates',  href: '/release-gates',  icon: DoorClosed },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Lifecycle',  href: '/lifecycle',  icon: Workflow },
      { label: 'Maker View', href: '/maker-view', icon: UserCog },
      { label: 'Ask (AI)',   href: '/ask',        icon: Sparkles },
      { label: 'Settings',   href: '/settings',   icon: Settings },
    ],
  },
];

function NavItem({ item, collapsed }: { item: NavItemT; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  const Icon = item.icon;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link
      href={item.href as any}
      title={collapsed ? item.label : undefined}
      className={[
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        collapsed ? 'justify-center px-0' : '',
        isActive
          ? 'bg-emerald-500/10 text-emerald-300 font-medium'
          : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
      ].join(' ')}
    >
      {isActive && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-emerald-400" />
      )}
      <Icon
        className={['h-[18px] w-[18px] shrink-0', isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'].join(' ')}
        strokeWidth={2}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={[
        'flex flex-col border-r border-slate-800/80 bg-slate-900/70 backdrop-blur transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-800/80 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <ScanEye className="h-5 w-5 text-emerald-400" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-slate-100">AgentLens</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Agent Governance</p>
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          <ChevronLeft className={['h-4 w-4 transition-transform', collapsed ? 'rotate-180' : ''].join(' ')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavItem item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800/80 px-4 py-3">
        {collapsed ? (
          <div className="mx-auto h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-600">v2.0.0-beta</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              connected
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

// Routes that show REAL tenant data - everything else is demo seed data.
const REAL_DATA_ROUTES = ['/live', '/discovery', '/ask', '/conversation-kpis'];

function DemoBanner() {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-300 backdrop-blur">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>DEMO DATA</strong> - sample figures, <strong>not your tenant</strong>. Real data is only on{' '}
        <span className="text-amber-200">Live (MVP)</span>, <span className="text-amber-200">Agent Discovery</span>, and{' '}
        <span className="text-amber-200">Ask (AI)</span>.
      </span>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isDemo = !REAL_DATA_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  return (
    <div className="flex min-h-screen bg-slate-950 text-white selection:bg-emerald-500/30">
      {/* subtle ambient gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_40rem_at_120%_-10%,rgba(16,185,129,0.06),transparent)]" />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="relative flex-1 overflow-auto">
        {isDemo && <DemoBanner />}
        {children}
      </main>
    </div>
  );
}
