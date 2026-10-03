import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use the preinstalled Chromium (build 1194 ≈ Playwright 1.56). Never run `playwright install` locally.
// Set before workers spawn, so they inherit it. CI installs its own browser and leaves this unset.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

// Locks: parallel worktrees share one machine, so wrap runs in flock —
//   flock /tmp/homecare-e2e.lock npm run test:e2e -- <spec>
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock npm run test:e2e:emu
// When a run needs both, ALWAYS take the emulator lock first, then the e2e lock (fixed order, no
// deadlock). E2E_PORT overrides the preview port (default 4173) if another checkout must run at once.
const PORT = Number(process.env.E2E_PORT) || 4173;
const BASE_PATH = '/tasks-management-app/';
// E2E builds go to their own directory, so they never clobber the deployable `dist/`.
const OUT_DIR = 'dist-e2e';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  // NOTE: baseURL has a path. Navigate with RELATIVE urls — page.goto('./') or
  // page.goto('./?demo=1&reset=1#/') — because page.goto('/') would drop /tasks-management-app/.
  // Specs import { test, expect, openApp, shot } from './fixtures' (fixed clock, demo boot, screenshots).
  outputDir: 'test-results',
  // toHaveScreenshot baselines: tests/e2e/__snapshots__/<spec file>/<name>.png
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 2 } : {}),
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000, toHaveScreenshot: { animations: 'disabled' } },
  use: {
    ...devices['Pixel 7'], // Android Chrome UA
    baseURL: BASE_URL,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'demo', testDir: 'tests/e2e' },
    { name: 'emulator', testDir: 'tests/e2e-emulator' }
  ],
  webServer: {
    // BUILD_OUT_DIR drives vite.config.ts build.outDir and scripts/postbuild.mjs alike.
    command: `npm run build && npm run preview -- --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Critical: parallel worktrees must never attach to another checkout's server.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore', // build/preview logs are noise; build errors still surface via stderr
    stderr: 'pipe',
    env: {
      BASE_PATH,
      BUILD_OUT_DIR: OUT_DIR,
      // E2E builds = production build + test affordances (dev-only routes such as #/dev/gallery,
      // `?emulator=1`, window.__homecareTest). Deploy builds never set this.
      VITE_E2E: '1'
    }
  }
});
