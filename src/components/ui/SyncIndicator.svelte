<script lang="ts">
  // SyncIndicator: a dot + a short Hebrew label: "הכל שמור" (sage) · "שומר…" (accent, breathing)
  // · "אין רשת" (hollow, with the pending count). Feed it SyncState from the repository.
  //   <SyncIndicator status={sync.status} pending={sync.pendingWrites} />
  import type { SyncState } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';

  interface Props {
    status: SyncState['status'];
    pending?: number;
    /** Dot only; the label stays available to screen readers. */
    compact?: boolean;
    class?: string;
  }

  let { status, pending = 0, compact = false, class: className }: Props = $props();

  const text = $derived(
    status === 'synced'
      ? he.dev.ui.sync.synced
      : status === 'saving'
        ? he.dev.ui.sync.saving
        : he.dev.ui.sync.offline
  );
  const detail = $derived(
    status === 'offline' && pending > 0 ? he.dev.ui.sync.pending(pending) : ''
  );
</script>

<span class={['sync', status, { compact }, className]} role="status">
  <span class="dot" aria-hidden="true"></span>
  <span class={['label', { 'visually-hidden': compact }]}>
    {text}{#if detail}<span class="detail">{' · '}{detail}</span>{/if}
  </span>
</span>

<style>
  .sync {
    --dot: var(--sage);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    block-size: 28px;
    padding-inline: 10px 12px;
    border-radius: var(--r-pill);
    background: var(--surface);
    border: var(--edge);
    box-shadow: 0 1px 2px rgb(74 44 24 / 0.06);
    color: var(--ink-2);
    font: var(--font-caption);
    white-space: nowrap;
  }

  .compact {
    padding-inline: 10px;
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
