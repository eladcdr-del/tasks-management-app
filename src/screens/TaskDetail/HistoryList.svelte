<script lang="ts">
  // owner: step 3.3. The "היסטוריה" timeline: who created, asked, took, snoozed, finished.
  import type { HistoryItem } from './history';
  import { eventTime } from './history';
  import type { Member } from '$lib/domain/types';

  interface Props {
    items: HistoryItem[];
    today: string;
    memberById: (uid: string) => Member | null;
  }

  let { items, today, memberById }: Props = $props();
</script>

<ol class="timeline">
  {#each items as item (item.id)}
    {@const m = memberById(item.actorId)}
    <li data-event={item.type}>
      <span class="dot" data-member-color={m?.color} aria-hidden="true"></span>
      <span class="text">{item.text}</span>
      <time class="when" datetime={new Date(item.at).toISOString()}
        >{eventTime(item.at, today)}</time
      >
    </li>
  {/each}
</ol>

<style>
  .timeline {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--s3);
    padding-block: var(--s2);
  }

  li:not(:last-child)::before {
    content: '';
    position: absolute;
    inset-inline-start: 5px;
    inset-block: calc(var(--s2) + 16px) calc(var(--s2) * -1 + 4px);
    inline-size: 2px;
    border-radius: 2px;
    background: var(--line);
  }

  .dot {
    grid-row: span 2;
    margin-block-start: 6px;
    inline-size: 12px;
    block-size: 12px;
    border-radius: var(--r-pill);
    background: var(--m-base, var(--ink-3));
    box-shadow: 0 0 0 3px var(--surface);
  }

  .text {
    font: var(--font-callout);
    color: var(--ink);
  }

  .when {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }
</style>
