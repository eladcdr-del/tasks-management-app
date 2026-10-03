<script lang="ts">
  // Button: primary / secondary / ghost / danger · sm (36, 44px hit) / md (44) / lg (52).
  // Renders <a> when `href` is set. While `loading`, the label keeps its width under a spinner,
  // the button stays focusable (aria-disabled) and clicks are swallowed.
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Spinner from './Spinner.svelte';
  import type { IconComponent } from './types';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    /** Stretch to the container's inline size. */
    block?: boolean;
    /** Leading icon (sits at inline-start, so on the right in RTL). */
    icon?: IconComponent;
    /** Mirror a directional icon in RTL. */
    flipIcon?: boolean;
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
    href,
    disabled = false,
    type = 'button',
    class: className,
    onclick,
    children,
    ...rest
  }: Props = $props();

  const iconSize = $derived(size === 'sm' ? 16 : size === 'lg' ? 20 : 18);
  const classes = $derived(['btn', variant, size, { block, loading }, className]);

  function guard(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (loading) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    onclick?.(e);
  }
</script>

{#snippet inner()}
  <span class="content">
    {#if Icon}
      <Icon size={iconSize} strokeWidth={2} aria-hidden="true" class={flipIcon ? 'flip-rtl' : ''} />
    {/if}
    <span class="label">{@render children()}</span>
  </span>
  {#if loading}
    <span class="busy"><Spinner size={iconSize} /></span>
  {/if}
{/snippet}

{#if href && !disabled}
  <a {href} class={classes} aria-busy={loading || undefined}>
    {@render inner()}
  </a>
{:else}
  <button
    {type}
    class={classes}
    {disabled}
    aria-disabled={loading || undefined}
    aria-busy={loading || undefined}
    onclick={guard}
    {...rest}
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
    border-radius: 14px;
    border: 0;
    background: var(--btn-bg);
    color: var(--btn-fg);
    box-shadow: var(--btn-shadow);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background-color var(--d-fast) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }

  /* Sizes */
  .sm {
    block-size: 36px;
    padding-inline: 14px;
    border-radius: 12px;
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
    block-size: 44px;
    padding-inline: 18px;
    font-size: var(--fs-body);
    line-height: 1.375rem;
  }

  .lg {
    block-size: var(--btn-h);
    padding-inline: var(--s6);
    border-radius: var(--r-md);
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
    gap: inherit;
    min-inline-size: 0;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Variants */
  .primary {
    --btn-bg: var(--accent-strong);
    --btn-fg: var(--ink-on-accent);
    --btn-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.16), 0 1px 2px rgb(74 44 24 / 0.16),
      0 6px 16px -8px
        light-dark(
          color-mix(in srgb, var(--accent-strong) 80%, transparent),
          color-mix(in srgb, var(--accent-strong) 30%, transparent)
        );
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
    --btn-bg: var(--danger);
    --btn-fg: var(--ink-on-accent);
    --btn-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.12), 0 1px 2px rgb(74 44 24 / 0.16),
      0 6px 16px -8px
        light-dark(
          color-mix(in srgb, var(--danger) 70%, transparent),
          color-mix(in srgb, var(--danger) 25%, transparent)
        );
  }

  @media (hover: hover) {
    .primary:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--accent-strong), var(--ink) 8%);
    }
    .secondary:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--surface-2), var(--ink) 5%);
    }
    .ghost:hover:not(:disabled) {
      --btn-bg: color-mix(in srgb, var(--accent-soft) 60%, transparent);
    }
    .danger:hover:not(:disabled) {
      --btn-bg: color-mix(in oklab, var(--danger), var(--ink) 8%);
    }
  }

  .btn:active:not(:disabled):not(.loading) {
    transform: scale(0.97);
  }

  .primary:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--accent-strong), var(--ink) 14%);
    --btn-shadow: inset 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .secondary:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--surface-2), var(--ink) 9%);
  }

  .ghost:active:not(:disabled) {
    --btn-bg: var(--accent-soft);
  }

  .danger:active:not(:disabled) {
    --btn-bg: color-mix(in oklab, var(--danger), var(--ink) 14%);
    --btn-shadow: inset 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .btn:focus-visible {
    outline: 2px solid var(--accent);
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

  /* Loading: keep the label's width, hide it under a centred spinner. */
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
