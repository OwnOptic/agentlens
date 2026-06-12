/**
 * POST /api/ask
 *
 * Accepts a natural-language question, translates it to read-only SQL
 * constrained to the allowlisted schema, executes it against the mock seed
 * (or Supabase in production), and returns a NlQueryResult.
 */

import { NextResponse } from 'next/server';
import { runNlQuery } from '@/lib/ai/nlQuery';
import type { NlQueryRequest, NlQueryResult } from '@/lib/ai/nlQuery';

export async function POST(request: Request): Promise<NextResponse> {
  let body: Partial<NlQueryRequest>;

  try {
    body = (await request.json()) as Partial<NlQueryRequest>;
  } catch {
    return NextResponse.json<NlQueryResult>(
      { sql: '', columns: [], rows: [], isMock: true, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';

  if (!question) {
    return NextResponse.json<NlQueryResult>(
      { sql: '', columns: [], rows: [], isMock: true, error: 'question is required' },
      { status: 400 }
    );
  }

  const maxRows = typeof body.maxRows === 'number' ? body.maxRows : 50;

  const result = await runNlQuery({ question, maxRows });

  const status = result.error ? 500 : 200;
  return NextResponse.json<NlQueryResult>(result, { status });
}
