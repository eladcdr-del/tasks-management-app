<script lang="ts">
  // FieldShell: shared frame for TextField / TextArea / NumberField: label, the input box (with
  // optional adornments), hint and error. Not used directly by screens.
  import type { Snippet } from 'svelte';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import { ICON_STROKE } from './types';

  interface Props {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    /** Visually hide the label (still announced). */
    hideLabel?: boolean;
    disabled?: boolean;
    multiline?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
    /** Right side of the label row, e.g. a character counter. */
    aside?: Snippet;
    children: Snippet;
    class?: string;
  }

  let {
    id,
    label,
    hint,
    error,
    hideLabel = false,
    disabled = false,
    multiline = false,
    leading,
    trailing,
    aside,
    children,
    class: className
  }: Props = $props();
</script>

<div class={['field', { invalid: !!error, disabled, multiline }, className]}>
  <div class={['label-row', { 'visually-hidden': hideLabel }]}>
    <label for={id} class="label">{label}</label>
    {#if aside}<span class="aside">{@render aside()}</span>{/if}
  </div>
  <div class="box">
    {#if leading}<span class="adorn lead">{@render leading()}</span>{/if}
    {@render children()}
    {#if trailing}<span class="adorn trail">{@render trailing()}</span>{/if}
  </div>
  {#if error}
    <p id="{id}-error" class="msg error">
      <CircleAlert strokeWidth={ICON_STROKE} aria-hidden="true" class="msg-icon" />
      <span>{error}</span>
    </p>
  {:else if hint}
    <p id="{id}-hint" class="msg hint">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--s2);
    min-inline-size: 0;
  }

  .label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s3);
  }

  .label {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }

  .aside {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .box {
    position: relative;
    display: flex;
    align-items: center;
    min-block-size: var(--btn-h);
    border-radius: var(--r-md);
    background: var(--surface);
    /* --field-edge is ≥ 3:1 on --surface and --bg (WCAG 1.4.11). */
    box-shadow: inset 0 0 0 1px var(--field-edge);
    transition:
      box-shadow var(--d-base) var(--ease-out),
      background-color var(--d-base) var(--ease-out);
  }

  .multiline .box {
    align-items: stretch;
  }

  .box:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--focus-ring),
      0 0 0 4px color-mix(in srgb, var(--focus-ring) 16%, transparent);
  }

  .invalid .box {
    box-shadow: inset 0 0 0 1.5px var(--danger);
  }

  .invalid .box:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--danger),
      0 0 0 4px color-mix(in srgb, var(--danger) 14%, transparent);
  }

  .disabled .box {
    background: var(--surface-2);
    box-shadow: none;
  }

  /* The control itself (input / textarea) is rendered by the wrapping component. */
  .box :global(.control) {
    flex: 1;
    min-inline-size: 0;
    inline-size: 100%;
    min-block-size: var(--btn-h);
    padding-inline: var(--s4);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--ink);
    font: var(--font-body);
    outline: none;
    text-align: start;
  }

  .box :global(.control::placeholder) {
    color: var(--placeholder);
    opacity: 1;
  }

  .box :global(.control:disabled) {
    color: var(--ink-3);
  }

  .multiline .box :global(.control) {
    padding-block: var(--s3-5);
    resize: none;
    line-height: var(--lh-body);
  }

  .adorn {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--ink-2);
  }

  .adorn :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .lead {
    padding-inline-start: var(--s4);
    margin-inline-end: calc(var(--s2) * -1);
  }

  .trail {
    padding-inline-end: var(--s2);
  }

  .msg {
    display: flex;
    align-items: flex-start;
    gap: var(--s1-5);
    font: var(--font-caption);
    font-weight: 400;
  }

  .hint {
    color: var(--ink-2);
  }

  .error {
    color: var(--danger);
    font-weight: 500;
  }

  .error :global(.msg-icon) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    margin-block-start: 0.05em;
  }
</style>
