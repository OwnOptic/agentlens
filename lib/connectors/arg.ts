/**
 * Shared ARG query helper for connector-layer use.
 *
 * Re-exports fetchArgAll from odata.ts with a simplified signature for
 * connectors that just need a one-shot ARG query without custom options.
 *
 * Route-level ARG helpers (app/api/**) are not touched here.
 *
 * @server
 */

import { fetchArgAll } from '@/lib/connectors/odata';

export type { ArgOptions, PagedResult } from '@/lib/connectors/odata';

/**
 * Execute a single ARG KQL query and return all rows (paginated, capped at 5000).
 *
 * @param token  ARM Bearer token from tokenService.getArmToken()
 * @param query  KQL query string
 */
export async function argQuery(
  token: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const { rows } = await fetchArgAll(token, query);
  return rows;
}
