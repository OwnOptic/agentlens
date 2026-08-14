/**
 * Packages the AgentLens Copilot Cowork plugin into an uploadable .zip.
 *
 * Reads cowork/appPackage/, substitutes the ${{PLACEHOLDER}} tokens from the
 * environment, and writes cowork/build/agentlens-cowork.zip. The zip is FLAT
 * apart from the tools/ and skills/ folders, exactly as the v1.28 manifest
 * schema expects, and always includes the tool-description file that
 * mcpToolDescription references - omitting it is a hard upload failure
 * ("Required properties are missing from object: mcpToolDescription").
 *
 * Required environment variables:
 *   COWORK_APP_ID          GUID for the package. Generate once, keep stable
 *                          (cached in .agentlens-install.json as coworkAppId).
 *   AGENTLENS_MCP_URL      Public https URL of the MCP server, ending in /mcp.
 *   MCP_AUTH_REFERENCE_ID  The Entra SSO auth config ID (Teams developer
 *                          portal). Cowork does not support API keys; OAuth
 *                          vault is the production path.
 *
 * The tool-description file (cowork/appPackage/tools/agentlens-tools.json)
 * must be a real capture from the live server's tools/list - hand-authoring
 * it is how 12 of 19 tools once shipped with wrong parameter names.
 */

import { mkdir, readdir, readFile, writeFile, copyFile, rm, stat } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "cowork", "appPackage");
const buildDir = path.join(root, "cowork", "build");
const stageDir = path.join(buildDir, "appPackage");
const zipPath = path.join(buildDir, "agentlens-cowork.zip");

const required = ["COWORK_APP_ID", "AGENTLENS_MCP_URL", "MCP_AUTH_REFERENCE_ID"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing required environment variable(s): ${missing.join(", ")}\n`);
  process.exit(1);
}
if (!process.env.AGENTLENS_MCP_URL.startsWith("https://")) {
  console.error(`\nAGENTLENS_MCP_URL must be https. Got: ${process.env.AGENTLENS_MCP_URL}\n`);
  process.exit(1);
}

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

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dst);
    } else if (entry.name.endsWith(".json") || entry.name.endsWith(".md")) {
      await writeFile(dst, substitute(await readFile(src, "utf8"), entry.name));
      console.log(`  substituted  ${path.relative(srcDir, src)}`);
    } else {
      await copyFile(src, dst);
      console.log(`  copied       ${path.relative(srcDir, src)}`);
    }
  }
}

await rm(stageDir, { recursive: true, force: true });
await copyTree(srcDir, stageDir);

// Sanity: the manifest's mcpToolDescription file must exist in the stage.
const manifest = JSON.parse(await readFile(path.join(stageDir, "manifest.json"), "utf8"));
for (const conn of manifest.agentConnectors ?? []) {
  const file = conn.toolSource?.remoteMcpServer?.mcpToolDescription?.file;
  if (file && !existsSync(path.join(stageDir, file))) {
    console.error(`\nmcpToolDescription points at ${file}, which is not in the package.\n`);
    process.exit(1);
  }
}

let archiver;
try {
  archiver = (await import("archiver")).default;
} catch {
  console.log(`\nStaged at ${stageDir}. Install 'archiver' or zip it yourself (contents at zip root).`);
  process.exit(0);
}

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(stageDir, false);
  archive.finalize();
});

const { size } = await stat(zipPath);
console.log(`\nPackaged: ${zipPath} (${size} bytes)`);
console.log(`  app id : ${process.env.COWORK_APP_ID}`);
console.log(`  mcp url: ${process.env.AGENTLENS_MCP_URL}`);
console.log("\nSideload: atk install --file-path <zip> --scope Personal");
console.log("Tenant:   M365 admin center -> Manage apps -> Upload custom app; then Cowork -> Sources & Skills -> Plugins");
