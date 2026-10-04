<script lang="ts">
  // owner: step 3.3. One editable field of the task ("מתי · מחר"): a row that opens its picker in
  // place (progressive disclosure: the detail screen stays calm until a field is touched).
  import type { Snippet } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { ICON_STROKE, type IconComponent } from '$components/ui';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';

  interface Props {
    label: string;
    value: string | null;
    icon: IconComponent;
    open?: boolean;
    /** The value is user text (direction via textDir). */
    userText?: boolean;
    /** A small marker after the value (e.g. the hard-deadline lock). */
    badge?: Snippet;
    children: Snippet;
    name?: string;
  }

  let {
    label,
    value,
    icon: Icon,
    open = $bindable(false),
    userText = false,
    badge,
    children,
    name
  }: Props = $props();
  const uid = $props.id();
</script>

<div class={['field-row', { open }]} data-field={name}>
  <button
    type="button"
    class="head"
    aria-expanded={open}
    aria-controls="{uid}-body"
    onclick={() => (open = !open)}
  >
    <span class="icon"><Icon strokeWidth={ICON_STROKE} aria-hidden="true" /></span>
    <span class="label">{label}</span>
    <span class={['value', { empty: !value }]} dir={userText && value ? textDir(value) : undefined}>
      {value ?? he.taskDetail.none}
      {#if badge}{@render badge()}{/if}
    </span>
    <ChevronDown class="chev" strokeWidth={ICON_STROKE} aria-hidden="true" />
  </button>
  <div id="{uid}-body" class="body" hidden={!open}>
    {#if open}{@render children()}{/if}
  </div>
</div>

<style>
  .field-row + :global(.field-row) {
    border-block-start: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: 56px;
    padding-inline: var(--s4);
    text-align: start;
    color: var(--ink);
    border-radius: var(--r-md);
  }

  .head:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 3px var(--focus-ring);
  }

  .icon {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .icon :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .label {
    flex: none;
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .value {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--s1-5);
    flex: 1;
    min-inline-size: 0;
    font: var(--font-callout);
    font-weight: 500;
    text-align: end;
    overflow-wrap: anywhere;
  }

  .value.empty {
    color: var(--ink-3);
    font-weight: 400;
  }

  .head :global(.chev) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-3);
    transition: transform var(--d-base) var(--ease-out);
  }

  .open .head :global(.chev) {
    transform: rotate(180deg);
  }

  .body {
    padding: var(--s1) var(--s4) var(--s4);
  }
</style>
