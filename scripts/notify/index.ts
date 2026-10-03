// CLI entry: `tsx scripts/notify/index.ts [--dry] [--now=<ISO>] [--seed-demo]`.
//   --dry        plan and print, write nothing, send nothing
//   --now=<ISO>  override the clock, e.g. --now=2026-10-04T08:05:00+03:00
//   --seed-demo  (emulator only) write the demo household first, relative to --now
// Credentials: FIRESTORE_EMULATOR_HOST set → emulator, project demo-homecare, no credentials,
// pushes are printed instead of sent. Otherwise the FIREBASE_SERVICE_ACCOUNT JSON (project id read
// from it). Neither → notice + exit 0. Exit 1 on any unexpected error.

import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { annotation, parseServiceAccount, shouldRun } from './guard.ts';
import { run } from './run.ts';
import { ConsoleSender, FcmSender, type Sender } from './sender.ts';
import { seedDemo } from './seed.ts';

export const EMULATOR_PROJECT_ID = 'demo-homecare';

export interface CliArgs {
  dry: boolean;
  now?: Date;
  seedDemo: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dry: false, seedDemo: false };
  for (const a of argv) {
    if (a === '--dry') args.dry = true;
    else if (a === '--seed-demo') args.seedDemo = true;
    else if (a.startsWith('--now=')) {
      const value = a.slice('--now='.length);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error(`--now: not a valid ISO date-time: ${value}`);
      args.now = d;
    } else {
      throw new Error(`unknown argument: ${a} (use --dry, --now=<ISO>, --seed-demo)`);
    }
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const guard = shouldRun(process.env);
  if (!guard.run) {
    console.log(annotation(guard));
    return guard.level === 'error' ? 1 : 0;
  }

  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
  // No credentials against the emulator: stop google-auth probing the GCE metadata server (a
  // harmless but noisy "MetadataLookupWarning" off Google Cloud).
  if (emulator) process.env.METADATA_SERVER_DETECTION ??= 'none';
  const app = emulator
    ? initializeApp({ projectId: EMULATOR_PROJECT_ID })
    : (() => {
        const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
        return initializeApp({
          credential: cert({
            projectId: sa.project_id,
            clientEmail: sa.client_email,
            privateKey: sa.private_key
          }),
          projectId: sa.project_id
        });
      })();
  const db = getFirestore(app);

  if (args.seedDemo) {
    if (!emulator) throw new Error('--seed-demo only works against the Firestore emulator');
    await seedDemo(db, args.now ?? new Date());
    console.log('seeded the demo household into the emulator');
  }

  let sender: Sender | undefined;
  if (!args.dry) sender = emulator ? new ConsoleSender() : new FcmSender(getMessaging(app));

  const report = await run({
    db,
    ...(sender ? { sender } : {}),
    ...(args.now ? { now: args.now } : {}),
    dry: args.dry,
    log: (line) => console.log(line)
  });
  await db.terminate();
  return report.errors.length > 0 ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(
        `::error::notifier failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  );
}
