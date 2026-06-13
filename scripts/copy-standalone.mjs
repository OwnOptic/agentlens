#!/usr/bin/env node
/**
 * copy-standalone.mjs
 *
 * Cross-platform post-build helper: copies static assets into the Next.js
 * standalone output so the self-contained server bundle is complete.
 *
 * Replaces the `sh`/`cp -r` approach in azure.yaml which breaks on Windows.
 * Called via: npm run postbuild:standalone
 *
 * NOTE: this is a `.mjs` file (ESM) on purpose - the project package.json is
 * CommonJS (no "type":"module") because Next.js's standalone server.js is
 * CommonJS and would crash with `require is not defined` if the bundled
 * package.json were ESM. Keeping this helper as .mjs gets ESM without the
 * project-wide flag.
 *
 * Copies:
 *   .next/static  ->  .next/standalone/.next/static
 *   public        ->  .next/standalone/public
 */

import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function copy(src, dest) {
  const srcPath = join(root, src);
  const destPath = join(root, dest);

  if (!existsSync(srcPath)) {
    console.warn(`[copy-standalone] WARN: source not found, skipping: ${srcPath}`);
    return;
  }

  console.log(`[copy-standalone] ${src} -> ${dest}`);
  cpSync(srcPath, destPath, { recursive: true, force: true });
}

copy('.next/static', '.next/standalone/.next/static');
copy('public', '.next/standalone/public');

console.log('[copy-standalone] Done.');
