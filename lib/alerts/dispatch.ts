/**
 * AgentLens Alert Dispatch
 *
 * Routes raised alerts to the appropriate notification channels based on severity:
 *   critical  -> Teams Adaptive Card webhook + Graph sendMail
 *   high      -> Teams Adaptive Card webhook only
 *   medium/low -> In-app only (no external dispatch)
 *
 * NOTE: AlertSeverity in the shared contract uses 'info' | 'warning' | 'critical'.
 * This module maps severity to dispatch tier:
 *   critical  -> both Teams + Mail
 *   warning   -> Teams only
 *   info      -> in-app only
 *
 * Where live credentials are absent the functions log gracefully and return
 * without throwing so the app remains functional in offline/mock mode.
 */

import 'server-only';
import type { Alert, AlertSeverity } from '@/lib/types';
import { safeError } from '@/lib/auth/guard';

// ---------------------------------------------------------------------------
// Configuration (read from env; graceful no-op when absent)
// ---------------------------------------------------------------------------

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL ?? '';
const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID ?? '';
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID ?? '';
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET ?? '';
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? '';
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL ?? '';

// ---------------------------------------------------------------------------
// Teams Adaptive Card builder
// ---------------------------------------------------------------------------

interface AdaptiveCardAction {
  type: string;
  title: string;
  url: string;
}

interface AdaptiveCardBody {
  type: string;
  text?: string;
  weight?: string;
  color?: string;
  size?: string;
  wrap?: boolean;
  spacing?: string;
}

interface AdaptiveCard {
  type: string;
  version: string;
  body: AdaptiveCardBody[];
  actions?: AdaptiveCardAction[];
}

interface TeamsPayload {
  type: string;
  attachments: Array<{
    contentType: string;
    content: AdaptiveCard;
  }>;
}

function severityColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return 'Attention';
    case 'warning':  return 'Warning';
    case 'info':     return 'Good';
  }
}

function buildAdaptiveCard(alert: Alert): TeamsPayload {
  const color = severityColor(alert.severity);
  const title = `[${alert.severity.toUpperCase()}] AgentLens Alert: ${alert.type.replace(/_/g, ' ')}`;
  const timestamp = new Date(alert.createdAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const card: AdaptiveCard = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: title,
        weight: 'Bolder',
        color,
        size: 'Medium',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: alert.message,
        wrap: true,
        spacing: 'Small',
      },
      {
        type: 'TextBlock',
        text: [
          `Environment: \`${alert.envId}\``,
          alert.botId ? `Agent: \`${alert.botId}\`` : null,
          `Raised: ${timestamp}`,
          `State: **${alert.state}**`,
        ].filter(Boolean).join('  \n'),
        wrap: true,
        spacing: 'Small',
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'View in AgentLens',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/alerts`,
      },
    ],
  };

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Teams webhook dispatch
// ---------------------------------------------------------------------------

/**
 * Post an Adaptive Card to the configured Teams incoming webhook.
 * No-ops silently when TEAMS_WEBHOOK_URL is not set.
 */
export async function sendTeamsAlert(alert: Alert): Promise<void> {
  if (!TEAMS_WEBHOOK_URL) {
    console.warn('[dispatch] TEAMS_WEBHOOK_URL not set; skipping Teams alert for', alert.id);
    return;
  }

  const payload = buildAdaptiveCard(alert);

  try {
    const res = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[dispatch] Teams webhook error ${res.status}: ${safeError(text)}`);
    } else {
      console.info('[dispatch] Teams alert sent:', alert.id, alert.type);
    }
  } catch (err) {
    console.error('[dispatch] Teams webhook fetch failed:', safeError(err));
  }
}

// ---------------------------------------------------------------------------
// Graph sendMail dispatch
// ---------------------------------------------------------------------------

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GraphMailMessage {
  subject: string;
  body: { contentType: string; content: string };
  toRecipients: Array<{ emailAddress: { address: string } }>;
}

