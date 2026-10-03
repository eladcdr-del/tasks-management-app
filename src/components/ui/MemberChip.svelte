<script lang="ts">
  // MemberChip: a person in their colour: small avatar + name (+ optional count).
  // Static by default (Pulse balance row: "מיכל 5 · דני 4"); pass `onclick` to make it a toggle
  // button (filter "של דני"), with `selected` → aria-pressed.
  import Avatar from './Avatar.svelte';
  import type { AvatarPerson } from './types';

  interface Props {
    person: AvatarPerson;
    count?: number;
    /** Prefix shown before the name, e.g. "של" for the filter chip "של דני". */
    prefix?: string;
    selected?: boolean;
    onclick?: (e: MouseEvent) => void;
    class?: string;
  }

  let { person, count, prefix, selected = false, onclick, class: className }: Props = $props();
</script>

{#snippet body()}
  <span class="face">
    <Avatar
      name={person.displayName}
      photoURL={person.photoURL}
      color={person.color}
      size="xs"
      ring={false}
      decorative
    />
    <span class="name">
      {#if prefix}{prefix}{' '}{/if}<bdi>{person.displayName}</bdi>
    </span>
    {#if count !== undefined}<span class="count num">{count}</span>{/if}
  </span>
{/snippet}

{#if onclick}
  <button
    type="button"
    class={['member-chip', 'interactive', { selected }, className]}
    data-member-color={person.color}
    aria-pressed={selected}
    {onclick}
  >
    {@render body()}
  </button>
{:else}
  <span class={['member-chip', className]} data-member-color={person.color}>
    {@render body()}
  </span>
{/if}

<style>
  .member-chip {
    --avatar-face: var(--surface);
    display: inline-flex;
    align-items: center;
    flex: none;
  }

  .interactive {
    min-block-size: var(--tap-min);
  }

  .face {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: 32px;
    padding-inline: 4px 12px;
    border-radius: var(--r-pill);
    background: var(--m-soft);
    color: var(--m-ink);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    white-space: nowrap;
    transition:
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .interactive .face {
    block-size: 36px;
    padding-inline: 6px 14px;
    box-shadow: inset 0 0 0 1px transparent;
  }

  .interactive:not(.selected) {
    --avatar-face: var(--m-soft);
  }

  .interactive:not(.selected) .face {
    background: var(--surface);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .selected .face {
    box-shadow: inset 0 0 0 1.5px var(--m-base);
  }

  .count {
    font-weight: 600;
  }

  .interactive:active .face {
    transform: scale(0.96);
  }

  .interactive:focus-visible {
    outline: none;
  }

  .interactive:focus-visible .face {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .interactive:active .face {
      transform: none;
    }
  }
</style>
