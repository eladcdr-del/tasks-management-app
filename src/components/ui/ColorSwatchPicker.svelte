<script lang="ts">
  /*
   * ColorSwatchPicker: choose a member colour (onboarding, settings). Native radios inside labels,
   * so the browser gives radio semantics, arrow keys and one Tab stop. Each swatch is a 44px hit
   * area around a 28px dot; the selected dot is ringed in ink (selection is ink, never a tint).
   * Each radio's accessible name is the colour's Hebrew name (he.ui.memberColors). `bind:value`.
   *
   *   <ColorSwatchPicker label="הצבע שלי" bind:value={color} taken={['slate']} />
   */
  import type { MemberColor } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';

  const ALL: MemberColor[] = ['terracotta', 'sage', 'slate', 'plum', 'ochre', 'teal'];

  interface Props {
    /** The group's accessible name. */
    label: string;
    value?: MemberColor;
    /** Colours to offer (default: all six). */
    colors?: MemberColor[];
    /** Colours already used by someone else: shown but disabled. */
    taken?: MemberColor[];
    onchange?: (color: MemberColor) => void;
    class?: string;
  }

  let {
    label,
    value = $bindable(),
    colors = ALL,
    taken = [],
    onchange,
    class: className
  }: Props = $props();

  const name = $props.id();

  function pick(c: MemberColor) {
    value = c;
    onchange?.(c);
  }
</script>

<div class={['swatch-picker', className]} role="radiogroup" aria-label={label}>
  {#each colors as c (c)}
    <label class="swatch" data-member-color={c}>
      <input
        type="radio"
        class="visually-hidden"
        {name}
        value={c}
        checked={value === c}
        disabled={taken.includes(c) && value !== c}
        aria-label={he.ui.memberColors[c]}
        onchange={() => pick(c)}
      />
      <span class="dot" aria-hidden="true"></span>
    </label>
  {/each}
</div>

<style>
  .swatch-picker {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--s1);
  }

  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    border-radius: var(--r-pill);
    cursor: pointer;
  }

  .dot {
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--m-base);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent);
    transition:
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-base) var(--ease-out);
  }

  input:checked + .dot {
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 5px var(--select-ring);
    transform: scale(0.86);
  }

  input:disabled + .dot {
    opacity: 0.35;
  }

  .swatch:has(input:disabled) {
    cursor: not-allowed;
  }

  input:focus-visible + .dot {
    outline: 2px solid var(--focus-ring);
    outline-offset: 6px;
  }
</style>
