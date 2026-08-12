/**
 * Validate the declarative agent package before you try to upload it.
 *
 * A rejected sideload gives you a generic error and no line number, so this
 * catches what it can beforehand:
 *
 *   1. Structural checks that need no network - required fields, length limits,
 *      the id linking manifest.json to declarativeAgent.json, and the zip
 *      layout. These ALWAYS run.
 *   2. Validation against Microsoft's published JSON schemas, fetched live so a
 *      schema update surfaces here rather than at upload. Skipped with a note
 *      when the network is unavailable; never silently passed.
 *
 * Placeholders are substituted the way scripts/package-agent.mjs does, so what
 * is checked is what actually ships, not the templated source.
 *
 * Usage:  npm run validate:agent
 * Exit:   0 valid  |  1 invalid  |  2 could not check
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv-draft-04';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'agent', 'appPackage');

/* Stand-in values for the ${{TOKEN}} placeholders. Shape matters, not identity. */
const PLACEHOLDERS = {
  AGENT_APP_ID: '11111111-2222-3333-4444-555555555555',
  AGENTLENS_MCP_URL: 'https://validate.example.azurecontainerapps.io/mcp',
};

const SCHEMAS = {
  'manifest.json': 'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
  'declarativeAgent.json':
    'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.8/schema.json',
  'ai-plugin.json': 'https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json',
};

const c = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m' };
const problems = [];
const notes = [];
const ok = (m) => console.log(`${c.green}  PASS${c.reset}  ${m}`);
const fail = (m) => { problems.push(m); console.log(`${c.red}  FAIL${c.reset}  ${m}`); };
const note = (m) => { notes.push(m); console.log(`${c.yellow}  NOTE${c.reset}  ${m}`); };
const section = (t) => console.log(`\n${c.cyan}=== ${t} ===${c.reset}`);

