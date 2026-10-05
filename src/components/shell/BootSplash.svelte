<script module lang="ts">
  /** After this long on the splash, a gentle line and a retry appear (a stalled connection). */
  export const SLOW_BOOT_MS = 8_000;
</script>

<script lang="ts">
  // The splash App.svelte shows while the first screen is being decided: the brand mark on cream,
  // no text. A boot error shows its message and a retry at once; a start that takes longer than
  // SLOW_BOOT_MS (e.g. a connection that hangs instead of failing) shows a calm hint and the same
  // retry, so the screen is never silent for long.
  import AppMark from '$components/illustrations/AppMark.svelte';
  import { he } from '$lib/i18n/he';

  interface Props {
    /** data-phase, for tests and styling hooks. */
    phase: string;
    /** The boot failed (session.error). */
    failed?: boolean;
    /** Default: reload the page. */
    onRetry?: () => void;
  }

  let { phase, failed = false, onRetry = () => location.reload() }: Props = $props();

  let slow = $state(false);
  $effect(() => {
    const timer = setTimeout(() => (slow = true), SLOW_BOOT_MS);
    return () => clearTimeout(timer);
  });

  const message = $derived(failed ? he.errors.generic : slow ? he.shell.slowStart : null);
</script>

<div class="splash" data-phase={phase}>
  <AppMark size={88} tile />
  {#if message}
    <div class="boot-note" role={failed ? 'alert' : 'status'} data-boot-note>
      <p>{message}</p>
      <button type="button" onclick={onRetry}>{he.common.retry}</button>
    </div>
  {/if}
</div>

<style>
  .splash {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s6);
    min-block-size: 100dvh;
    padding: var(--safe-top) var(--screen-pad) var(--safe-bottom);
    background: var(--bg);
  }

  .boot-note {
    display: grid;
    justify-items: center;
    gap: var(--s3);
    max-inline-size: 22rem;
    text-align: center;
  }

  .boot-note p {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .boot-note button {
    min-block-size: var(--tap-min);
    padding-inline: var(--s5);
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    font: var(--font-callout);
    font-weight: 600;
  }
</style>
