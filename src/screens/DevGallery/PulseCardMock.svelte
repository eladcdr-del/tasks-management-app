<script lang="ts">
  // MOCK Pulse card (Home, step 3.2): three large tappable numerals + a quiet balance row.
  import Card from '$components/ui/Card.svelte';
  import MemberChip from '$components/ui/MemberChip.svelte';
  import type { AvatarPerson } from '$components/ui/types';
  import { he } from '$lib/i18n/he';

  interface Props {
    me: AvatarPerson;
    partner: AvatarPerson;
  }

  let { me, partner }: Props = $props();
  const t = he.dev.gallery.demo;
</script>

<Card padding="none" class="pulse">
  <div class="stats">
    <button type="button" class="stat danger">
      <span class="n num">2</span><span class="l">{t.pulseOverdue}</span>
    </button>
    <button type="button" class="stat">
      <span class="n num">4</span><span class="l">{t.pulseToday}</span>
    </button>
    <button type="button" class="stat">
      <span class="n num">3</span><span class="l">{t.pulseWaiting}</span>
    </button>
  </div>
  <div class="balance">
    <MemberChip person={me} count={5} />
    <MemberChip person={partner} count={4} />
  </div>
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
    min-block-size: 88px;
    padding: var(--s3);
    border-radius: var(--r-md);
    text-align: start;
    transition: background-color var(--d-fast) var(--ease-out);
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
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .n {
    font: var(--font-numeral);
    color: var(--ink);
  }

  .danger .n {
    color: var(--danger);
  }

  .l {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
    text-wrap: balance;
  }

  .balance {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
    padding: var(--s3) var(--s4) var(--s4);
    border-block-start: 1px solid var(--line);
  }
</style>
