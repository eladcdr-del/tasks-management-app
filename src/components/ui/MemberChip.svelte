<script lang="ts">
  // MemberChip: a person in their colour: small avatar + name (+ optional count).
  // Static by default (Pulse balance row: "מיכל 5 · דני 4"): the member's soft tint.
  // Pass `onclick` to make it a filter toggle ("של דני"), with `selected` → aria-pressed. A selected
  // toggle uses the ink selection treatment (like Chip), so a member's colour never reads as "selected".
  // Extra attributes reach the button (or the static chip).
  import type { HTMLAttributes } from 'svelte/elements';
  import Avatar from './Avatar.svelte';
  import { textDir } from '$lib/i18n/textDir';
  import type { AvatarPerson } from './types';

  interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onclick'> {
    person: AvatarPerson;
    count?: number;
    /** Prefix shown before the name, e.g. "של" for the filter chip "של דני". */
    prefix?: string;
    /** Shown instead of the name ("אני"); the avatar keeps the person's own initial. */
    label?: string;
    selected?: boolean;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    person,
    count,
    prefix,
    label,
    selected = false,
    onclick,
    class: className,
    ...rest
  }: Props = $props();
</script>

{#snippet body()}
  {@const name = label ?? person.displayName}
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
      {#if prefix}{prefix}{' '}{/if}<bdi dir={textDir(name)}>{name}</bdi>
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
    {...rest}
    {onclick}
  >
    {@render body()}
  </button>
{:else}
  <span class={['member-chip', className]} data-member-color={person.color} {...rest}>
    {@render body()}
  </span>
{/if}

<style>
  .member-chip {
    --avatar-face: var(--surface);
    display: inline-flex;
    align-items: center;
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .interactive {
    min-block-size: var(--tap-min);
  }

  .face {
    display: inline-flex;
    align-items: center;
    gap: var(--s1-5);
    min-block-size: 32px;
    max-inline-size: 100%;
    padding-block: 0.2em;
    padding-inline: var(--s1) var(--s3);
    border-radius: var(--r-pill);
    background: var(--m-soft);
    color: var(--m-ink);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    transition:
      background-color var(--d-base) var(--ease-out),
      color var(--d-base) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .interactive .face {
    min-block-size: 36px;
    padding-inline: var(--s1-5) var(--s3-5);
    box-shadow: inset 0 0 0 1px transparent;
  }

  .interactive:not(.selected) {
    --avatar-face: var(--m-soft);
  }

  .interactive:not(.selected) .face {
    background: var(--surface);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
  }

  /* Selected: ink, like every other selection. The avatar keeps the member's colour. */
  .selected {
    --avatar-face: var(--m-soft);
  }

  .selected .face {
    background: var(--select-bg);
    color: var(--select-fg);
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
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .interactive:active .face {
      transform: none;
    }
  }
</style>
