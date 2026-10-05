<script lang="ts">
  // Home's control bar (feature "home"): the time tabs "היום · השבוע · בהמשך · הכל" with their
  // counts, and the chips "הכל · שלי · פנויות · <every other member>". It sticks under the top of
  // the screen while the list scrolls under it; once stuck it gets a hairline and a soft shadow.
  // The chips keep to one line and scroll sideways when a big family does not fit.
  import { untrack } from 'svelte';
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
  }

  let {
    tabs,
    tab,
    who,
    others,
    onpick,
    stuck = $bindable(false),
    height = $bindable(0)
  }: Props = $props();
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
  <SegmentedControl
    options={tabs}
    value={tab}
    onchange={pickTab}
    label={t.buckets.label}
    haptics
    fit
  />
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

  .chips {
    display: flex;
    gap: var(--s1-5);
    margin-inline: calc(var(--screen-pad) * -1);
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
</style>
