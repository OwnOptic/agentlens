import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Each file gets a clean module registry. The tools read configuration at
    // import time, so a leaked env var from one file would silently change what
    // another file is testing.
    isolate: true,
    environment: 'node',
  },
});
