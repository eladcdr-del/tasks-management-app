<script lang="ts">
  /*
   * Snackbar: one short message with an optional action ("בוצע · ביטול"). The only transient
   * feedback in the app (no toasts).
   *   - Auto-dismisses after `duration` (5s). The countdown pauses while a finger is on it, while
   *     hovered, and while focus is inside; it resumes with the time that was left (≥ 1.5s).
   *   - Presentation only: it does not position itself and has no live region. SnackbarHost (3.1)
   *     owns the queue, places it above the nav, and wraps it in `role="status" aria-live="polite"`.
   *     Key it by message id (`{#key snack.id}`) so a new message restarts the timer.
   *
   *   {#if snack}<Snackbar message="בוצע" actionLabel={he.common.undo} onAction={undo}
   *                        onDismiss={() => (snack = null)} />{/if}
   */
  import { fly, fade } from 'svelte/transition';
  import type { IconComponent } from './types';
  import { dur, easeOut, reducedMotion } from '$lib/platform/motion';

  type Reason = 'timeout' | 'action';

  interface Props {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    /** Called once, on timeout or after the action ran. Remove the snackbar in response. */
    onDismiss: (reason: Reason) => void;
    /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
    duration?: number;
    icon?: IconComponent;
    class?: string;
  }

  let {
    message,
    actionLabel,
    onAction,
    onDismiss,
    duration = 5000,
    icon: Icon,
    class: className
  }: Props = $props();

  const MIN_RESUME = 1500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = 0;
  let startedAt = 0;
  let holds = new Set<string>();
  let done = false;

  function finish(reason: Reason) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onDismiss(reason);
  }

  function run() {
    if (duration <= 0 || done) return;
    clearTimeout(timer);
    startedAt = performance.now();
    timer = setTimeout(() => finish('timeout'), remaining);
  }

  function hold(why: string) {
    if (holds.size === 0 && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
    }
    holds.add(why);
  }

  function release(why: string) {
    if (!holds.delete(why) || holds.size > 0) return;
    remaining = Math.max(remaining, MIN_RESUME);
    run();
  }

  $effect(() => {
    remaining = duration;
    holds = new Set();
    run();
    return () => clearTimeout(timer);
  });

  function act() {
    onAction?.();
    finish('action');
  }
</script>

<div
  class={['snackbar', className]}
  role="group"
  in:fly|global={{ y: reducedMotion.current ? 0 : 16, duration: dur(240), easing: easeOut }}
  out:fade|global={{ duration: dur(160) }}
  onpointerdown={(e) => e.pointerType !== 'mouse' && hold('touch')}
  onpointerup={() => release('touch')}
  onpointercancel={() => release('touch')}
  onpointerenter={(e) => e.pointerType === 'mouse' && hold('hover')}
  onpointerleave={(e) => {
    release('touch');
    if (e.pointerType === 'mouse') release('hover');
  }}
  onfocusin={() => hold('focus')}
  onfocusout={(e) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !e.currentTarget.contains(next)) release('focus');
  }}
>
  {#if Icon}
    <span class="icon"><Icon size={18} strokeWidth={2} aria-hidden="true" /></span>
  {/if}
  <span class="message">{message}</span>
  {#if actionLabel}
    <button type="button" class="action" onclick={act}>{actionLabel}</button>
  {/if}
</div>

<style>
  .snackbar {
    /* Inverse surface (no token yet → light-dark() fallback; see 1.4 REPORT). */
    --sb-bg: light-dark(#2b2420, #3a2f29);
    --sb-fg: light-dark(#fbf6ef, #f4ece3);
    --sb-action: light-dark(#f0a27c, #f0a27c);
    --sb-icon: light-dark(#b5ccb2, #b5ccb2);
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    max-inline-size: calc(var(--content-max) - var(--s7));
    min-block-size: 52px;
    margin-inline: auto;
    padding-block: var(--s1);
    padding-inline: var(--s4) var(--s1);
    border-radius: var(--r-md);
    background: var(--sb-bg);
    color: var(--sb-fg);
    box-shadow:
      0 8px 28px rgb(43 36 32 / 0.22),
      0 2px 6px rgb(43 36 32 / 0.12);
    border: 1px solid light-dark(transparent, #4a3e36);
    pointer-events: auto;
    touch-action: manipulation;
  }

  .icon {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--sb-icon) 18%, transparent);
    color: var(--sb-icon);
  }

  .message {
    flex: 1;
    min-inline-size: 0;
    padding-block: var(--s2);
    font: var(--font-callout);
    font-weight: 500;
  }

  .snackbar:not(:has(.action)) {
    padding-inline-end: var(--s4);
  }

  .action {
    flex: none;
    min-block-size: var(--tap-min);
    min-inline-size: var(--tap-min);
    padding-inline: var(--s3);
    border-radius: 12px;
    color: var(--sb-action);
    font: var(--font-callout);
    font-weight: 600;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .action:active,
  .action:hover {
    background: color-mix(in srgb, var(--sb-action) 14%, transparent);
  }

  .action:focus-visible {
    outline: 2px solid var(--sb-action);
    outline-offset: -2px;
  }
</style>
