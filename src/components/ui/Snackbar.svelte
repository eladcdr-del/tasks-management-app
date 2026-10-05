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
  import { ICON_STROKE } from './types';
  import { textDir } from '$lib/i18n/textDir';
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
    /** The message contains user-entered text (a task title): direction via textDir(). */
    userText?: boolean;
    class?: string;
  }

  let {
    message,
    actionLabel,
    onAction,
    onDismiss,
    duration = 5000,
    icon: Icon,
    userText = false,
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

  // `done` first: once dismissed, the host may already have dropped the message the props read
  // from, while the outro still delivers pointer / focus events (and a second tap) to this element.
  function run() {
    if (done || duration <= 0) return;
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
    if (done) return;
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
    <span class="icon"><Icon strokeWidth={ICON_STROKE} aria-hidden="true" class="sb-icon" /></span>
  {/if}
  <span class="message" dir={userText ? textDir(message) : undefined}>{message}</span>
  {#if actionLabel}
    <button type="button" class="action" onclick={act}>{actionLabel}</button>
  {/if}
</div>

<style>
  .snackbar {
    /* Truly inverse in both themes: dark on the light app, light on the dark app. */
    --sb-bg: var(--inverse-surface);
    --sb-fg: var(--inverse-ink);
    --sb-action: var(--inverse-accent);
    --sb-icon: var(--inverse-success);
    /* The page's focus ring disappears on an inverse surface; use the inverse accent here. */
    --focus-ring: var(--inverse-accent);
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
    box-shadow: var(--sh-inverse);
    border: 1px solid var(--inverse-edge);
    pointer-events: auto;
    touch-action: manipulation;
  }

  .icon {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 1.75em;
    block-size: 1.75em;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--sb-icon) 18%, transparent);
    color: var(--sb-icon);
  }

  .icon :global(.sb-icon) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
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
    border-radius: var(--r-control-sm);
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
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
</style>
