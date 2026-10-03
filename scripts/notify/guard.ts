// Should this run do anything at all? The repo is public and works without Firebase admin access,
// so a missing FIREBASE_SERVICE_ACCOUNT secret is a normal state, not a failure: skip quietly
// (GitHub "notice" annotation, exit 0). The workflow's guard step applies the same rule in shell
// before anything is installed; index.ts applies it again, so a manual or local run behaves the
// same. A secret that is present but unusable IS an error (exit 1), so a bad paste shows up red.

export interface GuardResult {
  run: boolean;
  reason: string;
  /** How to report a skip: 'notice' exits 0, 'error' exits 1. 'info' when running. */
  level: 'info' | 'notice' | 'error';
}

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

/** Parses the secret's JSON and checks the three fields firebase-admin's cert() needs. */
export function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('not valid JSON (paste the whole downloaded key file)');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('not a JSON object');
  }
  const sa = parsed as Record<string, unknown>;
  for (const field of ['project_id', 'client_email', 'private_key'] as const) {
    if (typeof sa[field] !== 'string' || (sa[field] as string).trim() === '') {
      throw new Error(`missing "${field}" (is this a service-account key file?)`);
    }
  }
  return sa as ServiceAccount;
}

export function shouldRun(env: Record<string, string | undefined>): GuardResult {
  const emulator = env.FIRESTORE_EMULATOR_HOST?.trim();
  if (emulator)
    return { run: true, reason: `using the Firestore emulator at ${emulator}`, level: 'info' };

  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    return {
      run: false,
      reason: 'FIREBASE_SERVICE_ACCOUNT secret missing — skipping',
      level: 'notice'
    };
  }
  try {
    const sa = parseServiceAccount(raw);
    return { run: true, reason: `service account for project ${sa.project_id}`, level: 'info' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return {
      run: false,
      reason: `FIREBASE_SERVICE_ACCOUNT is set but unusable: ${why}`,
      level: 'error'
    };
  }
}

/** The GitHub Actions workflow-command line for a guard result. */
export function annotation(g: GuardResult): string {
  return g.level === 'info' ? g.reason : `::${g.level}::${g.reason}`;
}
