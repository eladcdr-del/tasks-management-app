<script lang="ts">
  // IconButton: an icon-only button. `label` is REQUIRED (it becomes the aria-label).
  // Visual sizes sm 32 / md 40 / lg 48; the hit area is always at least 44×44.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Variant = 'plain' | 'tonal' | 'filled' | 'outline';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
    /** Accessible name (Hebrew), e.g. he.common.close. */
    label: string;
    icon: IconComponent;
    variant?: Variant;
    size?: 'sm' | 'md' | 'lg';
    /** Mirror directional icons (chevrons, arrows) in RTL. */
    flipRtl?: boolean;
    /** Toggle buttons: sets aria-pressed and the selected look. */
    pressed?: boolean;
  }

  let {
    label,
    icon: Icon,
    variant = 'plain',
    size = 'md',
    flipRtl = false,
    pressed,
    type = 'button',
    class: className,
    ...rest
  }: Props = $props();

  const iconSize = $derived(size === 'sm' ? 18 : size === 'lg' ? 24 : 20);
</script>

<button
  {type}
  class={['icon-btn', variant, size, { pressed }, className]}
  aria-label={label}
  aria-pressed={pressed}
  title={label}
  {...rest}
>
  <span class="face">
    <Icon
      size={iconSize}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
      class={flipRtl ? 'flip-rtl' : ''}
    />
  </span>
</button>

<style>
  .icon-btn {
    --face: 40px;
    position: relative;
    display: inline-grid;
    place-items: center;
    inline-size: max(var(--face), var(--tap-min));
    block-size: max(var(--face), var(--tap-min));
    border-radius: var(--r-pill);
    color: var(--ink-2);
    flex: none;
  }

  .sm {
    --face: 32px;
  }

  .lg {
    --face: 48px;
  }

  .face {
    display: grid;
    place-items: center;
    inline-size: var(--face);
    block-size: var(--face);
    border-radius: var(--r-pill);
    transition:
      background-color var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .tonal .face {
    background: var(--surface-2);
    color: var(--ink);
  }

  .filled .face {
    background: var(--accent-strong);
    color: var(--ink-on-accent);
  }

  .outline .face {
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
  }

  /* Toggle on: ink selection (never the brand peach). */
  .pressed .face {
    background: var(--select-bg);
    color: var(--select-fg);
  }

  @media (hover: hover) {
    .plain:not(.pressed):hover .face,
    .outline:not(.pressed):hover .face {
      background: color-mix(in oklab, var(--surface-2), transparent 30%);
      color: var(--ink);
    }
    .tonal:hover .face {
      background: color-mix(in oklab, var(--surface-2), var(--ink) 5%);
    }
  }

  .icon-btn:active .face {
    transform: scale(0.92);
  }

  .plain:active .face {
    background: var(--surface-2);
  }

  .icon-btn:focus-visible {
    outline: none;
  }

  .icon-btn:focus-visible .face {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .icon-btn:disabled {
    color: var(--ink-3);
  }

  .icon-btn:disabled .face {
    background: transparent;
    box-shadow: none;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn:active .face {
      transform: none;
    }
  }
</style>
