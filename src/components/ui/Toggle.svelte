<script lang="ts">
  // Toggle: a settings row: label (+ description) at inline-start, a switch at inline-end.
  // A native checkbox with role="switch" underneath, so Space, labels and screen readers just work.
  // The whole row (≥ 56px) is the hit target. `bind:checked`.
  // The thumb travels towards inline-end (left in RTL): the direction comes from :dir(), so the
  // switch follows the element's own resolved direction.
  import { haptic } from '$lib/platform/haptics';

  interface Props {
    checked?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
    /** Hide the visible label (switch only); the label is still announced. */
    hideLabel?: boolean;
    /** Play the light "select" haptic on change (opt-in; most switches should stay silent). */
    haptics?: boolean;
    class?: string;
  }

  let {
    checked = $bindable(false),
    label,
    description,
    disabled = false,
    onchange,
    hideLabel = false,
    haptics = false,
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
      if (haptics) haptic('select');
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
    padding-block: var(--s2);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .compact {
    display: inline-flex;
    min-block-size: var(--tap-min);
    min-inline-size: var(--tap-min);
    padding-block: 0;
  }

  .text {
    display: grid;
    gap: var(--s0-5);
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
    --travel: calc(var(--w) - var(--h));
    --dir: 1;
    position: relative;
    flex: none;
    inline-size: var(--w);
    block-size: var(--h);
    border-radius: var(--r-pill);
    background: var(--control-off);
    box-shadow: var(--sh-inset);
    transition: background-color var(--d-base) var(--ease-out);
  }

  /* RTL: the thumb travels the other way (towards inline-end = left). */
  .track:dir(rtl) {
    --dir: -1;
  }

  .thumb {
    position: absolute;
    inset-block-start: calc((var(--h) - var(--t)) / 2);
    inset-inline-start: calc((var(--h) - var(--t)) / 2);
    inline-size: var(--t);
    block-size: var(--t);
    border-radius: var(--r-pill);
    background: var(--control-thumb);
    box-shadow: var(--sh-thumb);
    transition: translate var(--d-base) var(--ease-out);
  }

  input:checked + .track {
    background: var(--accent-strong);
  }

  input:checked + .track .thumb {
    translate: calc(var(--travel) * var(--dir)) 0;
  }

  input:focus-visible + .track {
    outline: 2px solid var(--focus-ring);
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
