/**
 * Owner resolution via Microsoft Graph.
 *
 * An agent record carries an Entra object ID; an administrator needs a name.
 * Resolution is best-effort: an ID that cannot be resolved stays unresolved and
 * the agent is reported as an orphan candidate, which is a real finding.
 *
 * An agent OWNER is the only personal data this server emits. Owners are
 * accountable parties for the agents they created; end users of a conversation
 * are never identified anywhere in this codebase.
 */

import { getToken, clearAudienceCache, GRAPH_SCOPE } from '../lib/tokens.js';

export interface Owner {
  name: string;
  email: string;
  /** Present only when Graph returned it. false = the account is disabled. */
  accountEnabled?: boolean;
}

interface GraphUser {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
}

const FETCH_TIMEOUT_MS = 20_000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 60_000)));
}

/** POST to Graph with a timeout; honour Retry-After once on 429. */
async function graphPost(url: string, token: string, body: unknown): Promise<Response> {
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
    await sleep(Number(res.headers.get('Retry-After') ?? '5') * 1000);
    res = await doFetch();
  }

  // Drop the cached token so the next call re-acquires it.
  if (res.status === 401) clearAudienceCache(GRAPH_SCOPE);

  return res;
}

/**
 * Resolve Entra object IDs to names.
 * Unresolvable IDs are simply absent from the map - never guessed.
 */
export async function resolveOwners(ids: string[]): Promise<Map<string, Owner>> {
  const result = new Map<string, Owner>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return result;

  const token = await getToken(GRAPH_SCOPE);
  if (!token) return result;

  for (const idChunk of chunk(unique, 200)) {
    try {
      const res = await graphPost(
        // $select on getByIds is supported and verified live; accountEnabled is
        // not in the default property set, so it must be asked for explicitly.
        'https://graph.microsoft.com/v1.0/directoryObjects/getByIds?$select=id,displayName,mail,userPrincipalName,accountEnabled',
        token,
        { ids: idChunk, types: ['user'] },
      );
      if (!res.ok) continue;

      const body = (await res.json()) as { value: GraphUser[] };
      for (const user of body.value) {
        const email = user.mail ?? user.userPrincipalName ?? '';
        if (user.id && email) {
          result.set(user.id, {
            name: user.displayName ?? email,
            email,
            ...(typeof user.accountEnabled === 'boolean'
              ? { accountEnabled: user.accountEnabled }
              : {}),
          });
        }
      }
    } catch {
      // A failed chunk leaves those owners unresolved, which reads as
      // "owner unknown" - the honest answer.
    }
  }

  return result;
}

/** True when Graph is reachable with the configured credentials. */
export async function graphReachable(): Promise<boolean> {
  return (await getToken(GRAPH_SCOPE)) !== null;
}
