<script lang="ts">
  // TaskList (step 3.2): a keyed list of TaskCards that re-orders with animate:flip and lets cards
  // leave with a short fade (a taken task leaving "waiting", a snoozed one leaving "today").
  // Reduced motion: no flip, crossfades capped at 120ms.
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import type { Task } from '$lib/domain/types';
  import { dur, easeOut, reducedMotion } from '$lib/platform/motion';
  import TaskCard from './TaskCard.svelte';

  interface Props {
    tasks: readonly Task[];
    /** Accessible name of the list. */
    label: string;
    /** Which cards are de-emphasised (unowned tasks in a time list). */
    muted?: (task: Task) => boolean;
    /** Buttons for a card (take / request), or nothing. */
    actions?: Snippet<[Task]>;
    /** Which cards get `actions` (default: all of them). */
    withActions?: (task: Task) => boolean;
    class?: string;
  }

  let { tasks, label, muted, actions, withActions, class: className }: Props = $props();
</script>

<ul class={['list', className]} aria-label={label}>
  {#each tasks as task (task.id)}
    <li
      animate:flip={{ duration: reducedMotion.current ? 0 : 320, easing: easeOut }}
      transition:fade|local={{ duration: dur(180) }}
    >
      {#if actions && (withActions?.(task) ?? true)}
        <TaskCard {task} muted={muted?.(task) ?? false}>
          {#snippet actions()}{@render actionsFor(task)}{/snippet}
        </TaskCard>
      {:else}
        <TaskCard {task} muted={muted?.(task) ?? false} />
      {/if}
    </li>
  {/each}
</ul>

{#snippet actionsFor(task: Task)}
  {@render actions?.(task)}
{/snippet}

<style>
  .list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
