<script lang="ts">
  // TextArea: like TextField, multi-line. Grows with its content (field-sizing) from `rows` up to
  // `maxRows`, then scrolls. Optional live counter when `maxlength` is set.
  import type { HTMLTextareaAttributes } from 'svelte/elements';
  import FieldShell from './FieldShell.svelte';
  import { textDir } from '$lib/i18n/textDir';

  interface Props extends Omit<HTMLTextareaAttributes, 'value' | 'children' | 'class'> {
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    hideLabel?: boolean;
    rows?: number;
    maxRows?: number;
    /** Show "12/4000" next to the label (needs maxlength). */
    counter?: boolean;
    class?: string;
  }

  let {
    label,
    value = $bindable(''),
    hint,
    error,
    hideLabel = false,
    rows = 3,
    maxRows = 8,
    counter = false,
    id: idProp,
    disabled = false,
    placeholder,
    maxlength,
    class: className,
    ...rest
  }: Props = $props();

  const uid = $props.id();
  const id = $derived(idProp ?? `${uid}-input`);
  const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
  const count = $derived((value ?? '').length);
</script>

{#snippet counterText()}
  <span class="num">{count}/{maxlength}</span>
{/snippet}

<FieldShell
  {id}
  {label}
  {hint}
  {error}
  {hideLabel}
  multiline
  disabled={!!disabled}
  aside={counter && maxlength ? counterText : undefined}
  class={className}
>
  <textarea
    {id}
    class="control"
    dir={textDir(value || placeholder)}
    {placeholder}
    {rows}
    {maxlength}
    bind:value
    {disabled}
    style:--rows={rows}
    style:--max-rows={maxRows}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    {...rest}></textarea>
</FieldShell>

<style>
  textarea.control {
    field-sizing: content;
    min-block-size: calc(var(--rows) * var(--lh-body) + 28px);
    max-block-size: calc(var(--max-rows) * var(--lh-body) + 28px);
  }
</style>
