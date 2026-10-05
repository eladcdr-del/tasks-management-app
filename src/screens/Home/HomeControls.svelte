<script lang="ts">
  // Home's control bar (feature "home"): the time tabs "היום · השבוע · בהמשך · הכל" with their
  // counts, and the chips "הכל · שלי · פנויות · <every other member>". It sticks under the top of
  // the screen while the list scrolls under it; once stuck it gets a hairline and a soft shadow.
  // The chips keep to one line and scroll sideways when a big family does not fit.
  // At the end of the chips row, a quiet "בחירה" starts choosing several tasks; while choosing, the
  // tabs row turns into "ביטול · נבחרו 3 · בחירת הכל" (same height, so the list does not jump) and
  // the chips stay usable (a chip that hides a chosen task lets it go).
  import { untrack } from 'svelte';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import X from '@lucide/svelte/icons/x';
  import { Chip, MemberChip, SegmentedControl } from '$components/ui';
  import type { Member } from '$lib/domain/types';
  import type { HomeTab, HomeWho } from '$lib/domain/homeList';
  import { he } from '$lib/i18n/he';

  interface Props {
    tabs: { value: HomeTab; label: string; count: number }[];
    tab: HomeTab;
    who: HomeWho;
    /** The other members (a chip each). */
    others: readonly Member[];
    /** The user picked a tab or a chip. */
    onpick: (view: { tab: HomeTab; who: HomeWho }) => void;
    /** Reports whether the bar is stuck to the top. */
    stuck?: boolean;
    /** Reports the bar's height (what it covers once stuck). */
    height?: number;
    /** Choosing several tasks: off (undefined) hides "בחירה" (nothing to choose). */
    select?: {
      active: boolean;
      count: number;
      /** Every task of the visible list is chosen ("בחירת הכל" turns into "ניקוי הבחירה"). */
      all: boolean;
      onstart: () => void;
      onall: () => void;
      oncancel: () => void;
    };
  }

  let {
    tabs,
    tab,
    who,
    others,
    onpick,
    stuck = $bindable(false),
    height = $bindable(0),
    select
  }: Props = $props();
  const selecting = $derived(select?.active ?? false);
  const t = he.home;

  let sentinel: HTMLElement | undefined = $state();
  let chipsEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) stuck = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  // Keep the selected chip in sight when the row scrolls sideways (a member far along the row).
  // Only the row scrolls: scrollIntoView would move the page too.
  $effect(() => {
    void who;
    untrack(() => {
      const row = chipsEl;
      const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!row || !chip) return;
      const r = row.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      const pad = 20;
      if (c.left < r.left + pad) row.scrollLeft -= r.left + pad - c.left;
      else if (c.right > r.right - pad) row.scrollLeft += c.right - (r.right - pad);
    });
  });

  const pickTab = (value: HomeTab) => onpick({ tab: value, who });
  const pickWho = (value: HomeWho) => {
    if (value !== who) onpick({ tab, who: value });
  };
</script>

<div class="sentinel" bind:this={sentinel} aria-hidden="true"></div>
<div
  class={['controls', { stuck }]}
  data-home-controls
  data-stuck={stuck ? '' : undefined}
  bind:offsetHeight={height}
