<script lang="ts">
  // SyncIndicator: a dot + a short Hebrew label: "הכל שמור" (sage) · "שומר…" (accent, breathing)
  // · "אין רשת" (hollow, with the pending count). Feed it SyncState from the repository.
  //   <SyncIndicator status={sync.status} pending={sync.pendingWrites} />
  //
  // - Not a live region by default: a page can show several indicators, and each `role="status"`
  //   would chatter on every save. Exactly one instance (the app header) passes `announce`.
  // - With a large system font (≥ 130%) the pill falls back to the compact dot; the label stays
  //   available to screen readers. `compact` forces the dot at any size.
  import type { SyncState } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';

  interface Props {
    status: SyncState['status'];
    pending?: number;
    /** Dot only; the label stays available to screen readers. */
    compact?: boolean;
    /** Make this instance the polite live region for sync changes (one per screen). */
    announce?: boolean;
    class?: string;
  }

  let {
    status,
    pending = 0,
    compact = false,
    announce = false,
    class: className
  }: Props = $props();

  /** Caption is 13px at 100%; 1.3× that means the reader enlarged the text. */
  const LARGE_TEXT_PX = 13 * 1.3;

  let el: HTMLSpanElement | undefined = $state();
  let largeText = $state(false);

  // Font-size changes resize the pill, so a ResizeObserver catches the system text size changing.
  // The test reads the font size (not the width), so compacting cannot flip it back.
  $effect(() => {
    const node = el;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const check = () => (largeText = parseFloat(getComputedStyle(node).fontSize) >= LARGE_TEXT_PX);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(node);
    return () => ro.disconnect();
  });

  const dot = $derived(compact || largeText);
  const text = $derived(
    status === 'synced'
      ? he.ui.sync.synced
      : status === 'saving'
        ? he.ui.sync.saving
        : he.ui.sync.offline
  );
  const detail = $derived(
    status === 'offline' && pending > 0 ? he.ui.sync.pending(pending) : ''
  );
</script>

<span
  bind:this={el}
  class={['sync', status, { compact: dot }, className]}
  role={announce ? 'status' : undefined}
>
  <span class="dot" aria-hidden="true"></span>
  <span class={['label', { 'visually-hidden': dot }]}>
    {text}{#if detail}<span class="detail">{' · '}{detail}</span>{/if}
  </span>
</span>

<style>
  .sync {
    --dot: var(--sage);
    display: inline-flex;
    align-items: center;
    gap: var(--s1-5);
    min-block-size: 28px;
    max-inline-size: 100%;
    padding-block: 0.2em;
    padding-inline: var(--s2-5) var(--s3);
    border-radius: var(--r-pill);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-pressed);
    color: var(--ink-2);
    font: var(--font-caption);
    white-space: nowrap;
  }

  .compact {
    justify-content: center;
    min-inline-size: 28px;
    padding-inline: var(--s2-5);
  }

  .dot {
    position: relative;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-pill);
    background: var(--dot);
    flex: none;
  }

  .saving {
    --dot: var(--accent);
  }

  .saving .dot::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: inherit;
    background: var(--dot);
    opacity: 0.35;
    animation: breathe 1.4s var(--ease-out) infinite;
  }

  .offline {
    --dot: transparent;
    color: var(--ink);
  }

  .offline .dot {
    box-shadow: inset 0 0 0 1.75px var(--ink-2);
  }

  .detail {
    color: var(--ink-2);
  }

  @keyframes breathe {
    0% {
      transform: scale(0.6);
      opacity: 0.5;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .saving .dot::after {
      animation: none;
      opacity: 0;
    }
  }
</style>
