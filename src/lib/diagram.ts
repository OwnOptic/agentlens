/**
 * Small deterministic SVG builders for tool results.
 *
 * Same honesty conventions as agent_map: a value that was read renders solid
 * with its number; anything unread or unmeasured is labelled as such, never
 * drawn as zero. Deterministic: the same data always draws the same picture.
 * The svg field is for documents and exports; chat surfaces may not render it
 * inline, and the structured fields alongside it always carry the same facts.
 */

const FONT = 'Segoe UI, Arial, sans-serif';
const INK = '#1a202c';
const MUTED = '#4a5568';
const GOOD = { fill: '#e8f4ea', stroke: '#2f855a' };
const RISK = { fill: '#fdf0e6', stroke: '#f26f21' };
const NEUTRAL = { fill: '#f0f0f0', stroke: '#a0aec0' };

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgDoc(width: number, height: number, label: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `font-family="${FONT}" role="img" aria-label="${esc(label)}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    body +
    `</svg>`
  );
}

function card(
  x: number,
  y: number,
  w: number,
  h: number,
  style: { fill: string; stroke: string },
  dashed: boolean,
  lines: { text: string; bold?: boolean; size?: number }[],
): string {
  let out =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${style.fill}" ` +
    `stroke="${style.stroke}" stroke-width="1.5"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
  let ty = y + 22;
  for (const line of lines) {
    out +=
      `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${line.size ?? 12}" ` +
      `${line.bold ? 'font-weight="600" ' : ''}fill="${line.bold ? INK : MUTED}">${esc(line.text)}</text>`;
    ty += 18;
  }
  return out;
}

/** DLP coverage: one card per environment, uncovered environments loud. */
export function buildDlpCoverageSvg(
  environments: {
    environmentName: string;
    environmentType: string;
    isDefault: boolean;
    verdict: 'covered' | 'uncovered';
    coveringPolicies: string[];
  }[],
): string {
  const W = 210;
  const H = 78;
  const GAP = 16;
  const PER_ROW = 4;
  const cols = Math.min(PER_ROW, Math.max(environments.length, 1));
  const rows = Math.ceil(environments.length / PER_ROW);
  const width = cols * W + (cols - 1) * GAP + 48;
  const height = 56 + rows * (H + GAP) + 8;

  let body =
    `<text x="24" y="34" font-size="14" font-weight="700" fill="${INK}">DLP coverage by environment</text>`;
  environments.forEach((env, i) => {
    const x = 24 + (i % PER_ROW) * (W + GAP);
    const y = 52 + Math.floor(i / PER_ROW) * (H + GAP);
    const covered = env.verdict === 'covered';
    body += card(x, y, W, H, covered ? GOOD : RISK, false, [
      { text: env.environmentName + (env.isDefault ? ' (default)' : ''), bold: true, size: 13 },
      { text: env.environmentType, size: 11 },
      {
        text: covered
          ? `covered by ${env.coveringPolicies.length} polic${env.coveringPolicies.length === 1 ? 'y' : 'ies'}`
          : 'NO POLICY COVERS THIS',
        size: 11,
      },
    ]);
  });
  return svgDoc(width, height, 'DLP coverage by environment', body);
}

/**
 * Verdict quadrant: the four dispositions as a 2x2 (adoption x uniqueness),
 * with counts that were actually computed. Unclassified agents are stated,
 * never distributed.
 */
export function buildVerdictQuadrantSvg(verdictCounts: Record<string, number>): string {
  const n = (k: string) => verdictCounts[k] ?? 0;
  const unclassified = Object.entries(verdictCounts)
    .filter(([k]) => !['promote', 'improve', 'consolidate', 'retire'].includes(k))
    .reduce((sum, [, v]) => sum + v, 0);

  const W = 250;
  const H = 96;
  const GAP = 14;
  const width = 2 * W + GAP + 140;
  const height = 96 + 2 * H + GAP;

  const q = (x: number, y: number, title: string, count: number, sub: string, risky: boolean) =>
    card(x, y, W, H, count > 0 ? (risky ? RISK : GOOD) : NEUTRAL, count === 0, [
      { text: title, bold: true, size: 13 },
      { text: `${count} agent${count === 1 ? '' : 's'}`, bold: true, size: 15 },
      { text: sub, size: 10.5 },
    ]);

  let body =
    `<text x="24" y="30" font-size="14" font-weight="700" fill="${INK}">Verdicts: adoption x uniqueness</text>` +
    `<text x="${120 + W / 2}" y="56" text-anchor="middle" font-size="11" fill="${MUTED}">unique</text>` +
    `<text x="${120 + W + GAP + W / 2}" y="56" text-anchor="middle" font-size="11" fill="${MUTED}">duplicates another agent</text>` +
    `<text x="104" y="${66 + H / 2}" text-anchor="end" font-size="11" fill="${MUTED}">used</text>` +
    `<text x="104" y="${66 + H + GAP + H / 2}" text-anchor="end" font-size="11" fill="${MUTED}">unused</text>`;

  body += q(120, 64, 'PROMOTE', n('promote'), 'real adoption, keep investing', false);
  body += q(120 + W + GAP, 64, 'CONSOLIDATE', n('consolidate'), 'adoption exists, merge the copies', true);
  body += q(120, 64 + H + GAP, 'IMPROVE', n('improve'), 'unique but unadopted, fix or sunset', true);
  body += q(120 + W + GAP, 64 + H + GAP, 'RETIRE', n('retire'), 'no use, no uniqueness', true);

  if (unclassified > 0) {
    body += `<text x="24" y="${height - 12}" font-size="11" fill="${MUTED}">${unclassified} agent(s) unclassified - usage could not be read; unmeasured, not judged.</text>`;
  }
  return svgDoc(width, height, 'Agent verdicts quadrant', body);
}

/** Consolidation before/after: agents today vs after merging the clusters. */
export function buildConsolidationSvg(totalAgents: number, agentsRemovable: number): string {
  const after = totalAgents - agentsRemovable;
  const width = 560;
  const height = 176;
  const BARX = 170;
  const maxW = 340;
  const scale = totalAgents > 0 ? maxW / totalAgents : 0;

  const bar = (y: number, label: string, value: number, style: { fill: string; stroke: string }) =>
    `<text x="${BARX - 14}" y="${y + 19}" text-anchor="end" font-size="12" fill="${MUTED}">${esc(label)}</text>` +
    `<rect x="${BARX}" y="${y}" width="${Math.max(value * scale, 2)}" height="28" rx="5" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"/>` +
    `<text x="${BARX + Math.max(value * scale, 2) + 10}" y="${y + 19}" font-size="13" font-weight="600" fill="${INK}">${value}</text>`;

  const body =
    `<text x="24" y="32" font-size="14" font-weight="700" fill="${INK}">Estate before and after consolidation</text>` +
    bar(56, 'today', totalAgents, NEUTRAL) +
    bar(100, 'after merging', after, GOOD) +
    `<text x="24" y="${height - 14}" font-size="11" fill="${MUTED}">${agentsRemovable} duplicate agent(s) would be retired into their cluster's canonical agent.</text>`;
  return svgDoc(width, height, 'Consolidation before and after', body);
}