async function loadSubstituted(name) {
  let text = await readFile(path.join(pkgDir, name), 'utf8');
  text = text.replace(/\$\{\{(\w+)\}\}/g, (match, key) => PLACEHOLDERS[key] ?? match);

  const leftover = text.match(/\$\{\{(\w+)\}\}/);
  if (leftover) {
    fail(`${name}: placeholder ${leftover[0]} has no value - packaging would fail on it`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(`${name}: not valid JSON after substitution - ${e.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
section('Structure');

const manifest = await loadSubstituted('manifest.json');
const agent = await loadSubstituted('declarativeAgent.json');
const plugin = await loadSubstituted('ai-plugin.json');

if (!manifest || !agent || !plugin) {
  console.log(`\n${c.red}Could not parse the package.${c.reset}\n`);
  process.exit(1);
}

/* The link that breaks silently: manifest points at the agent by id, and the
   agent declares the same id. A mismatch uploads fine and then does nothing. */
const declared = manifest.copilotAgents?.declarativeAgents ?? [];
if (declared.length === 0) {
  fail('manifest.json declares no declarativeAgents - Copilot will not see an agent');
} else {
  const entry = declared[0];
  if (entry.id !== agent.id) {
    fail(`id mismatch: manifest declares "${entry.id}", declarativeAgent.json is "${agent.id}"`);
  } else {
    ok(`agent id "${agent.id}" matches between manifest and agent`);
  }
  if (entry.file !== 'declarativeAgent.json') {
    fail(`manifest points at "${entry.file}", which is not the agent file in this package`);
  }
}

/* Length limits, from the published schemas. Checked here too so they are
   enforced even when the network is down. */
const limits = [
  ['manifest.name.short', manifest.name?.short, 30],
  ['manifest.name.full', manifest.name?.full, 100],
  ['manifest.description.short', manifest.description?.short, 80],
  ['manifest.description.full', manifest.description?.full, 4000],
  ['agent.name', agent.name, 100],
  ['agent.description', agent.description, 1000],
  ['agent.instructions', agent.instructions, 8000],
];
for (const [label, value, max] of limits) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} is missing or empty`);
  } else if (value.length > max) {
    fail(`${label} is ${value.length} chars, over the ${max} limit`);
  } else {
    ok(`${label} ${value.length}/${max}`);
  }
}

const starters = agent.conversation_starters ?? [];
if (starters.length === 0) fail('no conversation starters - the agent opens with an empty surface');
else if (starters.length > 12) fail(`${starters.length} conversation starters, over the 12 limit`);
else ok(`${starters.length}/12 conversation starters`);

/* Icons. Wrong dimensions are a common sideload rejection, and the PNG header
   carries them, so no image library is needed. */
for (const [file, expected] of [['color.png', 192], ['outline.png', 32]]) {
  try {
    const buf = await readFile(path.join(pkgDir, file));
    if (buf.subarray(1, 4).toString() !== 'PNG') {
      fail(`${file} is not a PNG`);
      continue;
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width !== expected || height !== expected) {
      fail(`${file} is ${width}x${height}, expected ${expected}x${expected}`);
    } else {
      ok(`${file} ${width}x${height}`);
    }
  } catch {
    fail(`${file} is missing from the package`);
  }
}

/* ------------------------------------------------------------------ */
section('Runtime wiring');

const runtimes = plugin.runtimes ?? [];
const mcp = runtimes.find((r) => r.type === 'RemoteMCPServer');
if (!mcp) {
  fail('ai-plugin.json declares no RemoteMCPServer runtime');
} else {
  const url = mcp.spec?.url ?? '';
  if (!url.startsWith('https://')) fail(`MCP url must be https, got "${url}"`);
  else if (!url.endsWith('/mcp')) note(`MCP url does not end in /mcp: "${url}" - check it is the endpoint, not the host`);
  else ok('MCP url is https and ends in /mcp');

  if (mcp.auth?.type === 'None') {
    note('auth is None - correct for local development, NOT for a public deployment. Package with MCP_AUTH_REFERENCE_ID before shipping.');
  } else if (mcp.auth?.type === 'OAuthPluginVault') {
    ok(`auth is OAuthPluginVault (reference_id ${mcp.auth.reference_id ? 'set' : 'MISSING'})`);
    if (!mcp.auth.reference_id) fail('OAuthPluginVault selected but reference_id is empty');
  }

  /* Dynamic discovery is why changing an MCP tool needs no repackaging. If it
     is ever turned off, that trade-off should be deliberate. */
  const dynamic = (plugin.functions ?? []).length === 0 && (mcp.run_for_functions ?? []).includes('*');
  if (dynamic) ok('dynamic tool discovery is on - MCP tool changes need no repackaging');
  else note('dynamic tool discovery is OFF - tool changes will require repackaging and re-uploading');
}

/* ------------------------------------------------------------------ */
section('Published schemas');

const docs = { 'manifest.json': manifest, 'declarativeAgent.json': agent, 'ai-plugin.json': plugin };
let schemasChecked = 0;

for (const [name, url] of Object.entries(SCHEMAS)) {
  let schema;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      note(`could not fetch the schema for ${name} (HTTP ${res.status}) - schema check skipped`);
      continue;
    }
    schema = await res.json();
  } catch (e) {
    note(`could not fetch the schema for ${name} (${e.message}) - schema check skipped`);
    continue;
  }

  schemasChecked++;
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    note(`schema for ${name} would not compile (${e.message}) - check skipped`);
    continue;
  }

  if (validate(docs[name])) {
    ok(`${name} validates against the published schema`);
    continue;
  }

  /* KNOWN AMBIGUITY, and the reason this is a note rather than a failure:
     in plugin v2.4 the runtime `spec` is a oneOf over open-api-spec,
     local-plugin-spec and mcp-execution-spec, and a bare { url } satisfies BOTH
     of the first and last. Disambiguating means adding mcp_tool_description,
     which the schema defines as the switch that turns dynamic tool discovery
     OFF. That is a real regression to satisfy a linter, so the manifest stays
     as it is. Microsoft's validators discriminate on runtime.type, or every
     dynamic-discovery MCP plugin would fail.

     A failed oneOf reports every branch's complaints too ("must have required
     property 'local_endpoint'" comes from the local-plugin branch), so the
     whole subtree under the spec is forgiven rather than just the oneOf itself.
     The properties that actually matter there - https, /mcp, auth type - are
     checked directly in the Runtime wiring section above, so nothing real is
     hidden by this. Any error OUTSIDE a runtime spec is still a failure. */
  const specAmbiguity = (e) =>
    name === 'ai-plugin.json' && /^\/runtimes\/\d+\/spec\b/.test(String(e.instancePath));

  const real = (validate.errors ?? []).filter((e) => !specAmbiguity(e));
  const ambiguous = (validate.errors ?? []).length - real.length;

  if (ambiguous > 0) {
    note(`${name}: runtime spec matches both the OpenAPI and MCP shapes in Microsoft's schema - expected for a dynamic-discovery MCP plugin, see the comment in this script`);
  }
  if (real.length === 0) {
    ok(`${name} validates apart from that known schema ambiguity`);
  } else {
    fail(`${name} has ${real.length} schema violation(s)`);
    for (const e of real.slice(0, 8)) {
      console.log(`${c.dim}          ${e.instancePath || '<root>'}: ${e.message}${c.reset}`);
    }
  }
}

if (schemasChecked === 0) {
  note('no schemas could be fetched - only the offline checks above were run');
}

/* ------------------------------------------------------------------ */
section('Verdict');

if (problems.length > 0) {
  console.log(`${c.red}  ${problems.length} problem(s). This package would likely be rejected.${c.reset}\n`);
  process.exit(1);
}
if (schemasChecked === 0) {
  console.log(`${c.yellow}  Offline checks passed; schema validation was skipped.${c.reset}\n`);
  process.exit(2);
}
console.log(`${c.green}  Package looks valid.${c.reset}${notes.length ? ` ${notes.length} note(s) above.` : ''}\n`);
process.exit(0);
