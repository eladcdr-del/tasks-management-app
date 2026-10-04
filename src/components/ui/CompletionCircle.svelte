<script lang="ts">
  /*
   * CompletionCircle: the "done" control at the start of every TaskCard. 44×44 hit target around
   * a 26px circle (lg: 30px). role="checkbox"; its name is "סימון כבוצעה: <title>".
   *
   * Motion (Blueprint §8): checking fills the circle with accent-strong (soft spring pop) and draws the
   * check stroke in 240ms, with a faint ring "breath" outwards; it fires haptic('complete').
   * Unchecking reverses in 120ms. Reduced motion: both simply crossfade in ≤ 120ms.
   *
   * The control flips immediately; the parent decides what follows (e.g. TaskCard waits ~300ms so
   * the check is seen, then opens CompleteSheet or collapses the card).
   *   <CompletionCircle label={task.title} checked={done} onchange={(v) => v && complete(task)} />
   */
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';

  interface Props {
    checked?: boolean;
    /** The task title (user text). */
    label: string;
    onchange?: (checked: boolean) => void;
    size?: 'md' | 'lg';
    disabled?: boolean;
    class?: string;
  }

  let {
    checked = $bindable(false),
    label,
    onchange,
    size = 'md',
    disabled = false,
    class: className
  }: Props = $props();

  let burst = $state(false);

  function toggle() {
    checked = !checked;
    if (checked) {
      burst = false;
      requestAnimationFrame(() => (burst = true));
      haptic('complete');
    }
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="checkbox"
  class={['cc', size, { checked }, className]}
  aria-checked={checked}
  aria-label={he.ui.markDone(label)}
  {disabled}
  onclick={toggle}
>
  <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    {#if burst}
      <circle class="burst" cx="14" cy="14" r="12.5" onanimationend={() => (burst = false)} />
    {/if}
    <circle class="ring" cx="14" cy="14" r="12.25" />
    <circle class="fill" cx="14" cy="14" r="13.25" />
    <path class="check" d="M8.6 14.6l3.7 3.6 7.2-7.6" pathLength="1" />
  </svg>
</button>

<style>
  .cc {
    --cc-size: 26px;
    --cc-ring: var(--ink-3);
    /* accent-strong, not accent: the check needs ≥ 3:1 on the fill (4.6:1 light, 8:1 dark). */
    --cc-fill: var(--accent-strong);
    position: relative;
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    flex: none;
    border-radius: var(--r-pill);
    -webkit-tap-highlight-color: transparent;
  }

  .lg {
    --cc-size: 30px;
  }

  svg {
    inline-size: var(--cc-size);
    block-size: var(--cc-size);
    overflow: visible;
  }

  circle,
  path {
    transform-box: fill-box;
    transform-origin: center;
  }

  .ring {
    fill: transparent;
    stroke: var(--cc-ring);
    stroke-width: 1.75;
    transition:
      stroke var(--d-fast) var(--ease-out),
      fill var(--d-fast) var(--ease-out);
  }

  .fill {
    fill: var(--cc-fill);
    opacity: 0;
    transform: scale(0.35);
    transition:
      transform 160ms var(--ease-out),
      opacity 120ms linear;
  }

  .check {
    fill: none;
    stroke: var(--ink-on-accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    transition: stroke-dashoffset 120ms var(--ease-out);
  }

  .checked .fill {
    opacity: 1;
    transform: scale(1);
    transition:
      transform 220ms var(--ease-spring),
      opacity 80ms linear;
  }

  .checked .check {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 240ms var(--ease-out) 50ms;
  }

  .burst {
    fill: none;
    stroke: var(--cc-fill);
    stroke-width: 2;
    opacity: 0;
    animation: burst 480ms var(--ease-out);
  }

  @keyframes burst {
    from {
      opacity: 0.55;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(1.75);
    }
  }

  @media (hover: hover) {
    .cc:not(.checked):not(:disabled):hover .ring {
      stroke: var(--accent);
      fill: color-mix(in srgb, var(--accent-soft) 60%, transparent);
    }
  }

  .cc:not(.checked):active .ring {
    stroke: var(--accent);
    fill: var(--accent-soft);
  }

  .cc:focus-visible {
    outline: none;
  }

  .cc:focus-visible svg {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
    border-radius: var(--r-pill);
  }

  .cc:disabled {
    opacity: 0.5;
  }

  /* Reduced motion: crossfade only. */
  @media (prefers-reduced-motion: reduce) {
    .fill,
    .checked .fill {
      transform: none;
      transition: opacity 120ms linear;
    }

    .check,
    .checked .check {
      stroke-dashoffset: 0;
      opacity: 0;
      transition: opacity 120ms linear;
    }

    .checked .check {
      opacity: 1;
    }

    .burst {
      display: none;
    }
  }
</style>
