<script lang="ts">
  // AvatarStack: overlapping avatars (first person at inline-start), "+N" past `max`.
  // Set `backdrop` to the colour behind the stack so the separating rings blend in.
  import Avatar from './Avatar.svelte';
  import type { AvatarPerson } from './types';
  import { he } from '$lib/i18n/he';

  interface Props {
    people: AvatarPerson[];
    max?: number;
    size?: 'xs' | 'sm' | 'md';
    /** CSS colour behind the stack (default: var(--bg)). */
    backdrop?: string;
    /** Accessible name for the group; defaults to the joined names. */
    label?: string;
    class?: string;
  }

  let {
    people,
    max = 3,
    size = 'sm',
    backdrop = 'var(--bg)',
    label,
    class: className
  }: Props = $props();

  const shown = $derived(people.slice(0, max));
  const extra = $derived(Math.max(0, people.length - max));
  const groupLabel = $derived(
    label ??
      [...shown.map((p) => p.displayName), ...(extra > 0 ? [he.dev.ui.andMore(extra)] : [])].join(
        ', '
      )
  );
</script>

<span
  class={['stack', size, className]}
  style:--avatar-gap={backdrop}
  role="img"
  aria-label={groupLabel}
>
  {#each shown as p, i (i)}
    <span class="slot" style:z-index={shown.length - i}>
      <Avatar name={p.displayName} photoURL={p.photoURL} color={p.color} {size} decorative />
    </span>
  {/each}
  {#if extra > 0}
    <span class="slot more num" aria-hidden="true" dir="ltr">+{extra}</span>
  {/if}
</span>

<style>
  .stack {
    display: inline-flex;
    align-items: center;
    flex: none;
  }

  .slot {
    position: relative;
    display: inline-grid;
    border-radius: var(--r-pill);
    /* The ring gap doubles as the separator between overlapping avatars. */
    box-shadow: 0 0 0 2px var(--avatar-gap);
  }

  .slot + .slot {
    margin-inline-start: -8px;
  }

  .xs .slot + .slot {
    margin-inline-start: -6px;
  }

  .md .slot + .slot {
    margin-inline-start: -10px;
  }

  .more {
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    font-weight: 600;
  }

  .xs .more {
    inline-size: 24px;
    block-size: 24px;
    font-size: 0.6875rem;
  }

  .md .more {
    inline-size: 40px;
    block-size: 40px;
  }
</style>
