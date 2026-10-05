// Publishes firestore.rules to the live project: `tsx scripts/notify/deploy-rules.ts [--force]`
// (run by .github/workflows/deploy-rules.yml whenever firestore.rules changes on the main branch).
// Uses the FIREBASE_SERVICE_ACCOUNT key through the Admin SDK's Security Rules API, so nobody has
// to paste the rules into the console again. Skips the release when the live rules already match
// (--force releases anyway). A rules file that does not compile fails here, before it goes live.

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { parseServiceAccount } from './guard.ts';

const normalize = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

async function main(): Promise<number> {
  const force = process.argv.includes('--force');
  const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
  const app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key
    }),
    projectId: sa.project_id
  });
  const rules = getSecurityRules(app);
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

  const live = await rules.getFirestoreRuleset().catch(() => null);
  const liveSource = live ? live.source.map((f) => f.content).join('\n') : '';
  if (!force && normalize(liveSource) === normalize(source)) {
    console.log(`rules: already live in ${sa.project_id} (${live?.name ?? 'unknown ruleset'})`);
    return 0;
  }
  const released = await rules.releaseFirestoreRulesetFromSource(source);
  console.log(`rules: released ${released.name} to ${sa.project_id}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(
      `::error::rules deploy failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
);
