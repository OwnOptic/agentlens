/**
 * AgentLens API - /api/report
 *
 * GET  /api/report?format=markdown|html|json
 *   Returns the weekly governance report in the requested format.
 *   Falls back to mock seed data so the endpoint works fully offline.
 *
 * POST /api/report
 *   Body: { format?: 'markdown' | 'html' | 'json' }
 *   Same as GET but allows future extension (e.g. custom date range).
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildWeeklyReportFromMock } from '@/lib/reporting/weekly';
import { computeExecPostureFromMock } from '@/lib/reporting/exec';

type ReportFormat = 'markdown' | 'html' | 'json';

function resolveFormat(raw: string | null): ReportFormat {
  if (raw === 'markdown' || raw === 'html' || raw === 'json') return raw;
  return 'json';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const format = resolveFormat(searchParams.get('format'));
  return serveReport(format);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let format: ReportFormat = 'json';
  try {
    const body = (await request.json()) as { format?: string };
    format = resolveFormat(body.format ?? null);
  } catch {
    // no body or invalid JSON - use default
  }
  return serveReport(format);
}

function serveReport(format: ReportFormat): NextResponse {
  try {
    if (format === 'json') {
      // Return the full structured report + exec posture as JSON
      const report = buildWeeklyReportFromMock();
      const posture = computeExecPostureFromMock();

      return NextResponse.json(
        {
          report: {
            period: report.period,
            generatedAt: report.generatedAt,
            subject: report.subject,
            sections: report.sections,
          },
          posture: {
            kpiCards: posture.kpiCards,
            lifecycleDist: posture.lifecycleDist,
            capacityRows: posture.capacityRows,
            maturityScore: posture.maturityScore,
            costTrend: posture.costTrend,
            sessionTrend: posture.sessionTrend,
            deflectionTrend: posture.deflectionTrend,
            errorRateTrend: posture.errorRateTrend,
            generatedAt: posture.generatedAt,
          },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (format === 'markdown') {
      const report = buildWeeklyReportFromMock();
      return new NextResponse(report.markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="agentlens-weekly-${report.period.replace(/\s/g, '-')}.md"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // html
    const report = buildWeeklyReportFromMock();
    return new NextResponse(report.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Report generation failed', detail: message }, { status: 500 });
  }
}
