/**
 * Supabase Server Client
 *
 * Server-only Supabase client for database operations.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
 *
 * This client should ONLY be used in server-side contexts (API routes, server actions).
 * Do NOT use in client components.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Get server-side Supabase client
 *
 * Throws an error if SUPABASE_URL or SUPABASE_SERVICE_KEY are not set.
 *
 * @returns Supabase client instance for server-side operations
 */
export function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is not set');
  }

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_KEY environment variable is not set');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Singleton instance of the Supabase server client
 */
let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Get or create a singleton Supabase server client
 *
 * @returns Cached Supabase client instance
 */
export function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = getSupabaseServerClient();
  }
  return supabaseInstance;
}

/**
 * Reset the singleton client instance (for testing purposes)
 */
export function resetSupabaseClient(): void {
  supabaseInstance = null;
}

/**
 * Try to get a Supabase client without throwing.
 *
 * Returns null when SUPABASE_URL or SUPABASE_SERVICE_KEY are absent so that
 * callers can fall back to an in-memory store instead of crashing.
 * Use this in repository modules that need graceful degradation.
 */
export function tryGetSupabaseClient(): SupabaseClient<Database> | null {
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

/**
 * Type exports for type-safe database operations
 */
export type { Database } from './types';
