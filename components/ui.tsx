import React from 'react';
import { type LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * AgentLens shared UI primitives - dark, glassy, icon-forward.
 * ------------------------------------------------------------------ */

export type Tone = 'emerald' | 'sky' | 'amber' | 'red' | 'violet' | 'slate';

const TONE: Record<Tone, { text: string; bg: string; ring: string; icon: string }> = {
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/25', icon: 'text-emerald-400' },
  sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     ring: 'ring-sky-500/25',     icon: 'text-sky-400' },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/25',   icon: 'text-amber-400' },
  red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     ring: 'ring-red-500/25',     icon: 'text-red-400' },
  violet:  { text: 'text-violet-400',  bg: 'bg-violet-500/10',  ring: 'ring-violet-500/25',  icon: 'text-violet-400' },
  slate:   { text: 'text-slate-300',   bg: 'bg-slate-500/10',   ring: 'ring-slate-500/25',   icon: 'text-slate-400' },
};

/* Card ------------------------------------------------------------- */
export function Card({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={[
        'rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm',
        hover ? 'transition-colors hover:border-slate-700 hover:bg-slate-900/80' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

/* Badge ------------------------------------------------------------ */
export type BadgeVariant = 'success' | 'warning' | 'critical' | 'info' | 'neutral' | 'accent';
const BADGE: Record<BadgeVariant, string> = {
  success:  'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
  warning:  'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  critical: 'bg-red-500/10 text-red-400 ring-red-500/30',
  info:     'bg-sky-500/10 text-sky-400 ring-sky-500/30',
  neutral:  'bg-slate-500/10 text-slate-400 ring-slate-500/30',
  accent:   'bg-emerald-600/15 text-emerald-300 ring-emerald-500/40',
};
export function Badge({ children, variant = 'neutral', dot = false, className = '' }: { children: React.ReactNode; variant?: BadgeVariant; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${BADGE[variant]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* StatCard --------------------------------------------------------- */
export function StatCard({
  icon: Icon, label, value, delta, sublabel, tone = 'emerald',
}: {
  icon: LucideIcon; label: string; value: React.ReactNode; delta?: 'up' | 'down' | 'flat'; sublabel?: string; tone?: Tone;
}) {
  const t = TONE[tone];
  const DeltaIcon = delta === 'up' ? ArrowUpRight : delta === 'down' ? ArrowDownRight : Minus;
  const deltaColor = delta === 'up' ? 'text-emerald-400' : delta === 'down' ? 'text-red-400' : 'text-slate-500';
  return (
    <Card hover className="p-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.bg} ring-1 ${t.ring}`}>
          <Icon className={`h-[18px] w-[18px] ${t.icon}`} strokeWidth={2} />
        </div>
        {delta && <DeltaIcon className={`h-4 w-4 ${deltaColor}`} />}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-400">{label}</p>
      {sublabel && <p className="mt-1 text-[11px] text-slate-500">{sublabel}</p>}
    </Card>
  );
}

/* PageHeader ------------------------------------------------------- */
export function PageHeader({
  icon: Icon, title, subtitle, badge, actions, tone = 'emerald',
}: {
  icon: LucideIcon; title: string; subtitle?: string; badge?: React.ReactNode; actions?: React.ReactNode; tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.bg} ring-1 ${t.ring}`}>
          <Icon className={`h-5 w-5 ${t.icon}`} strokeWidth={2} />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* SectionTitle ----------------------------------------------------- */
export function SectionTitle({ icon: Icon, children, right }: { icon?: LucideIcon; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

/* Button ----------------------------------------------------------- */
export function Button({
  children, onClick, variant = 'ghost', icon: Icon, href, ...rest
}: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; icon?: LucideIcon; href?: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const cls = [
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    variant === 'primary'
      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
      : 'bg-slate-800/80 text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700',
  ].join(' ');
  const inner = (<>{Icon && <Icon className="h-4 w-4" />}{children}</>);
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}

/* InfoTip - info bubble with a hover tooltip ----------------------- */
export function InfoTip({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 cursor-help text-slate-500 hover:text-slate-300" fill="currentColor" aria-label={label ?? 'info'}>
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 10.5a.75.75 0 01-1.5 0V7.5a.75.75 0 011.5 0v4zM8 6a1 1 0 110-2 1 1 0 010 2z" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-xl group-hover:block">
        {children}
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-slate-700 bg-slate-900" />
      </span>
    </span>
  );
}

/* DataSourceBadge - provenance: where this data comes from + state - */
export type DataState = 'live' | 'demo' | 'not_connected';
export function DataSourceBadge({ state, source }: { state: DataState; source: string }) {
  const map: Record<DataState, { variant: BadgeVariant; dot: boolean; label: string }> = {
    live:          { variant: 'success', dot: true,  label: 'Live' },
    demo:          { variant: 'warning', dot: false, label: 'Demo data' },
    not_connected: { variant: 'neutral', dot: false, label: 'Not connected' },
  };
  const m = map[state];
  return (
    <Badge variant={m.variant} dot={m.dot}>
      {m.label} · {source}
    </Badge>
  );
}
