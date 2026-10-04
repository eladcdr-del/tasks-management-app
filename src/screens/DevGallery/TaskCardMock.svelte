<script lang="ts">
  // MOCK TaskCard, built only from 1.4 primitives, so the composition can be judged.
  // The real TaskCard (swipe, collapse, data) is step 3.2's.
  import type { Snippet } from 'svelte';
  import Repeat from '@lucide/svelte/icons/repeat';
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import Avatar from '$components/ui/Avatar.svelte';
  import Badge from '$components/ui/Badge.svelte';
  import CompletionCircle from '$components/ui/CompletionCircle.svelte';
  import { categoryIcon } from '$components/ui/CategoryIcon.svelte';
  import type { AvatarPerson } from '$components/ui/types';
  import { textDir } from '$lib/i18n/textDir';
  import type { MockTask } from './galleryData';

  interface Props {
    task: MockTask;
    me: AvatarPerson;
    partner: AvatarPerson;
    actions?: Snippet;
  }

  let { task, me, partner, actions }: Props = $props();

  // Local, optimistic: starts from the task and can be toggled in the gallery.
  let done = $derived(task.done ?? false);
  const owner = $derived(task.owner === 'me' ? me : task.owner === 'partner' ? partner : null);
</script>

<article class={['task', { done }]} data-task={task.id}>
  <CompletionCircle label={task.title} bind:checked={done} />
  <div class="body">
    {#if task.requested}
      <p class="requested">
        <HandHelping class="req-icon" strokeWidth={1.75} aria-hidden="true" />{task.requested}
      </p>
    {/if}
    <button type="button" class="title" dir={textDir(task.title)}>{task.title}</button>
    <div class="meta">
      <!-- Status first (read first in RTL), then the quiet context. -->
      {#each task.badges as b (b.label)}
        <Badge kind={b.kind} label={b.label} variant={b.variant} />
      {/each}
      <Badge variant="plain" icon={categoryIcon(task.category)} label={task.categoryLabel} />
      {#if task.recurring}
        <Badge variant="plain" icon={Repeat} label={task.recurring} />
      {/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  <div class="trail">
    {#if owner}
      <Avatar name={owner.displayName} photoURL={owner.photoURL} color={owner.color} size="sm" />
    {:else}
      <Avatar unassigned size="sm" />
    {/if}
  </div>
  {#if task.pending}
    <span class="pending" title="ממתין לסנכרון"
      ><span class="visually-hidden">ממתין לסנכרון</span></span
    >
  {/if}
</article>

<style>
  .task {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2px;
    padding-block: 10px;
    padding-inline: 6px 14px;
    border-radius: 20px;
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  .task > :global(.cc) {
    position: relative;
    z-index: 1;
  }

  .body {
    display: grid;
    gap: 6px;
    flex: 1;
    min-inline-size: 0;
    padding-block: 10px 2px;
    padding-inline-start: 4px;
  }

  .requested {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-block: -2px 0;
    font: var(--font-caption);
    color: var(--accent-ink);
  }

  .requested :global(.req-icon) {
    inline-size: 1em;
    block-size: 1em;
    flex: none;
  }

  .title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
    color: var(--ink);
    text-align: start;
    transition: color var(--d-base) var(--ease-out);
  }

  /* Whole card opens the task; the completion circle and actions sit above this layer. */
  .title::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .title:focus-visible {
    outline: none;
  }

  .title:focus-visible::after {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .done .title {
    color: var(--ink-2);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--ink-2) 60%, transparent);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }

  .actions {
    position: relative;
    z-index: 1;
    display: flex;
    gap: var(--s2);
    margin-block-start: var(--s2);
  }

  .trail {
    flex: none;
    padding-block-start: 6px;
  }

  .pending {
    position: absolute;
    inset-block-start: 10px;
    inset-inline-end: 10px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-pill);
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--surface);
  }
</style>
