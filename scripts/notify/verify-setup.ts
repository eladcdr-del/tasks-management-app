// Setup check: `tsx scripts/notify/verify-setup.ts` (run by .github/workflows/verify-setup.yml).
// Reads the live Firebase project with the FIREBASE_SERVICE_ACCOUNT key and confirms that every
// console step in SETUP.md took effect: the web config points at the same project, Firestore
// exists, the published rules equal firestore.rules, the indexes exist, Google sign-in is on, the
// site's domain is authorized and FCM accepts requests.
// Read-only: it never changes the project. Logs are public, so it prints verdicts and counts only.
// Exit 1 when a required check fails; optional checks only warn.

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { firebaseConfig } from '../../firebase-config.ts';
import { parseServiceAccount } from './guard.ts';

const SITE_DOMAIN = 'eladcdr-del.github.io';
/**
 * Key prefixes of households/{hid}/sent, one per push kind (planner.ts): ev = requests, answers,
 * completions and the jar; due (with late: overdue) = the morning summary; eve = the day before a
 * deadline; wk = the Sunday nudge; soon = before the time; new = new tasks; test = "בדיקת התראות".
 */
const SENT_KINDS = ['ev', 'due', 'eve', 'wk', 'soon', 'late', 'new', 'test'] as const;
const ROOT = new URL('../../', import.meta.url);

type Level = 'ok' | 'fail' | 'warn';
const results: { level: Level; label: string; detail: string }[] = [];

function report(level: Level, label: string, detail = ''): void {
  results.push({ level, label, detail });
  const mark = level === 'ok' ? '✓' : level === 'warn' ? '!' : '✗';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  if (level === 'fail') console.log(`::error::${label}${detail ? `: ${detail}` : ''}`);
  if (level === 'warn') console.log(`::warning::${label}${detail ? `: ${detail}` : ''}`);
}

