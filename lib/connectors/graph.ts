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
 * Falls back to an empty Map (no owner resolution) when credentials are absent.
 */

import type { GraphConnector } from '@/lib/connectors/interfaces';
import { getToken } from '@/lib/auth/tokenService';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

function hasCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
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

// Graph $batch request / response shapes
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
// Live implementation
// ---------------------------------------------------------------------------

/**
 * Chunk an array into sub-arrays of at most `size` items.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function liveResolveOwners(
  ids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return result;

  const token = await getToken(GRAPH_SCOPE);

  // Graph batch allows up to 20 requests per call; directoryObjects/getByIds
  // accepts up to 1000 IDs per request but we batch in chunks of 200 for safety.
  const idChunks = chunk(ids, 200);

  for (const idChunk of idChunks) {
    // POST https://graph.microsoft.com/v1.0/directoryObjects/getByIds
    const resp = await fetch(
      'https://graph.microsoft.com/v1.0/directoryObjects/getByIds',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ids: idChunk, types: ['user'] }),
      },
    );

    if (!resp.ok) {
      // Non-fatal: skip this chunk, leave IDs unresolved
      console.warn(
        `[graph] directoryObjects/getByIds failed: ${resp.status} ${resp.statusText}`,
      );
      continue;
    }

    const body = (await resp.json()) as DirectoryObjectsResponse;
    for (const user of body.value) {
      const email =
        user.mail ?? user.userPrincipalName ?? '';
      const name = user.displayName ?? email;
      if (user.id && email) {
        result.set(user.id, { name, email });
      }
    }
  }

  return result;
}

/**
 * Batch-resolve multiple owner IDs using the Graph $batch endpoint.
 * Each batch request targets /users/{id}?$select=id,displayName,mail
 * This is an alternative path used when IDs are individual user GUIDs
 * from Dataverse ownerid lookups.
 */
async function liveBatchResolveOwners(
  ids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return result;

  const token = await getToken(GRAPH_SCOPE);

  // Graph $batch max 20 requests per call
  const idChunks = chunk(ids, 20);

  for (const idChunk of idChunks) {
    const batchRequests: BatchRequestItem[] = idChunk.map((id, i) => ({
      id: String(i),
      method: 'GET',
      url: `/users/${id}?$select=id,displayName,mail,userPrincipalName`,
    }));

    // POST https://graph.microsoft.com/v1.0/$batch
    const resp = await fetch('https://graph.microsoft.com/v1.0/$batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ requests: batchRequests }),
    });

    if (!resp.ok) {
      console.warn(`[graph] $batch failed: ${resp.status} ${resp.statusText}`);
      continue;
    }

    const body = (await resp.json()) as BatchResponse;
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
      // Offline: return an empty map - owner fields remain null
      return new Map();
    }

    // Use directoryObjects/getByIds as primary path (most efficient for batches)
    // Fall back to $batch if the primary call surface returns nothing useful
    try {
      const primary = await liveResolveOwners(ids);
      if (primary.size > 0) return primary;
      // If no results from getByIds (e.g. guest accounts), try $batch /users/
      return liveBatchResolveOwners(ids);
    } catch {
      // Non-fatal: return empty map
      return new Map();
    }
  },
};