>
  {#if select && selecting}
    <div class="select-head" data-select-head>
      <button type="button" class="head-btn cancel" data-select-cancel onclick={select.oncancel}>
        <X size={18} strokeWidth={2} aria-hidden="true" />{t.select.cancel}
      </button>
      <p class="select-count" role="status" data-select-count>
        {select.count === 0 ? t.select.none : t.select.count(select.count)}
      </p>
      <button type="button" class="head-btn all" data-select-all onclick={select.onall}>
        {select.all ? t.select.clear : t.select.all}
      </button>
    </div>
  {:else}
    <SegmentedControl
      options={tabs}
      value={tab}
      onchange={pickTab}
      label={t.buckets.label}
      haptics
      fit
    />
  {/if}
  <div class="chips-row">
    <div class="chips" role="group" aria-label={t.filters.label} bind:this={chipsEl}>
      <Chip label={t.filters.all} selected={who === 'all'} onclick={() => pickWho('all')} />
      <Chip label={t.filters.mine} selected={who === 'mine'} onclick={() => pickWho('mine')} />
      <Chip
        label={t.filters.free}
        selected={who === 'free'}
        onclick={() => pickWho('free')}
        data-chip="free"
      />
      {#each others as m (m.uid)}
        <MemberChip
          person={m}
          prefix={t.filters.ofPrefix}
          selected={who === m.uid}
          onclick={() => pickWho(m.uid)}
        />
      {/each}
    </div>
    {#if select && !selecting}
      <button type="button" class="start" data-select-start onclick={select.onstart}>
        <ListChecks size={17} strokeWidth={1.9} aria-hidden="true" />{t.select.start}
      </button>
    {/if}
  </div>
</div>

<style>
  .sentinel {
    block-size: 0;
  }

  .controls {
    position: sticky;
    inset-block-start: 0;
    z-index: 3;
    display: grid;
    gap: var(--s1);
    margin-inline: calc(var(--screen-pad) * -1);
    padding-block: calc(var(--safe-top) + var(--s2)) var(--s1);
    padding-inline: var(--screen-pad);
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
    transition: box-shadow var(--d-base) var(--ease-out);
  }

  .stuck {
    box-shadow:
      0 1px 0 var(--line),
      var(--sh-1);
  }

  /* min-inline-size: 0, so a long row of chips scrolls instead of widening the page. */
  .chips-row {
    display: flex;
    align-items: center;
    min-inline-size: 0;
    margin-inline: calc(var(--screen-pad) * -1);
  }

  .chips {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    gap: var(--s1-5);
    padding-inline: var(--screen-pad);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(
      to left,
      transparent 0,
      black var(--screen-pad),
      black calc(100% - var(--screen-pad)),
      transparent 100%
    );
    mask-image: linear-gradient(
      to left,
      transparent 0,
      black var(--screen-pad),
      black calc(100% - var(--screen-pad)),
      transparent 100%
    );
  }

  .chips::-webkit-scrollbar {
    display: none;
  }

  .chips > :global(*) {
    flex: none;
  }

  .chips :global(.chip) {
    --chip-h: 34px;
  }

  /* "בחירה": quiet, after the chips, never scrolled away with them. */
  .start {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    block-size: 34px;
    margin-inline: var(--s1) var(--screen-pad);
    padding-inline: var(--s2-5) var(--s3);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    font: var(--font-caption);
    font-weight: 600;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .start::after {
    content: '';
    position: absolute;
    inset: -5px -4px;
  }

  .start:active {
    background: var(--surface-2);
  }

  .start:focus-visible,
  .head-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ── While choosing: the tabs row turns into the selection's own row ── */
  .select-head {
    display: flex;
    align-items: center;
    gap: var(--s2);
    min-block-size: 44px;
    animation: head-in var(--d-base) var(--ease-out);
  }

  .select-count {
    flex: 1;
    min-inline-size: 0;
    font: var(--font-headline);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    text-align: center;
  }

  .head-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    min-block-size: var(--tap-min);
    padding-inline: var(--s2);
    border: 0;
    border-radius: var(--r-control-sm);
    background: transparent;
    font: var(--font-callout);
    font-weight: 600;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }

  .head-btn:active {
    background: var(--surface-2);
  }

  .cancel {
    margin-inline-start: calc(var(--s2) * -1);
    color: var(--ink);
  }

  .all {
    margin-inline-end: calc(var(--s2) * -1);
    color: var(--accent-ink);
  }

  @keyframes head-in {
    from {
      opacity: 0;
      translate: 0 -4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .select-head {
      animation: none;
    }
  }
</style>
