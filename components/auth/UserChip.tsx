'use client';

/**
 * UserChip - sidebar footer identity indicator.
 *
 * Auth state is derived entirely from NextAuth's own public endpoints, so this
 * client component never imports server-only modules (process.env.* auth flags
 * are not available in the browser - importing the server guard here would make
 * the chip always read "not configured" even when SSO is live in production):
 *
 *   GET /api/auth/providers -> {} when no provider configured (auth-optional
 *                              dev mode), or { "azure-ad": {...} } when SSO is on
 *   GET /api/auth/session   -> { user } when signed in, null otherwise
 *
 * States:
 *   - loading        : probing the endpoints
 *   - no_auth        : SSO not configured (dev / pre-setup) -> subtle setup hint
 *   - unauthenticated: SSO on, not signed in -> "Sign in" link
 *   - authenticated  : SSO on, signed in -> name + sign-out button
 */

import React from 'react';
import Link from 'next/link';
import { LogOut, LogIn, UserCircle2 } from 'lucide-react';

type ChipState = 'loading' | 'no_auth' | 'unauthenticated' | 'authenticated' | 'error';

interface ChipInfo {
  state: ChipState;
  name?: string;
}

function useAuthChip(): ChipInfo {
  const [info, setInfo] = React.useState<ChipInfo>({ state: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) Is any SSO provider configured?
        const provRes = await fetch('/api/auth/providers', { credentials: 'include' });
        const providers = provRes.ok ? ((await provRes.json()) as Record<string, unknown> | null) : null;
        const authConfigured = Boolean(providers && Object.keys(providers).length > 0);

        if (cancelled) return;
        if (!authConfigured) {
          setInfo({ state: 'no_auth' });
          return;
        }

        // 2) SSO is on - are we signed in?
        const sessRes = await fetch('/api/auth/session', { credentials: 'include' });
        const session = sessRes.ok ? ((await sessRes.json()) as { user?: { name?: string } } | null) : null;
        if (cancelled) return;
        setInfo(
          session?.user
            ? { state: 'authenticated', name: session.user.name }
            : { state: 'unauthenticated' },
        );
      } catch {
        // Fetch threw (network error, CORS, etc.) - distinguish from a genuinely unconfigured auth
        if (!cancelled) setInfo({ state: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

function signOutSafe(): void {
  import('next-auth/react').then(({ signOut }) => signOut()).catch(() => {});
}

interface UserChipProps {
  /** Collapsed sidebar: only render a minimal icon */
  collapsed?: boolean;
}

export function UserChip({ collapsed = false }: UserChipProps) {
  const { state, name } = useAuthChip();

  // Loading
  if (state === 'loading') {
    return collapsed ? (
      <div className="h-5 w-5 animate-pulse rounded-full bg-slate-700" />
    ) : (
      <div className="h-5 w-24 animate-pulse rounded bg-slate-800" />
    );
  }

  // Transient fetch error - neutral indicator, no "set up" hint
  if (state === 'error') {
    if (collapsed) {
      return (
        <div
          title="Auth status unavailable"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700"
        >
          <UserCircle2 className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} />
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-700">
        <UserCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
        Auth unavailable
      </span>
    );
  }

  // SSO not configured - subtle setup hint linking to the Setup page
  if (state === 'no_auth') {
    if (collapsed) {
      return (
        <Link
          href="/settings"
          title="Sign-in not configured - open Setup"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700 hover:bg-slate-700 transition-colors"
        >
          <UserCircle2 className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
        </Link>
      );
    }
    return (
      <Link
        href="/settings"
        title="Configure Entra sign-in in Setup"
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-slate-700 hover:bg-slate-700 hover:text-slate-200 transition-colors"
      >
        <UserCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
        Sign-in not set up
      </Link>
    );
  }

  // SSO on - signed out
  if (state === 'unauthenticated') {
    if (collapsed) {
      return (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={'/api/auth/signin' as any}
          title="Sign in"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <LogIn className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
        </Link>
      );
    }
    return (
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href={'/api/auth/signin' as any}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        <LogIn className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        Sign in
      </Link>
    );
  }

  // SSO on - signed in
  if (collapsed) {
    return (
      <button
        onClick={signOutSafe}
        title={`Signed in as ${name ?? 'user'} - click to sign out`}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 hover:bg-slate-700 transition-colors"
      >
        <UserCircle2 className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2} />
      <span className="truncate text-[11px] text-slate-300 min-w-0">{name ?? 'User'}</span>
      <button
        onClick={signOutSafe}
        title="Sign out"
        className="ml-auto shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
      >
        <LogOut className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}
