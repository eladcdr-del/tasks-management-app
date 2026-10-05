// Task actions shared by the cards and sheets (step 3.2). The stores do the writing; this module
// adds the human feedback around them (haptics, a snackbar naming who was faster).
import { router } from '$lib/router/router.svelte';
import { tasks } from '$lib/state/tasks.svelte';
import { household } from '$lib/state/household.svelte';
import { ui } from '$lib/state/ui.svelte';
import { haptic } from '$lib/platform/haptics';
import { he } from '$lib/i18n/he';
import type { TakeResult } from '$lib/data/repository';

/**
 * "אני לוקח/ת". Haptic at the tap (user activation), then the transaction. When someone else was
 * faster (TakeResult ok: false) the snackbar names them in their own form: "דני כבר לקח את המשימה".
 */
export async function takeTask(id: string): Promise<TakeResult | null> {
  haptic('take');
  const result = await tasks.take(id);
  if (!result) return null;
  if (result.ok) {
    ui.show(he.taskCard.taken);
  } else {
    const who = household.memberById(result.takenBy);
    ui.show(who ? he.taskCard.takenBy(who) : he.taskCard.takenBySomeone);
    haptic('warn');
  }
  return result;
}

/**
 * "אני לוקח/ת" on a request to me: the task becomes mine and the asker hears about it. The same
 * answers as a take (someone may have been faster).
 */
export async function acceptRequest(id: string): Promise<TakeResult | null> {
  haptic('take');
  const result = await tasks.accept(id);
  if (!result) return null;
  if (result.ok) {
    ui.show(he.taskCard.taken);
  } else {
    const who = household.memberById(result.takenBy);
    ui.show(who ? he.taskCard.takenBy(who) : he.taskCard.takenBySomeone);
    haptic('warn');
  }
  return result;
}

/** "לא מתאים לי": no blame, no suggestion; the task simply waits for anyone. */
export function declineRequest(id: string): void {
  haptic('select');
  tasks.decline(id);
  ui.show(he.taskCard.declined);
}

export const openComplete = (taskId: string): void =>
  router.openSheet({ name: 'complete', taskId });
export const openSnooze = (taskId: string): void => router.openSheet({ name: 'snooze', taskId });
export const openRequest = (taskId: string): void => router.openSheet({ name: 'request', taskId });

// E2E builds: lets the realtime spec drive a take on a card that another member already took (a
// stale tap cannot be staged deterministically through live listeners). Dropped from production.
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  (globalThis as unknown as { __homecareTaskActions?: unknown }).__homecareTaskActions = {
    takeTask
  };
}
