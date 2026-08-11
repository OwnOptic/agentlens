/**
 * Verify the Power Platform licensing endpoints against a real tenant.
 *
 * The consumption endpoint behind per-agent cost is UNDOCUMENTED - it backs the
 * Copilot Studio pages in the Power Platform admin center. It can change shape
 * without notice, and src/connectors/consumption.ts is written against the shape
 * observed in one tenant. This script checks that assumption against yours.
 *
 * It prints the SHAPE, never the data: field names, types, and how many rows
 * carried each field. The only values it prints are the distinct `modelMeter`
 * strings, because pricing depends on the literal 'premium' and a change there
 * would silently misprice every agent. No agent name, no ID, no count of
 * anything real leaves your terminal.
 *
 * Usage:
 *   AZURE_TENANT_ID=... AZURE_CLIENT_ID=... AZURE_CLIENT_SECRET=... \
 *   PPAC_BILLING_POLICY_ID=... node scripts/verify-consumption-shape.mjs
 *
 * Omit PPAC_BILLING_POLICY_ID and it lists the billing policies it can see, so
 * you can find the ID. Add --days=N to widen the window (default 30); a tenant
 * with little recent activity may need a wider one to return any rows at all.
 *
 * Exit codes:  0 shape matches  |  1 mismatch  |  2 could not check
 */

import { ConfidentialClientApplication } from '@azure/msal-node';

const LICENSING_SCOPE = 'https://licensing.powerplatform.microsoft.com/.default';
const PPAPI_SCOPE = 'https://api.powerplatform.com/.default';

/* What src/connectors/consumption.ts reads out of each row. Keep in sync. */
const EXPECTED_CONSUMPTION = {
  required: ['botId', 'environmentId', 'date', 'messageCount'],
  optional: [
    'sessionCount',
    'modelMeter',
    'generativeAnswers',
    'agentActions',
    'agentFlows',
    'textTools',
  ],
};

const EXPECTED_CAPACITY = {
  required: ['policyId', 'environmentId', 'creditLimit', 'creditUsed'],
  optional: [],
};

const args = process.argv.slice(2);
const days = Number(args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 30);

const c = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m',
};
const ok = (m) => console.log(`${c.green}  [OK]${c.reset} ${m}`);
const bad = (m) => console.log(`${c.red}  [MISMATCH]${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}  [NOTE]${c.reset} ${m}`);
const step = (m) => console.log(`${c.dim}  -> ${m}${c.reset}`);
const section = (t) => console.log(`\n${c.cyan}=== ${t} ===${c.reset}`);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\nMissing ${name}. This script needs the AgentLens-Reader credentials.\n`);
    process.exit(2);
  }
  return v;
}

const tenantId = requireEnv('AZURE_TENANT_ID');
const clientId = requireEnv('AZURE_CLIENT_ID');
const clientSecret = requireEnv('AZURE_CLIENT_SECRET');
const policyId = process.env.PPAC_BILLING_POLICY_ID?.trim();

const msal = new ConfidentialClientApplication({
  auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, clientSecret },
});

async function token(scope) {
  const r = await msal.acquireTokenByClientCredential({ scopes: [scope] });
  if (!r?.accessToken) throw new Error(`No token for ${scope}`);
  return r.accessToken;
}

/** Describe an array of objects by field name, type and how often it appears. */
function describe(rows) {
  const fields = new Map();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row ?? {})) {
      const entry = fields.get(k) ?? { count: 0, types: new Set() };
      entry.count++;
      entry.types.add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
      fields.set(k, entry);
    }
  }
  return fields;
}

function report(fields, rowCount, expected, label) {
  console.log(`\n  ${label}: ${rowCount} row(s) inspected`);
  console.log(`  ${'field'.padEnd(24)} ${'type'.padEnd(18)} present`);
  console.log(`  ${'-'.repeat(24)} ${'-'.repeat(18)} -------`);
  for (const [name, info] of [...fields].sort()) {
    const known =
      expected.required.includes(name) || expected.optional.includes(name) ? '' : `${c.yellow} (unexpected)${c.reset}`;
    console.log(
      `  ${name.padEnd(24)} ${[...info.types].join('|').padEnd(18)} ${info.count}/${rowCount}${known}`,
    );
  }

  let failures = 0;

  for (const name of expected.required) {
    if (!fields.has(name)) {
      bad(`required field "${name}" is absent - the connector reads it and would get undefined`);
      failures++;
    } else if (fields.get(name).count < rowCount) {
      bad(`required field "${name}" is missing from ${rowCount - fields.get(name).count} row(s)`);
      failures++;
    }
  }

  for (const name of expected.optional) {
    if (!fields.has(name)) {
      warn(`optional field "${name}" is absent in this tenant - handled, but the feature split or meter will be missing`);
    }
  }

  const extra = [...fields.keys()].filter(
    (n) => !expected.required.includes(n) && !expected.optional.includes(n),
  );
  if (extra.length > 0) {
    warn(`fields present that the connector ignores: ${extra.join(', ')}`);
    warn('if one of these is the current billing unit, the connector needs updating');
  }

  return failures;
}

let failures = 0;

/* ---- 1. billing policies / capacity ------------------------------------ */
section('Billing policies (capacity endpoint)');
step('GET https://api.powerplatform.com/licensing/v1/billingPolicies');

let discoveredPolicyIds = [];
try {
  const res = await fetch('https://api.powerplatform.com/licensing/v1/billingPolicies', {
    headers: { Authorization: `Bearer ${await token(PPAPI_SCOPE)}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`  HTTP ${res.status}`);

  if (res.ok) {
    const body = await res.json();
    const rows = Array.isArray(body?.value) ? body.value : Array.isArray(body) ? body : null;
    if (rows === null) {
      bad(`response has no "value" array. Top-level keys: ${Object.keys(body ?? {}).join(', ')}`);
      failures++;
    } else if (rows.length === 0) {
      warn('no billing policies in this tenant - it is likely on prepaid capacity packs,');
      warn('in which case per-agent consumption is not exposed by any API and');
      warn('PPAC_BILLING_POLICY_ID should stay unset.');
    } else {
      discoveredPolicyIds = rows.map((r) => r.policyId ?? r.id).filter(Boolean);
      failures += report(describe(rows), rows.length, EXPECTED_CAPACITY, 'billingPolicies');
      if (!policyId) {
        console.log(`\n  Policy IDs found (use one as PPAC_BILLING_POLICY_ID):`);
        for (const id of discoveredPolicyIds) console.log(`    ${id}`);
      }
    }
  } else {
    bad(`could not read billing policies: HTTP ${res.status}`);
    if (res.status === 403) warn('the service principal likely lacks Power Platform Administrator');
    failures++;
  }
} catch (e) {
  bad(`billing policies request failed: ${e.message}`);
  failures++;
}

