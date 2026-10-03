import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use the preinstalled Chromium (build 1194 ≈ Playwright 1.56). Never run `playwright install` locally.
// Set before workers spawn, so they inherit it. CI installs its own browser and leaves this unset.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const PORT = 4173;
const BASE_PATH = '/tasks-management-app/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  // NOTE: baseURL has a path. Navigate with RELATIVE urls — page.goto('./') or
  // page.goto('./?demo=1&reset=1#/') — because page.goto('/') would drop /tasks-management-app/.
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 2 } : {}),
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
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
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Critical: parallel worktrees must never attach to another checkout's server.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore', // build/preview logs are noise; build errors still surface via stderr
    stderr: 'pipe',
    env: {
      BASE_PATH,
      // E2E builds = production build + test affordances (dev-only routes such as #/dev/gallery,
      // `?emulator=1`, window.__homecareTest). Deploy builds never set this.
      VITE_E2E: '1'
    }
  }
});
