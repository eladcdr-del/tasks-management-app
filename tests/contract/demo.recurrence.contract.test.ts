// The recurrence contract against the demo adapter: an empty store per test, persisted to (fake)
// IndexedDB under a unique key, with a controllable clock fixed at the E2E date (a Sunday).
import 'fake-indexeddb/auto';
import { createDemoRepository } from '$lib/data/demo/demoRepository';
import { runRecurrenceContract } from './recurrenceContract';
import type { ContractClock } from './repositoryContract';

function testClock(start: number): ContractClock {
  let t = start;
  return {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    advance: (ms) => {
      t += ms;
    }
  };
}

let n = 0;

runRecurrenceContract('demo', async () => {
  const clock = testClock(Date.parse('2026-10-04T09:00:00+03:00'));
  const repo = await createDemoRepository({
    initial: 'empty',
    now: clock.now,
    storageKey: `homecare.demo.recurrence.${++n}.${Math.random().toString(36).slice(2)}`,
    persistDelayMs: 5
  });
  return {
    repo,
    clock,
    asUser: (uid) => repo.actAs(uid),
    cleanup: () => repo.dispose()
  };
});