/* ---- 2. per-agent consumption ------------------------------------------ */
section('Per-agent consumption (the undocumented endpoint)');

const targetPolicy = policyId ?? discoveredPolicyIds[0];
if (!targetPolicy) {
  warn('no billing policy to query - set PPAC_BILLING_POLICY_ID and re-run.');
  console.log(`\n${failures > 0 ? c.red + 'Mismatches found' : c.yellow + 'Consumption shape UNVERIFIED'}${c.reset}\n`);
  process.exit(failures > 0 ? 1 : 2);
}

const end = new Date();
const start = new Date(end);
start.setDate(start.getDate() - days);
const url =
  `https://licensing.powerplatform.microsoft.com/api/usage/v1/billingPolicies/${targetPolicy}` +
  `/copilotMessages?startDate=${start.toISOString().split('T')[0]}&endDate=${end.toISOString().split('T')[0]}`;

step(`GET .../billingPolicies/<policy>/copilotMessages  (last ${days} days)`);

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await token(LICENSING_SCOPE)}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`  HTTP ${res.status}`);

  if (!res.ok) {
    bad(`endpoint returned HTTP ${res.status}`);
    if (res.status === 404) warn('the policy ID may be wrong, or this endpoint has moved/been retired');
    if (res.status === 403) warn('the service principal lacks access to this billing policy');
    failures++;
  } else {
    const body = await res.json();
    const topKeys = Object.keys(body ?? {});
    console.log(`  top-level keys: ${topKeys.join(', ') || '(none)'}`);

    if (!Array.isArray(body?.value)) {
      bad('no "value" array - the connector treats this as a contract change and refuses to report');
      warn(`saw instead: ${topKeys.join(', ')}`);
      failures++;
    } else if (body.value.length === 0) {
      warn(`"value" is present but empty over the last ${days} days.`);
      warn('Shape of the rows is therefore UNVERIFIED. Re-run with --days=90.');
      ok('the envelope matches (value: array), so the connector would report zero honestly');
    } else {
      ok('"value" is an array, as the connector expects');
      failures += report(describe(body.value), body.value.length, EXPECTED_CONSUMPTION, 'copilotMessages');

      // The one value printed, and only because pricing turns on it.
      const meters = [...new Set(body.value.map((r) => r.modelMeter ?? null))];
      console.log(`\n  distinct modelMeter values: ${meters.map((m) => (m === null ? 'null' : `"${m}"`)).join(', ')}`);
      if (meters.some((m) => m !== null && m !== 'premium' && m !== 'standard')) {
        bad('an unrecognised meter is present - it would be priced at the STANDARD rate by default');
        warn('check src/domain/rates.ts and src/domain/projections.ts before trusting any cost figure');
        failures++;
      } else {
        ok('meter values are recognised by the pricing logic');
      }

      const sample = body.value[0];
      if (typeof sample.date === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(sample.date)) {
        bad(`"date" is not ISO-like - the connector splits on "T" and would mis-key days`);
        failures++;
      }
    }
  }
} catch (e) {
  bad(`consumption request failed: ${e.message}`);
  failures++;
}

section('Verdict');
if (failures === 0) {
  console.log(`${c.green}  Shape matches what src/connectors/consumption.ts expects.${c.reset}\n`);
  process.exit(0);
}
console.log(`${c.red}  ${failures} mismatch(es). Do not trust per-agent cost until these are resolved.${c.reset}`);
console.log(`  Paste the table above into an issue - it contains no tenant data.\n`);
process.exit(1);