/** Runs one check; an unexpected error (permission, network) counts as `onError`. */
async function check(label: string, fn: () => Promise<void>, onError: Level = 'fail') {
  try {
    await fn();
  } catch (err) {
    report(onError, label, `could not check: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const normalize = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

async function main(): Promise<number> {
  const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
  const project = sa.project_id;
  const credential = cert({
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    privateKey: sa.private_key
  });
  const app = initializeApp({ credential, projectId: project });
  const { access_token: token } = await credential.getAccessToken();

  async function api(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { status?: string } };
      throw new Error(`HTTP ${res.status}${body.error?.status ? ` ${body.error.status}` : ''}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
  const fs = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`;

  // 1. The web config and the service account belong to the same project.
  if (firebaseConfig.projectId === project)
    report('ok', 'firebase-config.ts matches the key', project);
  else
    report(
      'fail',
      'firebase-config.ts and the service account are different projects',
      `${firebaseConfig.projectId || '(empty)'} vs ${project}`
    );

  // 2. Firestore exists, in Native mode.
  await check('Firestore database', async () => {
    const db = await api(fs);
    if (db.type === 'FIRESTORE_NATIVE')
      report('ok', 'Firestore database', `location ${String(db.locationId)}`);
    else report('fail', 'Firestore database', `type ${String(db.type)}, expected FIRESTORE_NATIVE`);
  });

  // 3. The published rules are exactly firestore.rules.
  await check('Firestore rules', async () => {
    const release = await api(
      `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`
    );
    const ruleset = (await api(
      `https://firebaserules.googleapis.com/v1/${String(release.rulesetName)}`
    )) as { source?: { files?: { content?: string }[] } };
    const live = normalize((ruleset.source?.files ?? []).map((f) => f.content ?? '').join('\n'));
    const repo = normalize(readFileSync(new URL('firestore.rules', ROOT), 'utf8'));
    if (live === repo) {
      report('ok', 'Firestore rules', 'identical to firestore.rules');
      return;
    }
    const a = repo.split('\n');
    const b = live.split('\n');
    const line = a.findIndex((l, i) => l !== b[i]);
    const at = line === -1 ? b.length : line;
    report(
      'fail',
      'Firestore rules differ from firestore.rules',
      `first difference at line ${at + 1}: repo "${(a[at] ?? '(end)').trim().slice(0, 80)}" / live "${(b[at] ?? '(end)').trim().slice(0, 80)}". Paste firestore.rules again and Publish`
    );
  });

  // 4. Indexes from firestore.indexes.json.
  const spec = JSON.parse(readFileSync(new URL('firestore.indexes.json', ROOT), 'utf8')) as {
    indexes: {
      collectionGroup: string;
      queryScope: string;
      fields: { fieldPath: string; order: string }[];
    }[];
    fieldOverrides: { collectionGroup: string; fieldPath: string }[];
  };
  await check('Composite indexes', async () => {
    const live = ((await api(`${fs}/collectionGroups/-/indexes`)).indexes ?? []) as {
      name: string;
      queryScope: string;
      state: string;
      fields: { fieldPath: string; order?: string }[];
    }[];
    const key = (group: string, scope: string, fields: { fieldPath: string; order?: string }[]) =>
      `${group}|${scope}|${fields
        .filter((f) => f.fieldPath !== '__name__')
        .map((f) => `${f.fieldPath}:${f.order ?? ''}`)
        .join(',')}`;
    const byKey = new Map(
      live.map((ix) => [
        key(ix.name.split('/collectionGroups/')[1]!.split('/')[0]!, ix.queryScope, ix.fields),
        ix.state
      ])
    );
    for (const ix of spec.indexes) {
      const label = `Index ${ix.collectionGroup}(${ix.fields.map((f) => `${f.fieldPath} ${f.order === 'ASCENDING' ? '↑' : '↓'}`).join(', ')})`;
      const state = byKey.get(key(ix.collectionGroup, ix.queryScope, ix.fields));
      if (state === 'READY') report('ok', label, 'ready');
      else if (state)
        report('warn', label, `state ${state} (still building; check again in a few minutes)`);
      else report('fail', label, 'missing. Create it in Firestore → Indexes → Composite');
    }
  });

  // 5. Optional: photo fields exempt from indexing, TTL on the notification log.
  for (const fo of spec.fieldOverrides) {
    await check(
      `Index exemption ${fo.collectionGroup}.${fo.fieldPath} (optional)`,
      async () => {
        const field = (await api(
          `${fs}/collectionGroups/${fo.collectionGroup}/fields/${fo.fieldPath}`
        )) as {
          indexConfig?: { usesAncestorConfig?: boolean };
        };
        if (field.indexConfig?.usesAncestorConfig === false)
          report('ok', `Index exemption ${fo.collectionGroup}.${fo.fieldPath}`, 'set');
        else
          report(
            'warn',
            `Index exemption ${fo.collectionGroup}.${fo.fieldPath} (optional)`,
            'not set'
          );
      },
      'warn'
    );
  }
  await check(
    'TTL on sent.expireAt (optional)',
    async () => {
      const field = (await api(`${fs}/collectionGroups/sent/fields/expireAt`)) as {
        ttlConfig?: { state?: string };
      };
      if (field.ttlConfig?.state === 'ACTIVE') report('ok', 'TTL on sent.expireAt', 'active');
      else
        report(
          'warn',
          'TTL on sent.expireAt (optional)',
          field.ttlConfig ? `state ${field.ttlConfig.state}` : 'not set'
        );
    },
    'warn'
  );

  // 6. Google sign-in and the authorized domain.
  const idp = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}`;
  await check('Google sign-in', async () => {
    const google = await api(`${idp}/defaultSupportedIdpConfigs/google.com`);
    if (google.enabled === true) report('ok', 'Google sign-in', 'enabled');
    else
      report(
        'fail',
        'Google sign-in is disabled',
        'Authentication → Sign-in method → Google → Enable'
      );
  });
  await check('Authorized domain', async () => {
    const config = await api(`${idp}/config`);
    const domains = (config.authorizedDomains ?? []) as string[];
    if (domains.includes(SITE_DOMAIN)) report('ok', 'Authorized domain', SITE_DOMAIN);
    else
      report(
        'fail',
        `${SITE_DOMAIN} is not an authorized domain`,
        'Authentication → Settings → Authorized domains → Add domain'
      );
  });

  // 7. FCM accepts our credentials (dry run to a fake token: "invalid token" means the API works).
  await check('Cloud Messaging', async () => {
    try {
      await getMessaging(app).send(
        { token: 'homecare-setup-check', data: { kind: 'check' } },
        true
      );
      report('ok', 'Cloud Messaging', 'reachable');
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'unknown';
      if (
        code === 'messaging/invalid-argument' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      )
        report('ok', 'Cloud Messaging', 'reachable');
      else report('fail', 'Cloud Messaging rejected the request', code);
    }
  });

  // 8. Counts only (public logs).
  await check(
    'Data',
    async () => {
      const db = getFirestore(app);
      const households = await db.collection('households').get();
      let members = 0;
      let devices = 0;
      for (const h of households.docs) {
        const memberDocs = await h.ref.collection('members').get();
        members += memberDocs.size;
        for (const m of memberDocs.docs)
          devices += (
            await db.collection('users').doc(m.id).collection('devices').count().get()
          ).data().count;
      }
      report(
        'ok',
        'Data',
        `${households.size} household(s), ${members} member(s), ${devices} device(s) with notifications`
      );
    },
    'warn'
  );

  // 9. Notification health, per household and member (anonymised labels, counts and codes only).
  await check(
    'Notification health',
    async () => {
      const db = getFirestore(app);
      const messaging = getMessaging(app);
      const now = Date.now();
      const week = now - 7 * 86_400_000;
      const millis = (v: unknown): number | null =>
        v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null;
      const age = (ms: number | null) =>
        ms === null ? 'never' : `${Math.round((now - ms) / 3_600_000)}h ago`;
      const households = await db.collection('households').get();
      let h = 0;
      for (const hh of households.docs) {
        h += 1;
        const memberDocs = await hh.ref.collection('members').get();
        console.log(`  household #${h}: ${memberDocs.size} member(s)`);
        let m = 0;
        for (const md of memberDocs.docs) {
          m += 1;
          const prefs = (md.data().notify ?? {}) as Record<string, unknown>;
          const off = Object.entries(prefs)
            .filter(([, v]) => v === false)
            .map(([k]) => k);
          const devices = await db.collection('users').doc(md.id).collection('devices').get();
          const rows: string[] = [];
          for (const d of devices.docs) {
            const data = d.data();
            const token = typeof data.token === 'string' ? data.token : '';
            const hid = typeof data.householdId === 'string' ? data.householdId : '';
            const ua = typeof data.userAgent === 'string' ? data.userAgent : '';
            const platform = /Android/.test(ua)
              ? 'Android'
              : /iPhone|iPad/.test(ua)
                ? 'iOS'
                : /Windows|Macintosh|Linux/.test(ua)
                  ? 'desktop'
                  : 'other';
            let tokenState = 'no token';
            if (token) {
              try {
                await messaging.send({ token, data: { kind: 'check' } }, true);
                tokenState = 'token valid';
              } catch (err) {
                tokenState = `token rejected (${(err as { code?: string }).code ?? 'unknown'})`;
              }
            }
            const where = hid === hh.id ? 'this house' : hid === '' ? 'no house' : 'OTHER house';
            const tested = millis(data.testPushAt);
            rows.push(
              `${platform}, ${where}, ${tokenState}, updated ${age(millis(data.updatedAt))}` +
                (tested !== null ? `, test asked ${age(tested)}` : '')
            );
          }
          console.log(
            `    member ${String.fromCharCode(64 + m)}: ${devices.size} device(s)${off.length ? `, turned off: ${off.join(',')}` : ''}`
          );
          for (const r of rows) console.log(`      - ${r}`);
        }
        const events = await hh.ref.collection('events').get();
        const tally = new Map<string, number>();
        let lastPushable: number | null = null;
        for (const e of events.docs) {
          const data = e.data();
          const at = millis(data.createdAt);
          if (at === null || at < week) continue;
          const key = `${String(data.type)}/${String(data.push)}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
          if (data.push !== 'none' && (lastPushable === null || at > lastPushable))
            lastPushable = at;
        }
        console.log(
          `    events last 7 days (type/push): ${[...tally].map(([k, n]) => `${k}=${n}`).join(' ') || 'none'}; newest pushable ${age(lastPushable)}`
        );
        // Each sent doc is one dedupe key, named {kind}:… (planner.ts); a summary push claims one
        // per task it lists. prune:{date} is the daily prune marker, not a push, so it is left out.
        const sent = await hh.ref.collection('sent').get();
        const perKind = new Map<string, number>(SENT_KINDS.map((k) => [k, 0]));
        let sentWeek = 0;
        let lastSent: number | null = null;
        for (const s of sent.docs) {
          const kind = s.id.split(':')[0] ?? '';
          const at = millis(s.data().at);
          if (kind === 'prune' || at === null) continue;
          if (lastSent === null || at > lastSent) lastSent = at;
          if (at < week) continue;
          sentWeek += 1;
          const k = perKind.has(kind) ? kind : 'other';
          perKind.set(k, (perKind.get(k) ?? 0) + 1);
        }
        const kinds = [...perKind].filter(([k, n]) => k !== 'other' || n > 0);
        console.log(
          `    sent keys last 7 days: ${sentWeek} (${kinds.map(([k, n]) => `${k}=${n}`).join(' ')}); newest ${age(lastSent)}`
        );
      }
      report('ok', 'Notification health', 'details above');
      await db.terminate();
    },
    'warn'
  );

  const failed = results.filter((r) => r.level === 'fail').length;
  const warned = results.filter((r) => r.level === 'warn').length;
  console.log(
    failed
      ? `\n${failed} required check(s) failed. See the ✗ lines above.`
      : `\nAll required checks passed${warned ? ` (${warned} optional item(s) not set)` : ''}.`
  );
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(
      `::error::setup check failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
);
