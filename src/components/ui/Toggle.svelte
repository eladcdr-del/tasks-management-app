<script lang="ts">
  // Toggle: a settings row: label (+ description) at inline-start, a switch at inline-end.
  // A native checkbox with role="switch" underneath, so Space, labels and screen readers just work.
  // The whole row (≥ 56px) is the hit target. `bind:checked`.
  import { haptic } from '$lib/platform/haptics';

  interface Props {
    checked?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
    /** Hide the visible label (switch only); the label is still announced. */
    hideLabel?: boolean;
    class?: string;
  }

  let {
    checked = $bindable(false),
    label,
    description,
    disabled = false,
    onchange,
    hideLabel = false,
    class: className
  }: Props = $props();

  const uid = $props.id();
</script>

<label class={['toggle', { disabled, compact: hideLabel }, className]}>
  <span class={['text', { 'visually-hidden': hideLabel }]}>
    <span class="label">{label}</span>
    {#if description}<span class="desc" id="{uid}-d">{description}</span>{/if}
  </span>
  <input
    type="checkbox"
    role="switch"
    class="visually-hidden"
    bind:checked
    {disabled}
    aria-describedby={description ? `${uid}-d` : undefined}
    onchange={() => {
      haptic('select');
      onchange?.(checked);
    }}
  />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</label>

<style>
  .toggle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s4);
    min-block-size: 56px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .compact {
    display: inline-flex;
    min-block-size: var(--tap-min);
    min-inline-size: var(--tap-min);
  }

  .text {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .label {
    font: var(--font-body);
    color: var(--ink);
  }

  .desc {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .track {
    --w: 52px;
    --h: 32px;
    --t: 26px;
    position: relative;
    flex: none;
    inline-size: var(--w);
    block-size: var(--h);
    border-radius: var(--r-pill);
    background: color-mix(in oklab, var(--surface-2), var(--ink-3) 45%);
    box-shadow: inset 0 1px 2px rgb(43 36 32 / 0.08);
    transition: background-color var(--d-base) var(--ease-out);
  }

  .thumb {
    position: absolute;
    inset-block-start: calc((var(--h) - var(--t)) / 2);
    inset-inline-start: calc((var(--h) - var(--t)) / 2);
    inline-size: var(--t);
    block-size: var(--t);
    border-radius: var(--r-pill);
    background: light-dark(#fff, #f4ece3);
    box-shadow:
      0 1px 2px rgb(43 36 32 / 0.2),
      0 2px 6px rgb(43 36 32 / 0.12);
    transition: transform var(--d-base) var(--ease-out);
  }

  input:checked + .track {
    background: var(--accent-strong);
  }

  /* On = thumb at inline-end (left in RTL). */
  input:checked + .track .thumb {
    transform: translateX(calc(var(--w) - var(--h)));
  }

  :global([dir='rtl']) input:checked + .track .thumb {
    transform: translateX(calc((var(--w) - var(--h)) * -1));
  }

  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .disabled {
    cursor: default;
  }

  .disabled .track {
    opacity: 0.45;
  }

  .disabled .label {
    color: var(--ink-2);
  }
</style>
