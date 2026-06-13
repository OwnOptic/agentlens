/**
 * graph connector
 *
 * Resolves Entra ID object IDs to display names and email addresses via
 * Microsoft Graph batch API:
 *   https://graph.microsoft.com/v1.0/$batch
 *
 * Individual user lookup uses the directoryObjects/getByIds endpoint:
 *   POST https://graph.microsoft.com/v1.0/directoryObjects/getByIds
 *   Body: { ids: string[], types: ["user"] }
 *
 * T-205: AbortSignal.timeout on every fetch; 429 read Retry-After + retry once.
 *
 * Falls back to an empty Map (no owner resolution) when credentials are absent.
 */

import type { GraphConnector } from '@/lib/connectors/interfaces';
import { getToken, clearAudienceCache } from '@/lib/auth/tokenService';
import { hasCoreCredentials } from '@/lib/connectors/config';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const FETCH_TIMEOUT_MS = 20_000;

function hasCredentials(): boolean {
  return hasCoreCredentials();
}

// ---------------------------------------------------------------------------
// Graph API response shapes
// ---------------------------------------------------------------------------
interface GraphUser {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
}

interface DirectoryObjectsResponse {
  value: GraphUser[];
}

interface BatchRequestItem {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface BatchResponseItem {
  id: string;
  status: number;
  body?: unknown;
}

interface BatchResponse {
  responses: BatchResponseItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep for `ms` milliseconds, capped at 60 s to avoid hanging forever.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 60_000)));
}

/**
 * POST to a Graph endpoint with a timeout.
 * On 429: reads Retry-After header and retries once.
 * On 401: clears the audience cache (caller can re-acquire on next invocation).
 */
async function graphPost(
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  const doFetch = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  let res = await doFetch();

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') ?? '5');
    await sleep(retryAfterSec * 1000);
    res = await doFetch();
  }

  if (res.status === 401) {
    // Clear the cached token so the next call re-acquires
    clearAudienceCache(GRAPH_SCOPE);
  }

  return res;
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

async function liveResolveOwners(
  ids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return result;

  const token = await getToken(GRAPH_SCOPE);
  if (!token) return result;

  const idChunks = chunk(ids, 200);

  for (const idChunk of idChunks) {
    const res = await graphPost(
      'https://graph.microsoft.com/v1.0/directoryObjects/getByIds',
      token,
      { ids: idChunk, types: ['user'] },
    );

    if (!res.ok) {
      console.warn(`[graph] directoryObjects/getByIds failed: ${res.status} ${res.statusText}`);
      continue;
    }

    const body = (await res.json()) as DirectoryObjectsResponse;
    for (const user of body.value) {
      const email = user.mail ?? user.userPrincipalName ?? '';
      const name = user.displayName ?? email;
      if (user.id && email) {
        result.set(user.id, { name, email });
      }
    }
  }

  return result;
}

async function liveBatchResolveOwners(
  ids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return result;

  const token = await getToken(GRAPH_SCOPE);
  if (!token) return result;

  const idChunks = chunk(ids, 20);

  for (const idChunk of idChunks) {
    const batchRequests: BatchRequestItem[] = idChunk.map((id, i) => ({
      id: String(i),
      method: 'GET',
      url: `/users/${id}?$select=id,displayName,mail,userPrincipalName`,
    }));

    const res = await graphPost(
      'https://graph.microsoft.com/v1.0/$batch',
      token,
      { requests: batchRequests },
    );

    if (!res.ok) {
      console.warn(`[graph] $batch failed: ${res.status} ${res.statusText}`);
      continue;
    }

    const body = (await res.json()) as BatchResponse;
    for (const response of body.responses) {
      if (response.status === 200 && response.body) {
        const user = response.body as GraphUser;
        const originalId = idChunk[Number(response.id)];
        const email = user.mail ?? user.userPrincipalName ?? '';
        const name = user.displayName ?? email;
        if (originalId && email) {
          result.set(originalId, { name, email });
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const graph: GraphConnector = {
  async resolveOwners(
    ids: string[],
  ): Promise<Map<string, { name: string; email: string }>> {
    if (!hasCredentials()) {
      return new Map();
    }

    try {
      const primary = await liveResolveOwners(ids);
      if (primary.size > 0) return primary;
      return liveBatchResolveOwners(ids);
    } catch {
      return new Map();
    }
  },
};
