<script lang="ts">
  // Chip, four kinds:
  //   filter     – single-select toggle in a row ("הכל | שלי | של דני"); aria-pressed.
  //                Selected = ink fill with cream text (selection is ink, never a peach tint).
  //   selectable – multi-select toggle; selected = ink ring + check + a faint ink wash; aria-pressed.
  //   removable  – a static value with an × button (onremove).
  //   token      – a phrase parsed from quick-add text ("מחר", "דחוף"): accent-soft with an ×.
  //                (--accent-soft is reserved for brand moments and parsed tokens.)
  // The visible pill is ≥ 36px (token ≥ 32px) and grows with large text (the label wraps);
  // every button inside has a ≥ 44px hit area. Extra attributes reach the toggle button (or the
  // static chip's outer element).
  import type { HTMLAttributes } from 'svelte/elements';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { he } from '$lib/i18n/he';
  import { textDir } from '$lib/i18n/textDir';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Kind = 'filter' | 'selectable' | 'removable' | 'token';

  interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onclick'> {
    label: string;
    kind?: Kind;
    selected?: boolean;
    icon?: IconComponent;
    /** Small trailing count (filter chips): "שלי 5". */
    count?: number;
    /** The label is user-entered text (parsed tokens, member names): direction via textDir(). */
    userText?: boolean;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    onremove?: () => void;
    /** Accessible name for the × button. Defaults to "הסרת {label}". */
    removeLabel?: string;
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
    class: className,
    ...rest
  }: Props = $props();

  const toggle = $derived(kind === 'filter' || kind === 'selectable');
  const dir = $derived(userText ? textDir(label) : undefined);
</script>

{#if toggle}
  <button
    type="button"
    class={['chip', kind, { selected }, className]}
    aria-pressed={selected}
    {disabled}
    {...rest}
    {onclick}
  >
    <span class="face">
      {#if kind === 'selectable' && selected}
        <Check strokeWidth={ICON_STROKE} aria-hidden="true" class="lead" />
      {:else if Icon}
        <Icon strokeWidth={ICON_STROKE} aria-hidden="true" class="lead" />
      {/if}
      <span class="text" {dir}>{label}</span>
      {#if count !== undefined}<span class="count num">{count}</span>{/if}
    </span>
  </button>
{:else}
  <span class={['chip', 'static', kind, className]} {...rest}>
    <span class="face">
      {#if Icon}
        <Icon strokeWidth={ICON_STROKE} aria-hidden="true" class="lead" />
      {/if}
      <span class="text" {dir}>{label}</span>
      <button
        type="button"
        class="remove"
        aria-label={removeLabel ?? he.ui.remove(label)}
        {disabled}
        onclick={() => onremove?.()}
      >
        <span class="x"><X strokeWidth={ICON_STROKE} aria-hidden="true" /></span>
      </button>
    </span>
  </span>
{/if}

<style>
  .chip {
    --chip-h: 36px;
    --chip-bg: var(--surface);
    --chip-fg: var(--ink);
    --chip-edge: var(--hairline-strong);
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .face {
    display: inline-flex;
    align-items: center;
    gap: var(--s1-5);
    min-block-size: var(--chip-h);
    max-inline-size: 100%;
    padding-block: 0.3em;
    padding-inline: var(--s3-5);
    border-radius: var(--r-md);
    background: var(--chip-bg);
    color: var(--chip-fg);
    box-shadow: inset 0 0 0 var(--chip-edge-w, 1px) var(--chip-edge);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    text-align: start;
    transition:
      background-color var(--d-base) var(--ease-out),
      color var(--d-base) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  .face :global(.lead) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    margin-inline-start: calc(var(--s0-5) * -1);
    color: var(--chip-icon, currentColor);
  }

  .count {
    flex: none;
    min-inline-size: 1.5em;
    padding-inline: var(--s1);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    line-height: 1.5;
    text-align: center;
  }

  /* Toggles at rest */
  .filter,
  .selectable {
    --chip-fg: var(--ink-2);
    --chip-icon: var(--ink-2);
  }

  /* Single-select: ink fill. */
  .filter.selected {
    --chip-bg: var(--select-bg);
    --chip-fg: var(--select-fg);
    --chip-icon: var(--select-fg);
    --chip-edge: var(--select-bg);
  }

  .filter.selected .count {
    background: color-mix(in srgb, var(--select-fg) 20%, transparent);
    color: var(--select-fg);
  }

  /* Multi-select: ink ring + check on a faint ink wash. */
  .selectable.selected {
    --chip-bg: var(--select-soft);
    --chip-fg: var(--ink);
    --chip-icon: var(--ink);
    --chip-edge: var(--select-ring);
    --chip-edge-w: 1.5px;
  }

  @media (hover: hover) {
    .filter:not(.selected):hover .face,
    .selectable:not(.selected):hover .face {
      --chip-edge: color-mix(in oklab, var(--hairline-strong), var(--ink) 20%);
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
    outline: 2px solid var(--focus-ring);
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
    gap: var(--s1);
    padding-block: 0.25em;
    padding-inline-start: var(--s3);
    font-size: var(--fs-caption);
    font-weight: 500;
  }

  .remove {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    align-self: stretch;
    inline-size: 32px;
    min-block-size: var(--chip-h);
    margin-block: -0.3em;
    margin-inline-start: calc(var(--s1) * -1);
    border-radius: var(--r-pill);
    color: inherit;
  }

  /* Grow the × hit area to 44×44 without changing the chip's size. */
  .remove::after {
    content: '';
    position: absolute;
    inset-block: min(0px, calc((100% - var(--tap-min)) / 2));
    inset-inline: calc(var(--s1-5) * -1);
  }

  .x {
    display: grid;
    place-items: center;
    inline-size: 1.4em;
    block-size: 1.4em;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, currentColor 12%, transparent);
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .x :global(svg) {
    inline-size: 1em;
    block-size: 1em;
  }

  .remove:active .x,
  .remove:hover .x {
    background: color-mix(in srgb, currentColor 22%, transparent);
  }

  .remove:focus-visible {
    outline: none;
  }

  .remove:focus-visible .x {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    button.chip:active .face {
      transform: none;
    }
  }
</style>
