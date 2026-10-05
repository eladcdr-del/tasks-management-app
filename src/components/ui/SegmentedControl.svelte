<script lang="ts" generics="T extends string">
  // SegmentedControl: equal-width options on a sand track with a sliding ink thumb (selection is
  // ink: the chosen option is cream on ink, AA in both themes).
  // a11y: radiogroup + radios, roving tabindex. Arrow keys follow the reading direction
  // (in RTL, ArrowLeft moves to the next option), Home/End jump; selection follows focus.
  // The thumb slides towards inline-end; :dir() picks the sign, so it follows the control's own
  // resolved direction. Labels wrap with large text and the track grows with them.
  // `fit`: options take their content's width (the spare room shared equally), so a long label
  // ("השבוע הקרוב 4") stays on one line next to short ones; the thumb follows the measured option.
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
    /** Play the light "select" haptic when the choice changes (opt-in). */
    haptics?: boolean;
    /** Content-sized options instead of equal ones. */
    fit?: boolean;
    class?: string;
  }

  let {
    options,
    value = $bindable(),
    label,
    onchange,
    haptics = false,
    fit = false,
    class: className
  }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  const index = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  );

  // fit: the thumb sits on the measured option (physical px from the track's left edge).
  let box: { x: number; w: number } | null = $state(null);
  $effect(() => {
    if (!fit || !root) return;
    const track = root;
    void index;
    void options;
    const measure = () => {
      const opt = track.querySelectorAll<HTMLElement>('[role="radio"]')[index];
      if (opt) box = { x: opt.offsetLeft, w: opt.offsetWidth };
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  });

  function select(i: number, focus = false) {
    const opt = options[i];
    if (!opt) return;
    if (opt.value !== value) {
      value = opt.value;
      onchange?.(opt.value);
      if (haptics) haptic('select');
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
  class={['segmented', { fit, measured: fit && box !== null }, className]}
  role="radiogroup"
  aria-label={label}
  style:--n={options.length}
  style:--i={index}
  style:--x={box ? `${box.x}px` : undefined}
  style:--w={box ? `${box.w}px` : undefined}
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
    --pad: var(--s1);
    --dir: 1;
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    min-block-size: 44px;
    padding: var(--pad);
    border-radius: var(--r-md);
    background: var(--surface-2);
    isolation: isolate;
  }

  /* RTL: the thumb travels towards the left. */
  .segmented:dir(rtl) {
    --dir: -1;
  }

  .thumb {
    position: absolute;
    inset-block: var(--pad);
    inset-inline-start: var(--pad);
    inline-size: calc((100% - var(--pad) * 2) / var(--n));
    border-radius: var(--r-control-sm);
    background: var(--select-bg);
    box-shadow: var(--sh-raised);
    translate: calc(var(--i) * 100% * var(--dir)) 0;
    transition: translate var(--d-slow) var(--ease-out);
    z-index: -1;
  }

  /* fit: auto columns share the spare room equally; the thumb is placed by measurement. */
  .fit {
    grid-template-columns: repeat(var(--n), auto);
  }

  .fit .thumb {
    inset-inline: auto;
    left: var(--x, 0);
    inline-size: var(--w, 0);
    translate: none;
    opacity: 0;
    transition:
      left var(--d-slow) var(--ease-out),
      inline-size var(--d-slow) var(--ease-out);
  }

  .fit.measured .thumb {
    opacity: 1;
  }

  .fit .seg {
    padding-inline: var(--s2);
  }

  .seg {
    position: relative;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0 var(--s1-5);
    min-inline-size: 0;
    min-block-size: 44px;
    /* The visible thumb is 36px; the button fills the whole 44px track height. */
    margin-block: calc(var(--pad) * -1);
    padding-block: var(--pad);
    padding-inline: var(--s1);
    border-radius: var(--r-control-sm);
    color: var(--ink-2);
    font-size: var(--fs-callout);
    font-weight: 500;
    line-height: 1.25rem;
    text-align: center;
    transition: color var(--d-base) var(--ease-out);
  }

  .seg[aria-checked='true'] {
    color: var(--select-fg);
  }

  .label {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  .count {
    font-size: var(--fs-caption);
    font-weight: 600;
    color: inherit;
  }

  .seg:focus-visible {
    outline: none;
  }

  .seg:focus-visible::after {
    content: '';
    position: absolute;
    inset: var(--pad);
    border-radius: var(--r-control-sm);
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb {
      transition-duration: var(--d-fast);
    }
  }
</style>
