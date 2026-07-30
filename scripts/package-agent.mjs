/**
 * Packages the AgentLens declarative agent into a sideloadable .zip.
 *
 * Reads agent/appPackage/, substitutes the ${{PLACEHOLDER}} tokens from the
 * environment, and writes agent/build/agentlens-agent.zip.
 *
 * Required environment variables:
 *   AGENT_APP_ID        GUID for the Microsoft 365 app. Generate once and keep
 *                       it stable, otherwise each upload creates a new app.
 *                       PowerShell: [guid]::NewGuid()
 *   AGENTLENS_MCP_URL   Public https URL of the hosted MCP server, e.g.
 *                       https://agentlens-mcp.azurecontainerapps.io/mcp
 *
 * Usage:
 *   AGENT_APP_ID=<guid> AGENTLENS_MCP_URL=https://... node scripts/package-agent.mjs
 *
 * Requires Node 18+ (no external dependencies beyond archiver, which is only
 * needed here; if archiver is unavailable the script falls back to printing
 * the staged folder so you can zip it manually).
 */

import { mkdir, readdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "agent", "appPackage");
const buildDir = path.join(root, "agent", "build");
const stageDir = path.join(buildDir, "appPackage");
const zipPath = path.join(buildDir, "agentlens-agent.zip");

const required = ["AGENT_APP_ID", "AGENTLENS_MCP_URL"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing required environment variable(s): ${missing.join(", ")}\n`);
  console.error("Example:");
  console.error("  AGENT_APP_ID=<guid> AGENTLENS_MCP_URL=https://your-mcp-host/mcp node scripts/package-agent.mjs\n");
  process.exit(1);
}

const mcpUrl = process.env.AGENTLENS_MCP_URL;
if (!mcpUrl.startsWith("https://")) {
  console.error(`\nAGENTLENS_MCP_URL must be https. Got: ${mcpUrl}\n`);
  process.exit(1);
}

/** Replace every ${{TOKEN}} with process.env.TOKEN. Fails loudly on leftovers. */
function substitute(text, file) {
  const out = text.replace(/\$\{\{(\w+)\}\}/g, (_, key) => {
    const val = process.env[key];
    if (!val) throw new Error(`${file}: no value for \${{${key}}}`);
    return val;
  });
  const leftover = out.match(/\$\{\{\w+\}\}/);
  if (leftover) throw new Error(`${file}: unsubstituted token ${leftover[0]}`);
  return out;
}

await rm(buildDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });

const entries = await readdir(srcDir);
for (const name of entries) {
  const src = path.join(srcDir, name);
  const dest = path.join(stageDir, name);
  if (name.endsWith(".json")) {
    const raw = await readFile(src, "utf8");
    const filled = substitute(raw, name);
    JSON.parse(filled); // fail fast on malformed output
    await writeFile(dest, filled, "utf8");
    console.log(`  substituted  ${name}`);
  } else {
    await copyFile(src, dest);
    console.log(`  copied       ${name}`);
  }
}

// Zip the staged folder. archiver is optional; degrade gracefully.
let archiver;
try {
  ({ default: archiver } = await import("archiver"));
} catch {
  console.log(`\nStaged package ready: ${stageDir}`);
  console.log("archiver is not installed, so the .zip was not created.");
  console.log("Either run:  npm i -D archiver");
  console.log("or zip the CONTENTS of that folder (not the folder itself) manually.\n");
  process.exit(0);
}

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(stageDir, false); // false = contents at zip root
  archive.finalize();
});

console.log(`\nPackaged: ${zipPath}`);
console.log(`  app id : ${process.env.AGENT_APP_ID}`);
console.log(`  mcp url: ${mcpUrl}`);
console.log("\nSideload it at https://m365.cloud.microsoft/chat -> Agents -> Add agent -> Upload custom agent\n");
