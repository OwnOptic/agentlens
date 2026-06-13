'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ScanEye, Radar, LayoutDashboard, Boxes, Network, DollarSign, Bell,
  MessagesSquare, HeartPulse, ShieldCheck, AlertTriangle, Gauge, DoorClosed,
  Workflow, UserCog, Sparkles, Settings, ChevronLeft, ShieldAlert, Menu, X,
  type LucideIcon,
} from 'lucide-react';
import { UserChip } from '@/components/auth/UserChip';

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------
type NavItemT = { label: string; href: string; icon: LucideIcon };
const NAV_GROUPS: { label: string; items: NavItemT[] }[] = [
  {
    label: 'Monitor',
    items: [
      { label: 'Overview',          href: '/',                  icon: LayoutDashboard },
      { label: 'Agent Discovery',   href: '/discovery',         icon: Radar },
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
      { label: 'DLP Advisor',    href: '/dlp-advisor',    icon: ShieldAlert },
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

// ---------------------------------------------------------------------------
// NavItem
// ---------------------------------------------------------------------------
function NavItem({ item, collapsed, onNavigate }: { item: NavItemT; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  const Icon = item.icon;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link
      href={item.href as any}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
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

// ---------------------------------------------------------------------------
// Sidebar inner content (shared between desktop + mobile drawer)
// ---------------------------------------------------------------------------
function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
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
        {onToggle && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            <ChevronLeft className={['h-4 w-4 transition-transform', collapsed ? 'rotate-180' : ''].join(' ')} />
          </button>
        )}
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
                  <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800/80 px-4 py-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="mx-auto h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
            <UserChip collapsed />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">v3.0.0-beta</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                connected
              </span>
            </div>
            <UserChip />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar
// ---------------------------------------------------------------------------
function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={[
        'hidden lg:flex flex-col border-r border-slate-800/80 bg-slate-900/70 backdrop-blur transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      ].join(' ')}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer
// ---------------------------------------------------------------------------
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800/80 bg-slate-900 lg:hidden">
        <SidebarContent collapsed={false} onNavigate={onClose} />
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="absolute right-3 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Real-data routes - these show live tenant data, not demo seed data.
// ---------------------------------------------------------------------------
const REAL_DATA_ROUTES = ['/', '/discovery', '/ask', '/conversation-kpis', '/dlp-advisor', '/settings'];

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

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const isDemo = !REAL_DATA_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <div className="flex min-h-screen bg-slate-950 text-white selection:bg-emerald-500/30">
      {/* subtle ambient gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_40rem_at_120%_-10%,rgba(16,185,129,0.06),transparent)]" />

      {/* Mobile hamburger - fixed top-left, only below lg */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/90 ring-1 ring-slate-800 text-slate-400 hover:text-slate-200 lg:hidden"
      >
        <Menu className="h-5 w-5" strokeWidth={2} />
      </button>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Desktop sidebar */}
      <DesktopSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <main className="relative flex-1 overflow-auto">
        {isDemo && <DemoBanner />}
        {children}
      </main>
    </div>
  );
}
