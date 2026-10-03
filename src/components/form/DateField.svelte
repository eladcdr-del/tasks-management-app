<script lang="ts">
  // owner: step 3.3 — STUB (1.1 → 3.3); only 3.3 edits this file. Keep the props contract.
  // Date picker for plan / due dates. The stub is a native <input type="date"> (Android Chrome shows
  // its own picker). An emptied field reports `null`.
  import type { ISODate } from '$lib/domain/types';

  interface Props {
    value: ISODate | null;
    /** Earliest selectable date (e.g. today in Asia/Jerusalem). */
    min?: ISODate;
    label?: string;
    onChange: (v: ISODate | null) => void;
  }

  let { value, min, label, onChange }: Props = $props();
  const id = $props.id();
</script>

<div class="field" data-stub="DateField">
  {#if label}<label for={id}>{label}</label>{/if}
  <input
    {id}
    type="date"
    value={value ?? ''}
    {min}
    onchange={(e) => {
      const v = e.currentTarget.value;
      onChange(v === '' ? null : v);
    }}
  />
</div>

<style>
  .field {
    display: grid;
    gap: var(--s1);
  }

  label {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  input {
    min-block-size: var(--tap-min);
    padding-inline: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--ink);
  }
</style>
