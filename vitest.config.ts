import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { alias } from './vite.config.ts';

// Emulator-backed projects only exist when FIRESTORE_EMULATOR_HOST is set, i.e. when run through
// `firebase emulators:exec` (npm run test:rules / test:integration). A bare `npx vitest` therefore
// runs only the emulator-free projects (unit + notifier) instead of failing on connection errors.
const withEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// Deterministic time zone for every test run (the app pins Asia/Jerusalem explicitly where it
// matters; domain tests were also verified under other zones). Set before workers spawn, and again
// via `test.env` for the workers themselves.
process.env.TZ = 'UTC';

export default defineConfig({
  plugins: [svelte()],
  cacheDir: '.vite', // worktree-local (see vite.config.ts)
  resolve: { alias },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_COMMIT__: JSON.stringify('test')
  },
  test: {
    env: { TZ: 'UTC' },
    // `npm run test:coverage`: the pure logic must stay ≥ 90 % line-covered. Globs that match nothing
    // yet (src/lib/parser/** before step 1.3 lands) are simply empty.
    coverage: {
      provider: 'v8',
      include: ['src/lib/domain/**/*.ts', 'src/lib/parser/**/*.ts', 'src/lib/i18n/format.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/__fixtures__/**', 'src/lib/domain/types.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 90 }
    },
    projects: [
      {
        extends: true,
        // Browser export conditions + inline @testing-library/svelte, so jsdom tests mount the client
        // build of Svelte. Auto-cleanup is done in src/test/setup.ts (it also runs in Node files).
        plugins: [svelteTesting({ autoCleanup: false })],
        test: {
          name: 'unit',
          // Default environment is Node. Files that need a DOM (components, runes with $effect,
          // router) opt in with a first-line docblock:  // @vitest-environment jsdom
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts', 'tests/contract/**/*.test.ts'],
          setupFiles: ['src/test/setup.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'notifier',
          environment: 'node',
          include: ['scripts/notify/**/*.test.ts'],
          testTimeout: 20_000
        }
      },
      ...(withEmulator
        ? [
            {
              extends: true as const,
              test: {
                name: 'rules',
                environment: 'node' as const,
                include: ['tests/rules/**/*.test.ts'],
                fileParallelism: false, // one shared emulator
                testTimeout: 20_000,
                hookTimeout: 30_000
              }
            },
            {
              extends: true as const,
              test: {
                name: 'integration',
                environment: 'node' as const,
                include: ['tests/integration/**/*.test.ts'],
                fileParallelism: false, // one shared emulator
                testTimeout: 30_000,
                hookTimeout: 30_000
              }
            }
          ]
        : [])
    ]
  }
});
