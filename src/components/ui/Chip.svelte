<script lang="ts">
  // Chip, four kinds:
  //   filter     – single-select toggle in a row ("הכל | שלי | של דני"); aria-pressed.
  //   selectable – multi-select toggle; shows a check when selected; aria-pressed.
  //   removable  – a static value with an × button (onremove).
  //   token      – a phrase parsed from quick-add text ("מחר", "דחוף"): accent-soft with an ×.
  // The visible pill is 36px (token 32px); every button inside has a ≥44px hit area.
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { he } from '$lib/i18n/he';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Kind = 'filter' | 'selectable' | 'removable' | 'token';

  interface Props {
    label: string;
    kind?: Kind;
    selected?: boolean;
    icon?: IconComponent;
    /** Small trailing count (filter chips): "שלי 5". */
    count?: number;
    /** The label is user-entered text (parsed tokens, member names): render with dir="auto". */
    userText?: boolean;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    onremove?: () => void;
    /** Accessible name for the × button. Defaults to "הסרת {label}". */
    removeLabel?: string;
    class?: string;
  }

  let {
    label,
    kind = 'filter',
    selected = false,
    icon: Icon,
    count,
    userText = kind === 'token',
    disabled = false,
    onclick,
    onremove,
    removeLabel,
    class: className
  }: Props = $props();

  const toggle = $derived(kind === 'filter' || kind === 'selectable');
</script>

{#if toggle}
  <button
    type="button"
    class={['chip', kind, { selected }, className]}
    aria-pressed={selected}
    {disabled}
    {onclick}
  >
    <span class="face">
      {#if kind === 'selectable' && selected}
        <Check size={16} strokeWidth={2.25} aria-hidden="true" class="lead" />
      {:else if Icon}
        <Icon size={16} strokeWidth={ICON_STROKE} aria-hidden="true" class="lead" />
      {/if}
      <span class="text" dir={userText ? 'auto' : undefined}>{label}</span>
      {#if count !== undefined}<span class="count num">{count}</span>{/if}
    </span>
  </button>
{:else}
  <span class={['chip', 'static', kind, className]}>
    <span class="face">
      {#if Icon}
        <Icon size={15} strokeWidth={ICON_STROKE} aria-hidden="true" class="lead" />
      {/if}
      <span class="text" dir={userText ? 'auto' : undefined}>{label}</span>
      <button
        type="button"
        class="remove"
        aria-label={removeLabel ?? he.dev.ui.remove(label)}
        {disabled}
        onclick={() => onremove?.()}
      >
        <span class="x"><X size={14} strokeWidth={2.25} aria-hidden="true" /></span>
      </button>
    </span>
  </span>
{/if}

<style>
  .chip {
    --chip-h: 36px;
    --chip-bg: var(--surface);
    --chip-fg: var(--ink);
    --chip-edge: var(--line);
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    flex: none;
    max-inline-size: 100%;
  }

  .face {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: var(--chip-h);
    max-inline-size: 100%;
    padding-inline: 14px;
    border-radius: var(--r-md);
    background: var(--chip-bg);
    color: var(--chip-fg);
    box-shadow: inset 0 0 0 1px var(--chip-edge);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    white-space: nowrap;
    transition:
      background-color var(--d-base) var(--ease-out),
      color var(--d-base) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .face :global(.lead) {
    flex: none;
    margin-inline-start: -2px;
    color: var(--chip-icon, currentColor);
  }

  .count {
    min-inline-size: 1.25rem;
    padding-inline: 5px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    line-height: 1.25rem;
    text-align: center;
  }

  /* Toggles */
  .filter,
  .selectable {
    --chip-fg: var(--ink-2);
    --chip-icon: var(--ink-3);
  }

  .selected .count {
    background: var(--surface);
    color: var(--accent-ink);
  }

  .selected {
    --chip-bg: var(--accent-soft);
    --chip-fg: var(--accent-ink);
    --chip-icon: var(--accent-ink);
    --chip-edge: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  @media (hover: hover) {
    .filter:not(.selected):hover .face,
    .selectable:not(.selected):hover .face {
      --chip-edge: color-mix(in oklab, var(--line), var(--ink) 14%);
      --chip-fg: var(--ink);
    }
  }

  button.chip:active .face {
    transform: scale(0.96);
  }

  button.chip:focus-visible {
    outline: none;
  }

  button.chip:focus-visible .face {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button.chip:disabled .face {
    opacity: 0.5;
  }

  /* Static chips with an × */
  .static .face {
    padding-inline-end: 0;
  }

  .removable {
    --chip-bg: var(--surface-2);
    --chip-edge: transparent;
  }

  .token {
    --chip-h: 32px;
    --chip-bg: var(--accent-soft);
    --chip-fg: var(--accent-ink);
    --chip-edge: transparent;
    --chip-icon: var(--accent-ink);
  }

  .token .face {
    padding-inline-start: 12px;
    font-size: var(--fs-caption);
    font-weight: 500;
    gap: 5px;
  }

  .remove {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: var(--chip-h);
    margin-inline-start: -4px;
    border-radius: var(--r-pill);
    color: inherit;
  }

  /* Grow the × hit area to 44×44 without changing the chip's size. */
  .remove::after {
    content: '';
    position: absolute;
    inset-block: calc((var(--chip-h) - var(--tap-min)) / 2);
    inset-inline: -6px;
  }

  .x {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, currentColor 12%, transparent);
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .remove:active .x,
  .remove:hover .x {
    background: color-mix(in srgb, currentColor 22%, transparent);
  }

  .remove:focus-visible {
    outline: none;
  }

  .remove:focus-visible .x {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    button.chip:active .face {
      transform: none;
    }
  }
</style>