/** Acquire a client-credentials token from Entra ID for Graph. */
async function acquireGraphToken(): Promise<string | null> {
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    console.warn('[dispatch] Graph credentials not set; skipping mail alert');
    return null;
  }

  const tokenUrl = `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  });

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[dispatch] Graph token error ${res.status}: ${safeError(text)}`);
      return null;
    }

    const data = await res.json() as GraphTokenResponse;
    return data.access_token;
  } catch (err) {
    console.error('[dispatch] Graph token fetch failed:', safeError(err));
    return null;
  }
}

function buildMailBody(alert: Alert): string {
  const timestamp = new Date(alert.createdAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `
<html><body>
<h2 style="color:#c0392b">[${alert.severity.toUpperCase()}] AgentLens Governance Alert</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Type</td><td>${alert.type.replace(/_/g, ' ')}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Severity</td><td style="color:#c0392b;font-weight:bold">${alert.severity.toUpperCase()}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Message</td><td>${alert.message}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Environment</td><td><code>${alert.envId}</code></td></tr>
  ${alert.botId ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Agent</td><td><code>${alert.botId}</code></td></tr>` : ''}
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">State</td><td>${alert.state}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#555">Raised</td><td>${timestamp}</td></tr>
</table>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/alerts">View in AgentLens</a></p>
</body></html>
  `.trim();
}

/**
 * Send an alert notification via Microsoft Graph sendMail.
 * No-ops silently when Graph credentials or mail addresses are not set.
 */
export async function sendMailAlert(alert: Alert): Promise<void> {
  if (!ALERT_FROM_EMAIL || !ALERT_TO_EMAIL) {
    console.warn('[dispatch] ALERT_FROM_EMAIL / ALERT_TO_EMAIL not set; skipping mail alert for', alert.id);
    return;
  }

  const token = await acquireGraphToken();
  if (!token) return;

  const mailUrl = `https://graph.microsoft.com/v1.0/users/${ALERT_FROM_EMAIL}/sendMail`;

  const message: GraphMailMessage = {
    subject: `[AgentLens ${alert.severity.toUpperCase()}] ${alert.type.replace(/_/g, ' ')} - ${alert.envId}`,
    body: {
      contentType: 'HTML',
      content: buildMailBody(alert),
    },
    toRecipients: [{ emailAddress: { address: ALERT_TO_EMAIL } }],
  };

  try {
    const res = await fetch(mailUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: false }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[dispatch] Graph sendMail error ${res.status}: ${text}`);
    } else {
      console.info('[dispatch] Mail alert sent:', alert.id, alert.type);
    }
  } catch (err) {
    console.error('[dispatch] Graph sendMail fetch failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Severity routing - main entry point
// ---------------------------------------------------------------------------

/**
 * Route a single alert to the appropriate dispatch channels.
 *
 * Routing:
 *   critical -> Teams + Mail
 *   warning  -> Teams only
 *   info     -> in-app only (no external dispatch)
 *
 * All dispatches are fire-and-forget; errors are logged but never thrown.
 */
export async function dispatchAlert(alert: Alert): Promise<void> {
  switch (alert.severity) {
    case 'critical':
      await Promise.all([
        sendTeamsAlert(alert),
        sendMailAlert(alert),
      ]);
      break;

    case 'warning':
      await sendTeamsAlert(alert);
      break;

    case 'info':
      // In-app only; recorded to DB by the caller
      console.info('[dispatch] Info alert (in-app only):', alert.id, alert.type);
      break;

    default: {
      // Exhaustive check - TypeScript narrows to `never` here
      const _exhaustive: never = alert.severity;
      console.warn('[dispatch] Unknown severity:', _exhaustive);
    }
  }
}

/**
 * Dispatch multiple alerts concurrently.
 * Limits parallelism to 5 to avoid webhook throttling.
 */
export async function dispatchAlerts(alerts: Alert[]): Promise<void> {
  const CONCURRENCY = 5;
  for (let i = 0; i < alerts.length; i += CONCURRENCY) {
    const batch = alerts.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((a) => dispatchAlert(a)));
  }
}
