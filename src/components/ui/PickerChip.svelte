<script lang="ts">
  /*
   * PickerChip: a compact "field" button in a sheet that opens a picker ("מתי · מחר 17:30",
   * "מי · דני"). Shows `label` (quiet) and the current `value` (ink), or "בחירה" while empty.
   * With a value and `onclear`, a trailing × clears it (its own ≥ 44px hit area).
   * The pill grows with large text (min-block-size, em padding, wrapping, em icons).
   *
   *   <PickerChip label="מתי" value={when} icon={Calendar} onclick={openWhen}
   *               onclear={() => (when = null)} />
   */
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import X from '@lucide/svelte/icons/x';
  import { he } from '$lib/i18n/he';
  import { textDir } from '$lib/i18n/textDir';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'value'> {
    label: string;
    value?: string | null;
    icon?: IconComponent;
    /** The value is user-entered (a member name): direction via textDir(). */
    userText?: boolean;
    onclear?: () => void;
    /** Accessible name of the × (default "הסרת {label}"). */
    clearLabel?: string;
  }

  let {
    label,
    value = null,
    icon: Icon,
    userText = false,
    onclear,
    clearLabel,
    class: className,
    ...rest
  }: Props = $props();

  const filled = $derived(value != null && value !== '');
</script>

<span class={['picker-chip', { filled }, className]}>
  <button type="button" class="main" aria-haspopup="dialog" {...rest}>
    {#if Icon}<Icon class="pc-icon" strokeWidth={ICON_STROKE} aria-hidden="true" />{/if}
    <span class="text">
      <!-- the spaces are expressions: Svelte trims whitespace at the edges of a tag ("מי·בחירה"),
           and they sit outside the hidden dot so the button's name is "מי בחירה" -->
      <span class="label">{label}</span>{' '}<span class="sep" aria-hidden="true">·</span>{' '}<span
        class="value"
        dir={filled && userText ? textDir(value) : undefined}>{filled ? value : he.ui.choose}</span
      >
    </span>
    {#if !(filled && onclear)}
      <ChevronDown class="pc-icon chev" strokeWidth={ICON_STROKE} aria-hidden="true" />
    {/if}
  </button>
  {#if filled && onclear}
    <button
      type="button"
      class="clear"
      aria-label={clearLabel ?? he.ui.remove(label)}
      onclick={onclear}
    >
      <X class="pc-icon" strokeWidth={ICON_STROKE} aria-hidden="true" />
    </button>
  {/if}
</span>

<style>
  .picker-chip {
    display: inline-flex;
    align-items: stretch;
    max-inline-size: 100%;
    min-block-size: 2.5rem;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    color: var(--ink);
    font: var(--font-callout);
  }

  .filled {
    background: var(--select-soft);
    box-shadow: inset 0 0 0 1.5px var(--select-ring);
  }

  .main {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    min-inline-size: 0;
    min-block-size: var(--tap-min);
    margin-block: -2px;
    padding-block: 0.35em;
    padding-inline: 0.85em;
    border-radius: inherit;
    text-align: start;
    color: inherit;
  }

  .filled:has(.clear) .main {
    padding-inline-end: 0.2em;
  }

  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .label,
  .sep {
    color: var(--ink-2);
  }

  .value {
    font-weight: 500;
  }

  .picker-chip:not(.filled) .value {
    color: var(--ink-2);
  }

  .picker-chip :global(.pc-icon) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .picker-chip :global(.chev) {
    color: var(--ink-2);
  }

  .clear {
    display: grid;
    place-items: center;
    flex: none;
    min-inline-size: var(--tap-min);
    min-block-size: var(--tap-min);
    margin-block: -2px;
    border-radius: inherit;
    color: var(--ink-2);
  }

  .main:focus-visible,
  .clear:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .picker-chip:not(.filled):hover {
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hairline-strong), var(--ink) 20%);
    }
  }
</style>
