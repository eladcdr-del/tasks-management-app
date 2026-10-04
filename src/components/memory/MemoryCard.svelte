<script lang="ts">
  // owner: step 3.3 (Memory). One remembered task: what, who did it (avatar), when, how much, where,
  // the note's first line and a photo thumb. The whole card opens the task detail.
  import Wallet from '@lucide/svelte/icons/wallet';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import type { Task } from '$lib/domain/types';
  import { Avatar, CategoryIcon, ICON_STROKE } from '$components/ui';
  import PhotoThumb from './PhotoThumb.svelte';
  import { formatCurrency, formatDate } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { href } from '$lib/router/routes';
  import { household } from '$lib/state/household.svelte';

  interface Props {
    task: Task;
    today: string;
  }

  let { task, today }: Props = $props();

  const by = $derived(household.memberById(task.completedBy));
  const c = $derived(task.completion);
  const date = $derived(task.completedAt ? formatDate(task.completedAt, { today }) : '');
  const firstPhoto = $derived(c?.photoIds[0] ?? null);
</script>

<a class="card" href={href('task', { id: task.id })} data-testid="memory-card" data-task-id={task.id}>
  <span class="cat" aria-hidden="true">
    {#if task.categoryId}<CategoryIcon id={task.categoryId} />{:else}<CategoryIcon id="other" />{/if}
  </span>
  <span class="main">
    <span class="title" dir={textDir(task.title)}>{task.title}</span>
    <span class="who">
      {#if by}
        <Avatar name={by.displayName} photoURL={by.photoURL} color={by.color} size="xs" ring={false} decorative />
      {/if}
      <span>{he.memory.doneBy(by?.displayName ?? he.taskDetail.someone, date)}</span>
    </span>
    {#if c && (c.cost !== null || c.place)}
      <span class="facts">
        {#if c.cost !== null}
          <span class="fact cost"><Wallet strokeWidth={ICON_STROKE} aria-hidden="true" /><span class="num">{formatCurrency(c.cost)}</span></span>
        {/if}
        {#if c.place}
          <span class="fact place"><MapPin strokeWidth={ICON_STROKE} aria-hidden="true" /><span dir={textDir(c.place)}>{c.place}</span></span>
        {/if}
      </span>
    {/if}
    {#if c?.note}
      <span class="note" dir={textDir(c.note)}>{c.note}</span>
    {/if}
  </span>
  {#if firstPhoto}
    <PhotoThumb photoId={firstPhoto} label={he.memory.photo} size={60} interactive={false} />
  {/if}
</a>

<style>
  .card {
    display: flex;
    align-items: flex-start;
    gap: var(--s3);
    padding: var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--sh-1);
    border: var(--edge);
    color: inherit;
    text-decoration: none;
    transition:
      transform var(--d-fast) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out);
  }

  .card:active {
    transform: scale(0.99);
  }

  .card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .cat {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .main {
    display: grid;
    gap: var(--s1);
    flex: 1;
    min-inline-size: 0;
  }

  .title {
    font: var(--font-body);
    font-weight: 600;
    color: var(--ink);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .who {
    display: flex;
    align-items: center;
    gap: var(--s1-5);
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s3);
    margin-block-start: var(--s0-5);
  }

  .fact {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    min-inline-size: 0;
    font: var(--font-caption);
    color: var(--ink);
  }

  .fact :global(svg) {
    flex: none;
    inline-size: var(--icon-xs);
    block-size: var(--icon-xs);
    color: var(--ink-2);
  }

  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .note {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
