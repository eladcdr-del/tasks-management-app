<script lang="ts">
  // TextField: label, hint, error; `dir="auto"` so Hebrew, English and mixed text each align right.
  // `bind:value`. Extra input attributes (maxlength, enterkeyhint, autocomplete…) pass through.
  // To autofocus inside a BottomSheet, add `data-autofocus` (the sheet focuses it on open).
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import FieldShell from './FieldShell.svelte';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  interface Props extends Omit<HTMLInputAttributes, 'value' | 'children' | 'class'> {
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    hideLabel?: boolean;
    icon?: IconComponent;
    trailing?: Snippet;
    aside?: Snippet;
    class?: string;
  }

  let {
    label,
    value = $bindable(''),
    hint,
    error,
    hideLabel = false,
    icon: Icon,
    trailing,
    aside,
    id: idProp,
    type = 'text',
    disabled = false,
    class: className,
    ...rest
  }: Props = $props();

  const uid = $props.id();
  const id = $derived(idProp ?? `${uid}-input`);
  const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
</script>

{#snippet lead()}
  {#if Icon}<Icon size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />{/if}
{/snippet}

<FieldShell
  {id}
  {label}
  {hint}
  {error}
  {hideLabel}
  disabled={!!disabled}
  leading={Icon ? lead : undefined}
  {trailing}
  {aside}
  class={className}
>
  <input
    {id}
    {type}
    class="control"
    dir="auto"
    bind:value
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    {...rest}
  />
</FieldShell>
