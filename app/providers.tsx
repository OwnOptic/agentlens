'use client';

/**
 * app/providers.tsx - Client-side provider tree
 *
 * Wraps the application in NextAuth's SessionProvider so any client
 * component can call useSession() / signIn() / signOut().
 *
 * Must be a Client Component ('use client') because SessionProvider
 * uses React context internally.
 *
 * Usage: imported by app/layout.tsx (root layout) to wrap {children}.
 */

import React from 'react';
import { SessionProvider } from 'next-auth/react';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
