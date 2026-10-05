<script lang="ts">
  // Pulse card (Home, step 3.2): three large tappable numerals that answer "what needs me?" at a
  // glance, a "ביקשו ממך N" row while someone asked me for something (tap → that list), and a quiet
  // balance row (open tasks per member: counts only, never advice).
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import { Card, MemberChip } from '$components/ui';
  import type { Member } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';

  type Key = 'attention' | 'today' | 'waiting';

  interface Props {
    pulse: Record<Key | 'requested', number>;
    members: readonly Member[];
    counts: Readonly<Record<string, number>>;
    onpick: (key: Key | 'requested') => void;
  }

  let { pulse, members, counts, onpick }: Props = $props();
  const t = he.home.pulse;
  const stats: { key: Key; label: string }[] = [
    { key: 'attention', label: t.attention },
    { key: 'today', label: t.today },
    { key: 'waiting', label: t.waiting }
  ];
</script>

<Card padding="none" class="pulse">
  <section aria-label={t.label}>
    <div class="stats">
      {#each stats as s (s.key)}
        {@const n = pulse[s.key]}
        <button
          type="button"
          class={['stat', s.key, { zero: n === 0 }]}
          aria-label={t.go(n, s.label)}
          onclick={() => onpick(s.key)}
        >
          <span class="n num" data-pulse={s.key}>{n}</span>
          <span class="l" aria-hidden="true">{s.label}</span>
        </button>
      {/each}
    </div>
    {#if pulse.requested > 0}
      <button
        type="button"
        class="requested"
        aria-label={t.go(pulse.requested, t.requested)}
        onclick={() => onpick('requested')}
      >
        <HandHelping strokeWidth={1.75} aria-hidden="true" />
        <span class="rl" aria-hidden="true">{t.requested}</span>
        <span class="rn num" data-pulse="requested" aria-hidden="true">{pulse.requested}</span>
        <ChevronLeft aria-hidden="true" />
      </button>
    {/if}
    {#if members.length > 0}
      <div class="balance" aria-label={he.home.balance.label} role="group">
        {#each members as m, i (m.uid)}
          {#if i > 0}<span class="sep" aria-hidden="true">·</span>{/if}
          <MemberChip person={m} count={counts[m.uid] ?? 0} />
        {/each}
      </div>
    {/if}
  </section>
</Card>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: var(--s2);
  }

  .stat {
    position: relative;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 2px;
    min-block-size: 92px;
    padding: var(--s3) var(--s3) var(--s2);
    border-radius: var(--r-md);
    text-align: start;
    transition: background-color var(--d-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }

  .stat + .stat::before {
    content: '';
    position: absolute;
    inset-block: var(--s4);
    inset-inline-start: 0;
    border-inline-start: 1px solid var(--line);
  }

  .stat:active {
    background: var(--surface-2);
  }

  .stat:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .n {
    font: var(--font-numeral);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .attention:not(.zero) .n {
    color: var(--danger);
  }

  .zero .n {
    color: var(--ink-3);
  }

  .l {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
    text-wrap: balance;
  }

  .requested {
    display: flex;
    align-items: center;
    gap: var(--s2);
    inline-size: 100%;
    min-block-size: var(--tap-min);
    padding: var(--s2) var(--s4);
    border-block-start: 1px solid var(--line);
    color: var(--accent-ink);
    font: var(--font-callout);
    font-weight: 500;
    text-align: start;
    transition: background-color var(--d-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }

  .requested:active {
    background: var(--surface-2);
  }

  .requested:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .requested :global(svg) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .rl {
    flex: 1;
  }

  .rn {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .balance {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s2);
    padding: var(--s3) var(--s4) var(--s4);
    border-block-start: 1px solid var(--line);
  }

  .sep {
    color: var(--ink-3);
  }
</style>
