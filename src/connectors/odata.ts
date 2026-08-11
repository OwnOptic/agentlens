/**
 * Pagination helpers.
 *
 * fetchODataAll - follows @odata.nextLink (Dataverse, BAP, Graph list endpoints)
 * fetchArgAll   - follows $skipToken (Azure Resource Graph)
 *
 * Both apply a per-page timeout, cap total rows, and report `truncated` when a
 * cap was hit. A failure throws; it is never silently reported as "0 results",
 * because zero and unknown are different findings.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ROWS = 5_000;

export interface PagedResult<T> {
  rows: T[];
  truncated: boolean;
}

export interface ODataOptions {
  timeoutMs?: number;
  maxRows?: number;
  headers?: Record<string, string>;
}

export async function fetchODataAll<T>(
  url: string,
  token: string,
  opts?: ODataOptions,
): Promise<PagedResult<T>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;

  const rows: T[] = [];
  let nextUrl: string | null = url;
  let truncated = false;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    ...(opts?.headers ?? {}),
  };

  while (nextUrl !== null) {
    const res: Response = await fetch(nextUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`OData fetch failed [${res.status}]: ${nextUrl}`);

    const body = (await res.json()) as { value?: unknown[]; '@odata.nextLink'?: string };
    rows.push(...((body.value ?? []) as T[]));

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }

    nextUrl = body['@odata.nextLink'] ?? null;
  }

  return { rows, truncated };
}

const ARG_ENDPOINT =
  'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

export interface ArgOptions {
  timeoutMs?: number;
  maxRows?: number;
}

/** Run a KQL query against Azure Resource Graph, following $skipToken pages. */
export async function fetchArgAll(
  token: string,
  query: string,
  opts?: ArgOptions,
): Promise<PagedResult<Record<string, unknown>>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;

  const rows: Record<string, unknown>[] = [];
  let skipToken: string | undefined;
  let truncated = false;

  do {
    const body: Record<string, unknown> = {
      query,
      options: skipToken
        ? { resultFormat: 'objectArray', $skipToken: skipToken }
        : { resultFormat: 'objectArray' },
    };

    const res = await fetch(ARG_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`ARG query failed [${res.status}]`);

    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      $skipToken?: string;
    };

    rows.push(...(json.data ?? []));
    skipToken = json.$skipToken;

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
  } while (skipToken);

  return { rows, truncated };
}
