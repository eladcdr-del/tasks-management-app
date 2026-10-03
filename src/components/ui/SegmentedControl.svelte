<script lang="ts" generics="T extends string">
  // SegmentedControl: equal-width options on a sand track with a sliding white thumb.
  // a11y: radiogroup + radios, roving tabindex. Arrow keys follow the reading direction
  // (in RTL, ArrowLeft moves to the next option), Home/End jump; selection follows focus.
  import { haptic } from '$lib/platform/haptics';

  interface Option {
    value: T;
    label: string;
    /** Optional small count after the label: "היום 4". */
    count?: number;
  }

  interface Props {
    options: Option[];
    value: T;
    /** Accessible name of the group (Hebrew). */
    label: string;
    onchange?: (value: T) => void;
    class?: string;
  }

  let { options, value = $bindable(), label, onchange, class: className }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  const index = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  );

  function select(i: number, focus = false) {
    const opt = options[i];
    if (!opt) return;
    if (opt.value !== value) {
      value = opt.value;
      onchange?.(opt.value);
      haptic('select');
    }
    if (focus) root?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    const rtl = root ? getComputedStyle(root).direction === 'rtl' : true;
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1;
    else if (e.key === 'ArrowRight') next = rtl ? index - 1 : index + 1;
    else if (e.key === 'ArrowDown') next = index + 1;
    else if (e.key === 'ArrowUp') next = index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    if (next > last) next = 0;
    if (next < 0) next = last;
    select(next, true);
  }
</script>

<div
  bind:this={root}
  class={['segmented', className]}
  role="radiogroup"
  aria-label={label}
  style:--n={options.length}
  style:--i={index}
>
  <span class="thumb" aria-hidden="true"></span>
  {#each options as opt, i (opt.value)}
    <button
      type="button"
      role="radio"
      class="seg"
      aria-checked={i === index}
      tabindex={i === index ? 0 : -1}
      onclick={() => select(i)}
      {onkeydown}
    >
      <span class="label">{opt.label}</span>
      {#if opt.count !== undefined}<span class="count num">{opt.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    --pad: 4px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    block-size: 44px;
    padding: var(--pad);
    border-radius: var(--r-md);
    background: var(--surface-2);
    isolation: isolate;
  }

  .thumb {
    position: absolute;
    inset-block: var(--pad);
    inset-inline-start: var(--pad);
    inline-size: calc((100% - var(--pad) * 2) / var(--n));
    border-radius: 12px;
    /* Raised: white in light; a lighter brown than the track in dark (no token yet). */
    background: light-dark(var(--surface), #43382f);
    border: 1px solid light-dark(transparent, #4d4037);
    box-shadow:
      0 1px 2px rgb(74 44 24 / 0.08),
      0 2px 6px rgb(74 44 24 / 0.06);
    transform: translateX(calc(var(--i) * 100%));
    transition: transform var(--d-slow) var(--ease-out);
    z-index: -1;
  }

  /* RTL: the thumb travels towards the left. */
  :global([dir='rtl']) .thumb {
    transform: translateX(calc(var(--i) * -100%));
  }

  .seg {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: 0;
    /* The visible thumb is 36px; the button fills the whole 44px track height. */
    margin-block: calc(var(--pad) * -1);
    border-radius: 12px;
    color: var(--ink-2);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    transition: color var(--d-base) var(--ease-out);
  }

  .seg[aria-checked='true'] {
    color: var(--ink);
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--ink-2);
  }

  .seg[aria-checked='true'] .count {
    color: var(--accent-ink);
  }

  .seg:focus-visible {
    outline: none;
  }

  .seg:focus-visible::after {
    content: '';
    position: absolute;
    inset: var(--pad);
    border-radius: 12px;
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb {
      transition-duration: var(--d-fast);
    }
  }
</style>
