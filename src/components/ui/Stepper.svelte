<script lang="ts">
  // Stepper: − value + (jar target 3–50). In RTL "−" sits on the right, "+" on the left, following
  // the reading direction. The value is announced politely on change. `bind:value`.
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';

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
    class: className
  }: Props = $props();

  const uid = $props.id();

  function change(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    value = next;
    onchange?.(next);
    haptic('select');
  }
</script>

<div class={['stepper', className]} role="group" aria-labelledby="{uid}-l">
  <span id="{uid}-l" class="visually-hidden">{label}</span>
  <button
    type="button"
    class="step"
    aria-label={he.dev.ui.decrease}
    disabled={disabled || value <= min}
    onclick={() => change(-step)}
  >
    <Minus size={20} strokeWidth={2} aria-hidden="true" />
  </button>
  <output class="value" aria-live="polite" aria-atomic="true">
    <span class="num n">{value}</span>
    {#if suffix}<span class="suffix">{suffix}</span>{/if}
  </output>
  <button
    type="button"
    class="step"
    aria-label={he.dev.ui.increase}
    disabled={disabled || value >= max}
    onclick={() => change(step)}
  >
    <Plus size={20} strokeWidth={2} aria-hidden="true" />
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
    background: light-dark(var(--surface), #43382f);
    color: var(--ink);
    box-shadow: 0 1px 2px rgb(74 44 24 / 0.1);
    border: 1px solid light-dark(transparent, #4d4037);
    transition:
      transform var(--d-fast) var(--ease-out),
      background-color var(--d-fast) var(--ease-out);
  }

  .step:active:not(:disabled) {
    transform: scale(0.92);
    background: light-dark(color-mix(in oklab, var(--surface), var(--ink) 5%), #4d4037);
  }

  .step:disabled {
    background: transparent;
    box-shadow: none;
    border-color: transparent;
    color: var(--ink-3);
  }

  .step:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .value {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
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
