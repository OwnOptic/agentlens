/**
 * OData pagination + timeout helper
 *
 * fetchODataAll  - follows @odata.nextLink for standard OData (Dataverse / BAP)
 * fetchArgAll    - follows $skipToken for Azure Resource Graph
 *
 * Both apply AbortSignal.timeout per page, cap at maxRows, and return
 * truncated=true when a cap or a remaining continuation was hit.
 * A failure is never silently swallowed as "0 results".
 *
 * @server
 */

// ---------------------------------------------------------------------------
// Shared defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ROWS   = 5_000;

// ---------------------------------------------------------------------------
// OData (Dataverse / BAP / Graph list endpoints)
// ---------------------------------------------------------------------------

export interface ODataOptions {
  timeoutMs?: number;
  maxRows?: number;
  headers?: Record<string, string>;
}

export interface PagedResult<T> {
  rows: T[];
  truncated: boolean;
}

/**
 * Follow @odata.nextLink pages until exhausted, timed out, or capped.
 *
 * @param url       The initial OData list URL (already includes $select / $filter / $top)
 * @param token     Bearer token (injected by caller so every connector keeps its own auth flow)
 * @param opts.timeoutMs  Per-page AbortSignal timeout (default 20 s)
 * @param opts.maxRows    Total row cap across all pages (default 5 000)
 * @param opts.headers    Extra request headers merged with Authorization + OData negotiation
 */
export async function fetchODataAll<T>(
  url: string,
  token: string,
  opts?: ODataOptions,
): Promise<PagedResult<T>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRows   = opts?.maxRows   ?? DEFAULT_MAX_ROWS;
  const extra     = opts?.headers   ?? {};

  const rows: T[] = [];
  let nextUrl: string | null = url;
  let truncated = false;

  const baseHeaders: Record<string, string> = {
    Authorization:    `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
    Accept:             'application/json',
    ...extra,
  };

  while (nextUrl !== null) {
    const res = await fetch(nextUrl, {
      headers: baseHeaders,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`OData fetch failed [${res.status}]: ${nextUrl}`);
    }

    const body = (await res.json()) as {
      value?: unknown[];
      '@odata.nextLink'?: string;
    };

    const page = (body.value ?? []) as T[];
    rows.push(...page);

    const remaining = maxRows - rows.length;
    if (remaining <= 0) {
      // We hit the cap - flag truncated regardless of whether a nextLink exists
      truncated = true;
      break;
    }

    nextUrl = body['@odata.nextLink'] ?? null;
    if (nextUrl !== null && remaining < page.length) {
      // Partial page already pushed us over; we flagged truncated above in next iteration
      // but set it here too for clarity
      truncated = true;
      break;
    }
  }

  // If there was a nextLink still pending when we stopped, mark truncated
  if (!truncated && rows.length >= maxRows) {
    truncated = true;
  }

  return { rows, truncated };
}

// ---------------------------------------------------------------------------
// Azure Resource Graph ($skipToken pagination)
// ---------------------------------------------------------------------------

const ARG_ENDPOINT =
  'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

export interface ArgOptions {
  timeoutMs?: number;
  maxRows?: number;
}

/**
 * Execute an ARG query and follow $skipToken pages.
 *
 * @param token   ARM Bearer token
 * @param query   KQL query string
 * @param opts    Per-page timeout + row cap (same defaults as fetchODataAll)
 */
export async function fetchArgAll(
  token: string,
  query: string,
  opts?: ArgOptions,
): Promise<PagedResult<Record<string, unknown>>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRows   = opts?.maxRows   ?? DEFAULT_MAX_ROWS;

  const rows: Record<string, unknown>[] = [];
  let skipToken: string | undefined;
  let truncated = false;

  do {
    const body: Record<string, unknown> = {
      query,
      options: { resultFormat: 'objectArray' },
    };
    if (skipToken) {
      body['options'] = { resultFormat: 'objectArray', $skipToken: skipToken };
    }

    const res = await fetch(ARG_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`ARG query failed [${res.status}]`);
    }

    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      $skipToken?: string;
    };

    const page = json.data ?? [];
    rows.push(...page);

    skipToken = json.$skipToken;

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
  } while (skipToken);

  return { rows, truncated };
}
