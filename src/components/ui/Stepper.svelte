<script lang="ts">
  // Stepper: − value + (jar target 3–50). In RTL "−" sits on the right, "+" on the left, following
  // the reading direction. The value is announced politely on change. `bind:value`.
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { ICON_STROKE } from './types';

  interface Props {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    /** Accessible name of the group, e.g. "יעד הצנצנת". */
    label: string;
    /** Unit after the number, e.g. "משימות". */
    suffix?: string;
    onchange?: (value: number) => void;
    disabled?: boolean;
    /** Play the light "select" haptic on each step (opt-in). */
    haptics?: boolean;
    class?: string;
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 99,
    step = 1,
    label,
    suffix,
    onchange,
    disabled = false,
    haptics = false,
    class: className
  }: Props = $props();

  const uid = $props.id();

  function change(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    value = next;
    onchange?.(next);
    if (haptics) haptic('select');
  }
</script>

<div class={['stepper', className]} role="group" aria-labelledby="{uid}-l">
  <span id="{uid}-l" class="visually-hidden">{label}</span>
  <button
    type="button"
    class="step"
    aria-label={he.ui.decrease}
    disabled={disabled || value <= min}
    onclick={() => change(-step)}
  >
    <Minus size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
  </button>
  <output class="value" aria-live="polite" aria-atomic="true">
    <span class="num n">{value}</span>
    {#if suffix}<span class="suffix">{suffix}</span>{/if}
  </output>
  <button
    type="button"
    class="step"
    aria-label={he.ui.increase}
    disabled={disabled || value >= max}
    onclick={() => change(step)}
  >
    <Plus size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
  </button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    padding: var(--s1);
    border-radius: var(--r-pill);
    background: var(--surface-2);
  }

  .step {
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    border-radius: var(--r-pill);
    background: var(--surface-raised);
    color: var(--ink);
    box-shadow: var(--sh-raised);
    border: 1px solid var(--surface-raised-edge);
    transition:
      transform var(--d-fast) var(--ease-out),
      background-color var(--d-fast) var(--ease-out);
  }

  .step:active:not(:disabled) {
    transform: scale(0.92);
    background: var(--surface-raised-press);
  }

  .step:disabled {
    background: transparent;
    box-shadow: none;
    border-color: transparent;
    color: var(--ink-3);
  }

  .step:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .value {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--s1-5);
    min-inline-size: 5.5rem;
    padding-inline: var(--s2);
  }

  .n {
    font: var(--font-title);
    color: var(--ink);
  }

  .suffix {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .step:active:not(:disabled) {
      transform: none;
    }
  }
</style>
