<script lang="ts">
  // NumberField: money input with a ₪ prefix, `inputmode="decimal"` (numeric keypad with a dot).
  // `bind:value` is a number or null (empty). Accepts "650", "650.5", "1,200" and a comma decimal
  // ("12,5" → 12.5 when it can't be a thousands separator). Digits render tabular.
  import type { HTMLInputAttributes } from 'svelte/elements';
  import FieldShell from './FieldShell.svelte';
  import { he } from '$lib/i18n/he';

  interface Props extends Omit<
    HTMLInputAttributes,
    'value' | 'children' | 'class' | 'type' | 'min' | 'max'
  > {
    label: string;
    value?: number | null;
    hint?: string;
    error?: string;
    hideLabel?: boolean;
    /** Prefix symbol; default "₪". Pass '' for a plain number. */
    prefix?: string;
    min?: number;
    max?: number;
    class?: string;
  }

  let {
    label,
    value = $bindable(null),
    hint,
    error,
    hideLabel = false,
    prefix = he.ui.currency,
    min,
    max,
    id: idProp,
    disabled = false,
    class: className,
    ...rest
  }: Props = $props();

  const uid = $props.id();
  const id = $derived(idProp ?? `${uid}-input`);
  const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);

  /** Parses user text into a number (or null for empty / unparseable). */
  function parse(text: string): number | null {
    let t = text.replace(/[^\d.,-]/g, '').trim();
    if (!t) return null;
    // "12,5" (comma followed by 1–2 digits at the end, no dot) is a decimal comma.
    if (!t.includes('.') && /,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    t = t.replace(/,/g, '');
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    let clamped = n;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  }

  const fmt = (n: number | null) => (n === null ? '' : String(n));

  let text = $state(fmt(value));
  let lastEmitted: number | null = value;

  // External value changes (reset, prefill) update the text; our own edits don't fight the caret.
  $effect(() => {
    const v = value;
    if (v !== lastEmitted) {
      text = fmt(v);
      lastEmitted = v;
    }
  });

  function oninput(e: Event & { currentTarget: HTMLInputElement }) {
    text = e.currentTarget.value;
    const parsed = parse(text);
    lastEmitted = parsed;
    value = parsed;
  }

  function onblur() {
    text = fmt(value);
  }
</script>

{#snippet sym()}
  <span class="prefix" aria-hidden="true">{prefix}</span>
{/snippet}

<FieldShell
  {id}
  {label}
  {hint}
  {error}
  {hideLabel}
  disabled={!!disabled}
  leading={prefix ? sym : undefined}
  class={className}
>
  <input
    {id}
    type="text"
    inputmode="decimal"
    autocomplete="off"
    class="control num"
    value={text}
    {oninput}
    {onblur}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    {...rest}
  />
</FieldShell>

<style>
  .prefix {
    font: var(--font-headline);
    font-weight: 500;
    color: var(--ink-2);
  }

  input {
    font-variant-numeric: tabular-nums;
  }
</style>
