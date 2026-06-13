'use client';

/**
 * app/signin/page.tsx - AgentLens sign-in page
 *
 * Branded dark card with a "Sign in with Microsoft" button.
 * Calls signIn('azure-ad') which redirects to the Entra consent/login flow
 * and then back via the /api/auth/callback/azure-ad route.
 *
 * The page is intentionally minimal and self-contained:
 *   - No SessionProvider wrapper needed here (it's in the root layout)
 *   - No layout chrome (nav / sidebar) - full-screen centered card
 */

import React from 'react';
import { signIn } from 'next-auth/react';
import { ScanEye } from 'lucide-react';

// ---------------------------------------------------------------------------
// Microsoft logo inline SVG (no external dependency)
// ---------------------------------------------------------------------------

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 21 21"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SignInPage() {
  const [loading, setLoading] = React.useState(false);

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn('azure-ad');
    } catch {
      // signIn redirects on success; any error lands back here
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      {/* Subtle radial glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">

          {/* Logo + wordmark */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <ScanEye className="h-6 w-6 text-emerald-400" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight text-slate-100">
                AgentLens
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Copilot agent governance &amp; observability
              </p>
            </div>
          </div>

          {/* Sign-in button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="
              flex w-full items-center justify-center gap-3
              rounded-lg border border-slate-700 bg-slate-800
              px-4 py-2.5 text-sm font-medium text-slate-200
              transition-colors
              hover:border-slate-600 hover:bg-slate-700
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
            ) : (
              <MicrosoftLogo className="h-5 w-5 shrink-0" />
            )}
            {loading ? 'Redirecting...' : 'Sign in with Microsoft'}
          </button>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Single-tenant deployment - your organization&apos;s Entra ID only
          </p>
        </div>

        {/* Below-card version note */}
        <p className="mt-4 text-center text-xs text-slate-600">
          AgentLens v0.1 &bull; Witivio Copilot Factory
        </p>
      </div>
    </main>
  );
}
