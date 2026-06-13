import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

// Minimal Vitest config: maps the `@/` path alias (mirrors tsconfig.json paths)
// so unit tests can import project modules, and runs in a Node environment.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});
