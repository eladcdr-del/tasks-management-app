<script lang="ts">
  // Button: primary / secondary / ghost / danger · sm (36, 44px hit) / md (44) / lg (52).
  // Renders <a> when `href` is set (extra attributes such as target / rel / onclick reach it too).
  // While `loading`, the label keeps its size under a spinner, the button stays focusable
  // (aria-disabled) and clicks are swallowed.
  // Heights are minimums: with a large system font the label wraps (balanced) and the button grows.
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import Spinner from './Spinner.svelte';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props
    extends
      Omit<HTMLButtonAttributes, 'children'>,
      Pick<HTMLAnchorAttributes, 'target' | 'rel' | 'download' | 'hreflang'> {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    /** Stretch to the container's inline size. */
    block?: boolean;
    /** Leading icon (sits at inline-start, so on the right in RTL). */
    icon?: IconComponent;
    /** Mirror the leading icon in RTL (directional icons). */
    flipIcon?: boolean;
    /** Trailing icon (inline-end: on the left in RTL), e.g. a "forward" chevron. */
    iconEnd?: IconComponent;
    /** Mirror the trailing icon in RTL. */
    flipIconEnd?: boolean;
    href?: string;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    icon: Icon,
    flipIcon = false,
    iconEnd: IconEnd,
    flipIconEnd = false,
    href,
    disabled = false,
    type = 'button',
    class: className,
    onclick,
    children,
    ...rest
  }: Props = $props();

  const spinnerSize = $derived(size === 'sm' ? 16 : size === 'lg' ? 20 : 18);
  const classes = $derived(['btn', variant, size, { block, loading }, className]);

  function guard(e: MouseEvent) {
    if (loading) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    (onclick as ((e: MouseEvent) => void) | null | undefined)?.(e);
  }
</script>

{#snippet inner()}
  <span class="content">
    {#if Icon}
      <Icon
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
        class={['btn-icon', { 'flip-rtl': flipIcon }]}
      />
    {/if}
    <span class="label">{@render children()}</span>
    {#if IconEnd}
      <IconEnd
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
        class={['btn-icon', 'end', { 'flip-rtl': flipIconEnd }]}
      />
    {/if}
  </span>
  {#if loading}
    <span class="busy"><Spinner size={spinnerSize} /></span>
  {/if}
{/snippet}

{#if href && !disabled}
  <a
    {href}
    class={classes}
    aria-busy={loading || undefined}
    aria-disabled={loading || undefined}
    {...rest as HTMLAnchorAttributes}
    onclick={guard}
  >
    {@render inner()}
  </a>
{:else}
  <button
    {type}
    class={classes}
    {disabled}
    aria-disabled={loading || undefined}
    aria-busy={loading || undefined}
    {...rest}
    onclick={guard}
  >
    {@render inner()}
  </button>
{/if}

<style>
  .btn {
    --btn-bg: transparent;
    --btn-fg: var(--ink);
    --btn-shadow: none;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s2);
    min-inline-size: var(--tap-min);
    max-inline-size: 100%;
    border-radius: var(--r-control);
    border: 0;
    background: var(--btn-bg);
    color: var(--btn-fg);
    box-shadow: var(--btn-shadow);
    font-weight: 500;
    text-align: center;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background-color var(--d-fast) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }

  /* Sizes: the height is a minimum; em padding lets large text grow the button. */
  .sm {
    min-block-size: 36px;
    padding-block: 0.3em;
    padding-inline: var(--s3-5);
    border-radius: var(--r-control-sm);
    font-size: var(--fs-callout);
    line-height: 1.25rem;
  }

  /* sm stays 36px visually; its hit area grows to 44px. */
  .sm::after {
    content: '';
    position: absolute;
    inset-block: -4px;
    inset-inline: 0;
  }

  .md {
    min-block-size: 44px;
    padding-block: 0.4em;
    padding-inline: var(--s4-5);
    font-size: var(--fs-body);
    line-height: 1.375rem;
  }

  .lg {
    min-block-size: var(--btn-h);
    padding-block: 0.5em;
    padding-inline: var(--s6);
    border-radius: var(--r-control-lg);
    font-size: 1.0625rem;
    line-height: 1.5rem;
  }

  .block {
    display: flex;
    inline-size: 100%;
  }

  .content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: inherit;
    min-inline-size: 0;
  }

  .label {
    min-inline-size: 0;
    text-wrap: balance;
    overflow-wrap: break-word;
  }

  .content :global(.btn-icon) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  /* Variants */
  .primary {
    --btn-bg: var(--accent-strong);
    --btn-fg: var(--ink-on-accent);
    --btn-shadow: var(--sh-accent);
  }

  .secondary {
    --btn-bg: var(--surface-2);
    --btn-fg: var(--ink);
    --btn-shadow: inset 0 0 0 1px var(--line);
  }

  .ghost {
    --btn-fg: var(--accent-ink);
  }

  .danger {
    --btn-bg: var(--danger-solid);
    --btn-fg: var(--on-danger);
    --btn-shadow: var(--sh-danger);
  }

  @media (hover: hover) {
    .primary:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--accent-strong), var(--ink) 8%);
    }
    .secondary:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--surface-2), var(--ink) 5%);
    }
    .ghost:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--surface-2) 70%, transparent);
    }
    .danger:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--danger-solid), var(--ink) 8%);
    }
  }

  .btn:active:not(:disabled):not(.loading) {
    transform: scale(0.97);
  }

  .primary:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--accent-strong), var(--ink) 14%);
    --btn-shadow: var(--sh-press-inset);
  }

  .secondary:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--surface-2), var(--ink) 9%);
  }

  .ghost:active:not(:disabled) {
    --btn-bg: var(--surface-2);
  }

  .danger:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--danger-solid), var(--ink) 14%);
    --btn-shadow: var(--sh-press-inset);
  }

  .btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
  }

  /* Disabled: drained, no shadow (exempt from contrast rules, but still legible). */
  .btn:disabled {
    --btn-bg: var(--surface-2);
    --btn-fg: var(--ink-3);
    --btn-shadow: none;
  }

  .ghost:disabled {
    --btn-bg: transparent;
  }

  /* Loading: keep the label's size, hide it under a centred spinner. */
  .loading {
    cursor: progress;
  }

  /* opacity (not visibility) keeps the label as the accessible name while busy. */
  .loading .content {
    opacity: 0;
  }

  .busy {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
