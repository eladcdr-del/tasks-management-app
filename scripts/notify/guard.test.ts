import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { annotation, parseServiceAccount, shouldRun } from './guard.ts';

const SA = JSON.stringify({
  type: 'service_account',
  project_id: 'homecare-123',
  client_email: 'firebase-adminsdk@homecare-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
});

describe('shouldRun', () => {
  it.each([
    ['absent', {}],
    ['empty', { FIREBASE_SERVICE_ACCOUNT: '' }],
    ['whitespace', { FIREBASE_SERVICE_ACCOUNT: '  \n ' }]
  ])('skips quietly (notice, exit 0) when the secret is %s', (_label, env) => {
    const g = shouldRun(env);
    expect(g).toEqual({
      run: false,
      reason: 'FIREBASE_SERVICE_ACCOUNT secret missing — skipping',
      level: 'notice'
    });
    expect(annotation(g)).toBe('::notice::FIREBASE_SERVICE_ACCOUNT secret missing — skipping');
  });

  it('runs with a well-formed service account', () => {
    const g = shouldRun({ FIREBASE_SERVICE_ACCOUNT: SA });
    expect(g.run).toBe(true);
    expect(g.level).toBe('info');
    expect(g.reason).toContain('homecare-123');
  });

  it.each([
    ['not JSON', '{"project_id": "x"', 'not valid JSON'],
    ['an array', '[]', 'not a JSON object'],
    [
      'missing private_key',
      JSON.stringify({ project_id: 'p', client_email: 'e' }),
      '"private_key"'
    ],
    [
      'an empty project_id',
      JSON.stringify({ project_id: ' ', client_email: 'e', private_key: 'k' }),
      '"project_id"'
    ]
  ])('fails loudly (error, exit 1) when the secret is %s', (_label, raw, why) => {
    const g = shouldRun({ FIREBASE_SERVICE_ACCOUNT: raw });
    expect(g.run).toBe(false);
    expect(g.level).toBe('error');
    expect(g.reason).toContain(why);
    expect(annotation(g)).toMatch(/^::error::FIREBASE_SERVICE_ACCOUNT is set but unusable: /);
  });

  it('always runs against the emulator, secret or not', () => {
    expect(shouldRun({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toMatchObject({
      run: true,
      level: 'info'
    });
    expect(
      shouldRun({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_SERVICE_ACCOUNT: 'junk' }).run
    ).toBe(true);
  });

  it('parseServiceAccount returns the parsed key', () => {
    expect(parseServiceAccount(SA).project_id).toBe('homecare-123');
  });
});

// The workflow's guard step must apply the same rule. Extract its shell script from notify.yml and
// execute it for real with bash, the way the runner does.
describe('workflow guard step (.github/workflows/notify.yml)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const yml = readFileSync(join(here, '../../.github/workflows/notify.yml'), 'utf8');
  const tmp = mkdtempSync(join(tmpdir(), 'notify-guard-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function guardScript(): string {
    const lines = yml.split('\n');
    const idLine = lines.findIndex((l) => /^\s+id: guard\s*$/.test(l));
    expect(idLine).toBeGreaterThan(0);
    const runLine = lines.findIndex((l, i) => i > idLine && /^\s+run: \|\s*$/.test(l));
    const indent = (l: string) => l.length - l.trimStart().length;
    const base = indent(lines[runLine] ?? '');
    const body: string[] = [];
    for (const l of lines.slice(runLine + 1)) {
      if (l.trim() !== '' && indent(l) <= base) break;
      body.push(l);
    }
    const strip = Math.min(...body.filter((l) => l.trim()).map(indent));
    return body.map((l) => l.slice(strip)).join('\n');
  }

  function runGuard(secret: string | undefined, name: string) {
    const output = join(tmp, `${name}.out`);
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output };
    if (secret !== undefined) env.FIREBASE_SERVICE_ACCOUNT = secret;
    const res = spawnSync('bash', ['-e', '-c', guardScript()], { env, encoding: 'utf8' });
    return { status: res.status, stdout: res.stdout, output: readFileSync(output, 'utf8') };
  }

  it('exits 0 with a notice and run=false when the secret is absent or empty', () => {
    for (const [secret, name] of [
      [undefined, 'absent'],
      ['', 'empty']
    ] as const) {
      const r = runGuard(secret, name);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('::notice::FIREBASE_SERVICE_ACCOUNT secret missing — skipping');
      expect(r.output.trim()).toBe('run=false');
    }
  });

  it('sets run=true when the secret is present', () => {
    const r = runGuard(SA, 'present');
    expect(r.status).toBe(0);
    expect(r.output.trim()).toBe('run=true');
  });

  it('gates every notifier step on the guard output and keeps the keepalive independent', () => {
    for (const step of [
      'Checkout',
      'Set up Node 22',
      'Install notifier dependencies',
      'Run notifier'
    ]) {
      const at = yml.indexOf(`- name: ${step}`);
      expect(at, step).toBeGreaterThan(0);
      expect(yml.slice(at).split('\n')[1]).toContain("if: steps.guard.outputs.run == 'true'");
    }
    expect(yml).toContain("cron: '*/5 * * * *'");
    expect(yml).toMatch(/concurrency:\n\s+group: notify\n\s+cancel-in-progress: false/);
    expect(yml).toContain(
      'gh api -X PUT "repos/$GITHUB_REPOSITORY/actions/workflows/notify.yml/enable"'
    );
    expect(yml).toContain('npx --prefix scripts/notify tsx scripts/notify/index.ts');
  });
});
