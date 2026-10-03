import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from './index.ts';

describe('parseArgs', () => {
  it('defaults to a real run at the current time', () => {
    expect(parseArgs([])).toEqual({ dry: false, seedDemo: false });
  });

  it('reads --dry, --seed-demo and --now (with or without seconds)', () => {
    const a = parseArgs(['--dry', '--seed-demo', '--now=2026-10-04T08:05+03:00']);
    expect(a.dry).toBe(true);
    expect(a.seedDemo).toBe(true);
    expect(a.now?.toISOString()).toBe('2026-10-04T05:05:00.000Z');
    expect(parseArgs(['--now=2026-10-04T08:05:00+03:00']).now?.toISOString()).toBe(
      '2026-10-04T05:05:00.000Z'
    );
  });

  it('rejects a bad --now and unknown flags', () => {
    expect(() => parseArgs(['--now=tomorrow'])).toThrow(/--now/);
    expect(() => parseArgs(['--send-everything'])).toThrow(/unknown argument/);
  });
});

describe('CLI without credentials', () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it('prints a notice and exits 0 when the secret is absent (no emulator)', () => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? ''
    };
    const res = spawnSync(join(here, 'node_modules/.bin/tsx'), ['index.ts'], {
      cwd: here,
      env,
      encoding: 'utf8'
    });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('::notice::FIREBASE_SERVICE_ACCOUNT secret missing — skipping');
  });

  it('exits 1 with an error annotation when the secret is malformed', () => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      FIREBASE_SERVICE_ACCOUNT: '{"type": "service_account"}'
    };
    const res = spawnSync(join(here, 'node_modules/.bin/tsx'), ['index.ts'], {
      cwd: here,
      env,
      encoding: 'utf8'
    });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('::error::FIREBASE_SERVICE_ACCOUNT is set but unusable');
  });
});
