/**
 * TOOL 5 of 5 - agent_map
 *
 * The estate as a hand-authored inline SVG. SVG rather than Mermaid because it
 * is self-contained: it renders identically in a browser, a document, or a
 * report with no diagram runtime, and chat surfaces that render neither get
 * the same facts from the structured fields alongside it. Layout, colours and
 * dash conventions are deterministic - the same estate always draws the same
 * picture.
 *
 * Adds no data source: it draws what sweep_inventory read.
 *
 * HONESTY: every node label carries a count that was read. A store that could
 * not be read is labelled "not connected" and drawn dashed in the unread
 * style. Zero and unknown must never look the same on a diagram someone will
 * screenshot.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { buildEstate, unreadStores, type Estate } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { buildSourceReports } from './sweep-inventory.js';

export const agentMapInput = {
  groupBy: z
    .enum(['store', 'environment'])
    .optional()
    .describe("How to group the middle layer of the map. Defaults to 'store'."),
};

export interface AgentMapData {
  /**
   * Mermaid source, for the chat surface: Microsoft 365 Copilot renders a
   * ```mermaid fence as a diagram inline. The agent presents THIS field in
   * chat, never an improvised text drawing.
   */
  mermaid: string;
  /** Self-contained SVG source, for documents and exports. Save as .svg; no runtime needed. */
  svg: string;
  legend: string;
  nodeCount: number;
  storesNotRead: string[];
}

