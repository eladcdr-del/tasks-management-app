import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { alias } from './vite.config.ts';

// Emulator-backed projects only exist when FIRESTORE_EMULATOR_HOST is set, i.e. when run through
// `firebase emulators:exec` (npm run test:rules / test:integration). A bare `npx vitest` therefore
// runs only the emulator-free projects (unit + notifier) instead of failing on connection errors.
const withEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export default defineConfig({
  plugins: [svelte()],
  cacheDir: '.vite', // worktree-local (see vite.config.ts)
  resolve: { alias },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_COMMIT__: JSON.stringify('test')
  },
  test: {
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
