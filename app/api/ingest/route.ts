import { NextRequest, NextResponse } from 'next/server';
import { runIngestion } from '@/lib/ingestion/orchestrator';

/**
 * POST /api/ingest
 *
 * Ingestion API endpoint. Guards access via CRON_SECRET header,
 * triggers the orchestrator, and returns the IngestionRun as JSON.
 *
 * Security:
 * - Requires CRON_SECRET header matching environment variable
 * - Should only be called by trusted cron/scheduler services
 *
 * Response:
 * - 200 OK with IngestionRun JSON on success
 * - 403 Forbidden if CRON_SECRET is invalid or missing
 * - 500 Internal Server Error if orchestration fails fatally
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // TODO: Extract CRON_SECRET from request headers
    const cronSecret = request.headers.get('CRON_SECRET');

    // TODO: Validate CRON_SECRET against environment variable
    const expectedSecret = process.env.CRON_SECRET;

    if (!cronSecret || cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid or missing CRON_SECRET' },
        { status: 403 }
      );
    }

    // TODO: Call runIngestion() to orchestrate the full ingestion pipeline
    const run = await runIngestion();

    // TODO: Return the IngestionRun as JSON with 200 status
    return NextResponse.json(run, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/ingest] Error:', message);

    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
