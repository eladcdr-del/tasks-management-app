// owner: step 2.2 — shared helpers for the Firebase adapter's integration tests (run only under
// `firebase emulators:exec`, see vitest.config.ts → project "integration").

import { createFirebaseRepository, type FirebaseExtras } from '$lib/data/firebase';
import type { Repository } from '$lib/data/repository';

export const PROJECT_ID = 'demo-homecare';

function hostPort(envValue: string | undefined, fallbackPort: number): { host: string; port: number } {
  const [host, port] = (envValue ?? '').split(':');
  return { host: host || '127.0.0.1', port: Number(port) || fallbackPort };
}

const fs = hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
const au = hostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099);

export const EMULATOR = { host: fs.host, firestorePort: fs.port, authPort: au.port };

/** A web config for the emulators: only projectId matters (it selects the rules-enforcing project). */
export const TEST_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000'
};

export type FirebaseRepo = Repository & FirebaseExtras;

export function createTestRepository(): Promise<FirebaseRepo> {
  return createFirebaseRepository(TEST_CONFIG, { emulator: EMULATOR });
}

const FIRESTORE_ORIGIN = `http://${fs.host}:${fs.port}`;
const AUTH_ORIGIN = `http://${au.host}:${au.port}`;

/**
 * Deletes every Firestore document and every Auth account in the emulators. Retried: right after
 * a client is torn down, the Firestore emulator can answer 500 ("Stream is already completed")
 * while it still closes that client's listen stream.
 */
export async function clearEmulators(): Promise<void> {
  for (const url of [
    `${FIRESTORE_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    `${AUTH_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/accounts`
  ]) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) break;
      if (attempt >= 5) throw new Error(`clearEmulators: DELETE ${url} → ${res.status}`);
      await sleep(200 * attempt);
    }
  }
}

/**
 * Reads a document from the emulator as an admin (rules bypassed), straight from the server.
 * Returns the raw REST `fields` map, or null when the document does not exist.
 */
export async function serverDoc(path: string): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`serverDoc ${path}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  return body.fields ?? {};
}

/** Lists a collection on the emulator as an admin: document ids → raw REST fields. */
export async function serverList(path: string): Promise<Map<string, Record<string, unknown>>> {
  const url = `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`serverList ${path}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, unknown> }[] };
  return new Map(
    (body.documents ?? []).map((d) => [d.name.slice(d.name.lastIndexOf('/') + 1), d.fields ?? {}])
  );
}

/** A REST value's plain form, for the few fields the tests compare. */
export function restValue(v: unknown): unknown {
  const x = v as Record<string, unknown> | undefined;
  if (!x) return undefined;
  if ('stringValue' in x) return x.stringValue;
  if ('integerValue' in x) return Number(x.integerValue);
  if ('doubleValue' in x) return x.doubleValue;
  if ('booleanValue' in x) return x.booleanValue;
  if ('nullValue' in x) return null;
  if ('timestampValue' in x) return Date.parse(x.timestampValue as string);
  if ('arrayValue' in x) {
    return ((x.arrayValue as { values?: unknown[] }).values ?? []).map(restValue);
  }
  if ('mapValue' in x) {
    const fields = (x.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, restValue(val)]));
  }
  return x;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns true (or a value), failing after `ms`. */
export async function eventually<T>(
  check: () => T | Promise<T>,
  label: string,
  ms = 10_000
): Promise<NonNullable<T>> {
  const deadline = Date.now() + ms;
  let last: unknown;
  for (;;) {
    try {
      const v = await check();
      if (v) return v as NonNullable<T>;
      last = v;
    } catch (e) {
      last = e;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${ms}ms waiting for ${label}. Last: ${String(last)}`);
    }
    await sleep(20);
  }
}

/** Records every emission of a watcher until stopped. */
export function record<V>(subscribe: (cb: (v: V) => void) => () => void) {
  const values: V[] = [];
  const stop = subscribe((v) => values.push(v));
  return { values, stop, last: () => values.at(-1) };
}
