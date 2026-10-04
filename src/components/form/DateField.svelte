<script lang="ts">
  // owner: step 3.3 — only 3.3 edits this file.
  // Date picker for plan / due dates. A field-like pill shows the date in words ("מחר · 5 באוקטובר");
  // a transparent native <input type="date"> covers it, so a tap opens Android Chrome's own picker
  // (and `showPicker()` opens it on desktop). An emptied field (or the ×) reports `null`.
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import X from '@lucide/svelte/icons/x';
  import type { ISODate } from '$lib/domain/types';
  import { ICON_STROKE } from '$components/ui';
  import { diffDays, isValidISO } from '$lib/domain/dates';
  import { formatDate, relativeDayLabel } from '$lib/i18n/format';
  import { clock } from '$lib/state/clock.svelte';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: ISODate | null;
    /** Earliest selectable date (e.g. today in Asia/Jerusalem). */
    min?: ISODate;
    label?: string;
    /** Shown while empty (default "בחירת תאריך"). */
    placeholder?: string;
    /** Offer the × to clear (default true). */
    clearable?: boolean;
    onChange: (v: ISODate | null) => void;
  }

  let {
    value,
    min,
    label,
    placeholder = he.taskDetail.pick.pickDate,
    clearable = true,
    onChange
  }: Props = $props();
  const id = $props.id();
  let input: HTMLInputElement | undefined = $state();

  const today = $derived(clock.today);
  const text = $derived.by(() => {
    if (!value || !isValidISO(value)) return '';
    const date = formatDate(value, { today });
    const ahead = diffDays(value, today);
    return ahead >= -1 && ahead <= 1 ? `${relativeDayLabel(value, today)} · ${date}` : date;
  });

  function openPicker() {
    try {
      input?.showPicker?.();
    } catch {
      // Not allowed (no user activation) or unsupported: the tap on the input itself still works.
    }
  }
</script>

<div class="field">
  {#if label}<label class="label" for={id}>{label}</label>{/if}
  <div class={['box', { filled: !!text }]}>
    <CalendarDays class="icon" strokeWidth={ICON_STROKE} aria-hidden="true" />
    <span class="text" aria-hidden="true">{text || placeholder}</span>
    <input
      bind:this={input}
      {id}
      type="date"
      value={value ?? ''}
      {min}
      aria-label={label ? undefined : placeholder}
      onclick={openPicker}
      onchange={(e) => {
        const v = e.currentTarget.value;
        onChange(v === '' ? null : v);
      }}
    />
    {#if clearable && text}
      <button
        type="button"
        class="clear"
        aria-label={he.taskDetail.pick.clearDate}
        onclick={() => onChange(null)}
      >
        <X strokeWidth={ICON_STROKE} aria-hidden="true" />
      </button>
    {/if}
  </div>
</div>

<style>
  .field {
    display: grid;
    gap: var(--s1-5);
  }

  .label {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .box {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s2);
    min-block-size: var(--tap-min);
    padding-inline: var(--s3-5) var(--s1);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--field-edge);
    color: var(--ink-2);
    font: var(--font-callout);
  }

  .box:focus-within {
    box-shadow:
      inset 0 0 0 1px var(--field-edge),
      0 0 0 3px var(--focus-ring);
  }

  .box.filled {
    color: var(--ink);
  }

  .box :global(.icon) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-2);
  }

  .text {
    flex: 1;
    min-inline-size: 0;
    padding-block: var(--s2);
  }

  input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .clear {
    position: relative; /* above the transparent input */
    z-index: 1;
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    border-radius: var(--r-pill);
    color: var(--ink-2);
  }

  .clear :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
</style>