/** Mermaid node labels cannot contain quotes or brackets. */
function mesc(text: string): string {
  return text.replace(/["[\]{}()]/g, '').replace(/\|/g, '-');
}

function buildMermaid(estate: Estate, groupBy: 'store' | 'environment'): string {
  const lines: string[] = ['flowchart TB'];
  const readStores = estate.discovery.sources.filter((s) => s.status === 'ok');
  const total = readStores.reduce((n, s) => n + s.count, 0);

  lines.push(`  tenant["Tenant<br/>${total} agents read"]`);

  if (groupBy === 'store') {
    estate.discovery.sources.forEach((source, i) => {
      const id = `s${i}`;
      if (source.status === 'ok') {
        lines.push(`  ${id}["${mesc(source.label)}<br/>${source.count}"]`);
        lines.push(`  tenant --> ${id}`);
        lines.push(`  class ${id} read;`);
      } else {
        // Deliberately not "0" - we did not read this store.
        lines.push(`  ${id}["${mesc(source.label)}<br/>not connected"]`);
        lines.push(`  tenant --> ${id}`);
        lines.push(`  class ${id} unread;`);
      }
    });
  } else {
    const byLocation = new Map<string, number>();
    for (const agent of estate.agents) {
      const key = agent.location ?? 'Location unknown';
      byLocation.set(key, (byLocation.get(key) ?? 0) + 1);
    }
    [...byLocation.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([location, count], i) => {
        lines.push(`  e${i}["${mesc(location)}<br/>${count}"]`);
        lines.push(`  tenant --> e${i}`);
        lines.push(`  class e${i} read;`);
      });
  }

  const clusters = findDuplicateClusters(estate.agents);
  if (estate.orphans.length > 0) {
    lines.push(`  orphans["No resolvable owner<br/>${estate.orphans.length}"]`);
    lines.push('  tenant --> orphans');
    lines.push('  class orphans risk;');
  }
  if (clusters.length > 0) {
    const duplicated = clusters.reduce((n, c) => n + c.agents.length, 0);
    lines.push(`  dupes["Duplicate clusters<br/>${clusters.length} covering ${duplicated}"]`);
    lines.push('  tenant --> dupes');
    lines.push('  class dupes risk;');
  }

  lines.push('  classDef read fill:#e8f4ea,stroke:#2f855a,color:#1a202c;');
  lines.push('  classDef unread fill:#f0f0f0,stroke:#a0aec0,color:#4a5568,stroke-dasharray: 4 3;');
  lines.push('  classDef risk fill:#fdf0e6,stroke:#f26f21,color:#1a202c;');

  return lines.join('\n');
}

/** XML-escape a label for use inside SVG text nodes and attributes. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface MapNode {
  label: string;
  value: string;
  kind: 'read' | 'unread' | 'risk';
}

// Node geometry. Deterministic: the same estate always draws the same picture.
const NODE_W = 200;
const NODE_H = 58;
const GAP_X = 22;
const GAP_Y = 46;
const MARGIN = 24;
const TENANT_W = 240;
const PER_ROW = 5;

const STYLE: Record<MapNode['kind'], { fill: string; stroke: string; dash: string; text: string }> = {
  read: { fill: '#e8f4ea', stroke: '#2f855a', dash: '', text: '#1a202c' },
  unread: { fill: '#f0f0f0', stroke: '#a0aec0', dash: ' stroke-dasharray="4 3"', text: '#4a5568' },
  risk: { fill: '#fdf0e6', stroke: '#f26f21', dash: '', text: '#1a202c' },
};

function drawNode(x: number, y: number, node: MapNode): string {
  const s = STYLE[node.kind];
  return (
    `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" ` +
    `fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5"${s.dash}/>` +
    `<text x="${x + NODE_W / 2}" y="${y + 24}" text-anchor="middle" font-size="13" ` +
    `font-weight="600" fill="${s.text}">${esc(node.label)}</text>` +
    `<text x="${x + NODE_W / 2}" y="${y + 44}" text-anchor="middle" font-size="12" ` +
    `fill="${s.text}">${esc(node.value)}</text>`
  );
}

function buildSvg(estate: Estate, groupBy: 'store' | 'environment'): { svg: string; nodeCount: number } {
  const readStores = estate.discovery.sources.filter((s) => s.status === 'ok');
  const total = readStores.reduce((n, s) => n + s.count, 0);

  const middle: MapNode[] = [];
  if (groupBy === 'store') {
    for (const source of estate.discovery.sources) {
      middle.push(
        source.status === 'ok'
          ? { label: source.label, value: `${source.count} agents`, kind: 'read' }
          : // Deliberately not "0" - we did not read this store.
            { label: source.label, value: 'not connected', kind: 'unread' },
      );
    }
  } else {
    const byLocation = new Map<string, number>();
    for (const agent of estate.agents) {
      const key = agent.location ?? 'Location unknown';
      byLocation.set(key, (byLocation.get(key) ?? 0) + 1);
    }
    for (const [location, count] of [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      middle.push({ label: location, value: `${count} agents`, kind: 'read' });
    }
  }

  // Risk layer - only findings that were actually computed.
  const clusters = findDuplicateClusters(estate.agents);
  const risks: MapNode[] = [];
  if (estate.orphans.length > 0) {
    risks.push({ label: 'No resolvable owner', value: `${estate.orphans.length} agents`, kind: 'risk' });
  }
  if (clusters.length > 0) {
    const duplicated = clusters.reduce((n, c) => n + c.agents.length, 0);
    risks.push({
      label: 'Duplicate clusters',
      value: `${clusters.length} covering ${duplicated}`,
      kind: 'risk',
    });
  }

  const cols = Math.min(PER_ROW, Math.max(middle.length, risks.length, 1));
  const width = Math.max(cols * NODE_W + (cols - 1) * GAP_X + MARGIN * 2, TENANT_W + MARGIN * 2);
  const rowsOf = (nodes: MapNode[]) => Math.ceil(nodes.length / PER_ROW);
  const middleRows = rowsOf(middle);
  const riskRows = rowsOf(risks);
  const height =
    MARGIN + NODE_H + (middleRows > 0 ? middleRows * (NODE_H + GAP_Y) : 0) +
    (riskRows > 0 ? riskRows * (NODE_H + GAP_Y) : 0) + MARGIN;

  const parts: string[] = [];
  const tenantX = (width - TENANT_W) / 2;
  const tenantY = MARGIN;
  parts.push(
    `<rect x="${tenantX}" y="${tenantY}" width="${TENANT_W}" height="${NODE_H}" rx="8" ` +
      `fill="#1a202c" stroke="#1a202c"/>` +
      `<text x="${width / 2}" y="${tenantY + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">Tenant</text>` +
      `<text x="${width / 2}" y="${tenantY + 44}" text-anchor="middle" font-size="12" fill="#e2e8f0">${total} agents read</text>`,
  );
  let nodeCount = 1;

  const layoutRow = (nodes: MapNode[], startY: number): void => {
    nodes.forEach((node, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, nodes.length - row * PER_ROW);
      const rowWidth = inRow * NODE_W + (inRow - 1) * GAP_X;
      const x = (width - rowWidth) / 2 + (i % PER_ROW) * (NODE_W + GAP_X);
      const y = startY + row * (NODE_H + GAP_Y);
      parts.push(
        `<line x1="${width / 2}" y1="${tenantY + NODE_H}" x2="${x + NODE_W / 2}" y2="${y}" ` +
          `stroke="#a0aec0" stroke-width="1.2"/>`,
      );
      parts.push(drawNode(x, y, node));
      nodeCount++;
    });
  };

  const middleY = tenantY + NODE_H + GAP_Y;
  layoutRow(middle, middleY);
  layoutRow(risks, middleY + middleRows * (NODE_H + GAP_Y));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `font-family="Segoe UI, Arial, sans-serif" role="img" aria-label="Agent estate map">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    parts.join('') +
    `</svg>`;

  return { svg, nodeCount };
}

export async function agentMap(args: {
  groupBy?: 'store' | 'environment';
}): Promise<ToolResult<AgentMapData>> {
  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so there is nothing to map. An empty diagram would imply an empty tenant, which is not what was found.',
      [{ source: 'Azure Resource Graph', status: 'not_connected' }],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server.',
    );
  }

  let estate: Estate;
  try {
    estate = await buildEstate();
  } catch (e) {
    return failed('The agent map could not be produced.', e);
  }

  const sources = buildSourceReports(estate);
  const notRead = unreadStores(estate);

  if (notRead.length === estate.discovery.sources.length) {
    return notConnected(
      'No agent store could be read, so no map can be drawn.',
      sources,
      `Grant the reader service principal access to at least one store. Not read: ${notRead.join('; ')}`,
    );
  }

  const { svg, nodeCount } = buildSvg(estate, args.groupBy ?? 'store');

  const data: AgentMapData = {
    mermaid: buildMermaid(estate, args.groupBy ?? 'store'),
    svg,
    legend:
      'Green nodes were read from the tenant and the number is the agent count. ' +
      'Grey dashed nodes could not be read - they are not zero, they are unknown. ' +
      'Orange nodes are findings worth acting on.',
    nodeCount,
    storesNotRead: notRead,
  };

  const summary =
    `Mapped ${estate.agents.length} agents across ${estate.discovery.sources.length - notRead.length} of ` +
    `${estate.discovery.sources.length} stores.` +
    (notRead.length > 0 ? ' Stores that could not be read are shown as "not connected", not as zero.' : '');

  return notRead.length > 0
    ? partial(summary, data, sources, `Not read: ${notRead.join('; ')}`)
    : ok(summary, data, sources);
}

export const agentMapTool = {
  name: 'agent_map',
  config: {
    title: 'Map my agents',
    description:
      'Render the agent estate as a diagram: the four stores with their counts, and the findings worth acting on such as orphaned agents and duplicate clusters. Stores that could not be read are labelled "not connected" rather than shown as zero. PRESENTATION: put the mermaid field inside a ```mermaid code fence so the chat renders it as a diagram - never redraw the map as ASCII art or plain text. Offer the svg field as a file for documents and exports. Read-only.',
    inputSchema: agentMapInput,
  },
  handler: async (args: { groupBy?: 'store' | 'environment' }) => toMcpContent(await agentMap(args)),
};
