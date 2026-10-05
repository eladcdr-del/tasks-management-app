<script lang="ts">
  // TaskList (step 3.2): a keyed list of TaskCards that re-orders with animate:flip and lets cards
  // leave with a short fade (a taken task leaving "פנויות", a snoozed one leaving "today").
  // Reduced motion: no flip, crossfades capped at 120ms.
  //
  // variant "card": separate raised cards. variant "row": compact rows on one raised surface with
  // inset hairlines between them (Home's lists), and an optional `footer` on that surface (a
  // "עוד N" toggle). `selection` reaches every card (choosing several at once, Home).
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import type { Task } from '$lib/domain/types';
  import { dur, easeOut, reducedMotion } from '$lib/platform/motion';
  import TaskCard from './TaskCard.svelte';
  import type { RowSelection } from './selection';

  interface Props {
    tasks: readonly Task[];
    /** Accessible name of the list (or use `labelledby`). */
    label?: string;
    /** id of the heading that names the list. */
    labelledby?: string;
    variant?: 'card' | 'row';
    /** Which cards are de-emphasised (variant card). */
    muted?: (task: Task) => boolean;
    /** Buttons under a card's meta row, or nothing. */
    actions?: Snippet<[Task]>;
    /** Which cards get `actions` (default: all of them). */
    withActions?: (task: Task) => boolean;
    /** Replaces the avatar (Home's seat), or nothing. */
    trailing?: Snippet<[Task]>;
    /** Which cards get `trailing` (default: all of them). */
    withTrailing?: (task: Task) => boolean;
    /** Category badges on the cards (default on). */
    showCategory?: boolean;
    /** Under the rows, on the same surface (variant row). */
    footer?: Snippet;
    /** Choosing several tasks at once (Home). */
    selection?: RowSelection;
    id?: string;
    class?: string;
  }

  let {
    tasks,
    label,
    labelledby,
    variant = 'card',
    muted,
    actions,
    withActions,
    trailing,
    withTrailing,
    showCategory = true,
    footer,
    selection,
    id,
    class: className
  }: Props = $props();
</script>

{#if variant === 'row'}
  <div class={['surface', className]}>
    {@render items()}
    {@render footer?.()}
  </div>
{:else}
  {@render items()}
{/if}

{#snippet items()}
  <ul
    class={['list', { row: variant === 'row' }, variant === 'card' && className]}
    {id}
    aria-label={labelledby ? undefined : label}
    aria-labelledby={labelledby}
  >
    {#each tasks as task (task.id)}
      {@const act = actions && (withActions?.(task) ?? true)}
      {@const trail = trailing && (withTrailing?.(task) ?? true)}
      <li
        animate:flip={{ duration: reducedMotion.current ? 0 : 320, easing: easeOut }}
        transition:fade|local={{ duration: dur(180) }}
      >
        <TaskCard
          {task}
          {variant}
          {showCategory}
          muted={muted?.(task) ?? false}
          actions={act ? actions : undefined}
          trailing={trail ? trailing : undefined}
          {selection}
        />
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .surface {
    overflow: hidden;
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  .row {
    gap: 0;
  }

  .row > li {
    position: relative;
  }

  /* Hairline between rows, inset to the text column (it starts after the completion circle). */
  .row > li + li::before {
    content: '';
    position: absolute;
    z-index: 2;
    inset-block-start: 0;
    inset-inline: 50px 0;
    border-block-start: 1px solid var(--line);
    pointer-events: none;
  }
</style>
