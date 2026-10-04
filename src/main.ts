// Entry (1.1 → 2.4): styles, router, boot, mount.
//
// The boot starts before mount and its first step (mode resolution) is synchronous, so the first
// render already knows the mode: setup mode paints #/setup straight away; the other modes paint the
// splash until the first auth state has been applied (session.svelte.ts).
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { router } from '$lib/router/router.svelte';
import { hasTestSignIn, isDemoRepository } from '$lib/data/select';
import { session } from '$lib/state/session.svelte';
import { household } from '$lib/state/household.svelte';
import { tasks } from '$lib/state/tasks.svelte';
import { sync } from '$lib/state/sync.svelte';
import { ui } from '$lib/state/ui.svelte';
import { prefs } from '$lib/state/prefs.svelte';
import { clock } from '$lib/state/clock.svelte';

router.start();
clock.start();
void session.boot();

// Test hooks: dev and E2E builds only. The condition is inlined (like the dev gallery's in
// App.svelte) so Rolldown removes this whole block, and `__homecareTest`, from production builds.
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  const state = { session, household, tasks, sync, ui, prefs, clock };

  /** Polls until `ok()` (auth emissions of the Firebase adapter may land after its promise). */
  const until = async (ok: () => boolean, what: string, ms = 10_000): Promise<void> => {
    const start = performance.now();
    while (!ok()) {
      if (performance.now() - start > ms)
        throw new Error(`__homecareTest: timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await session.settled();
  };

  const demoRepo = async () => {
    await session.whenBooted();
    const repo = session.repo;
    if (!isDemoRepository(repo)) throw new Error('__homecareTest: not in demo mode');
    return repo;
  };

  const hooks = {
    state,
    /** The app clock (nowMs, today, wall). */
    clock,
    /** Emulator: signs in to the Auth emulator. Demo: acts as `uid`. Resolves once the phase settled. */
    async signIn(uid: string, name: string): Promise<void> {
      await session.whenBooted();
      const repo = session.repo;
      if (hasTestSignIn(repo)) await repo.signInWithTestCredential(uid, name);
      else if (isDemoRepository(repo)) repo.actAs(uid);
      else throw new Error('__homecareTest.signIn: no repository (setup mode)');
      await until(() => session.user?.uid === uid, `user ${uid}`);
    },
    /** Demo: become another member (michal, dani, or any uid). */
    async actAs(uid: string): Promise<void> {
      (await demoRepo()).actAs(uid);
      await until(() => session.user?.uid === uid, `user ${uid}`);
    },
    /** Demo: back to a fresh seed (signed in as מיכל). */
    async resetDemo(): Promise<void> {
      await (await demoRepo()).resetDemo();
      await session.settled();
    },
    /** Demo: write pending changes to IndexedDB now (before a reload). */
    async flush(): Promise<void> {
      await (await demoRepo()).flush();
    }
  };
  (window as Window & { __homecareTest?: typeof hooks }).__homecareTest = hooks;
}

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing from index.html');

export default mount(App, { target });
