<script lang="ts">
  // ListRow: a 56px+ row for settings, members and pickers. Rows placed next to each other get a
  // hairline between them automatically, inset on the CONTENT edges: it starts at the text column
  // and stops at the row's inline-end padding. Put them inside <Card padding="none">, or bleed them
  // to a sheet's edges with `--row-pad: var(--sheet-pad)` and a matching negative margin.
  //   - `href` → link, `onclick` → button, neither → static row (may hold its own controls).
  //   - `chevron` adds a "forward" chevron at inline-end (points left in RTL).
  // Titles wrap (no truncation), and icons scale with the text.
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { textDir } from '$lib/i18n/textDir';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  interface Props {
    title: string;
    subtitle?: string;
    /** Secondary value at inline-end ("פעילות"). */
    value?: string;
    icon?: IconComponent;
    /** Mirror a directional leading icon in RTL (e.g. log-out). */
    flipIcon?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    chevron?: boolean;
    danger?: boolean;
    /** Title is user-entered (names, task titles): direction via textDir(). */
    userText?: boolean;
    class?: string;
  }

  let {
    title,
    subtitle,
    value,
    icon: Icon,
    flipIcon = false,
    leading,
    trailing,
    href,
    onclick,
    chevron = false,
    danger = false,
    userText = false,
    class: className
  }: Props = $props();

  const classes = $derived([
    'row',
    'hc-list-row',
    { interactive: !!(href || onclick), danger, 'has-lead': !!(leading || Icon) },
    className
  ]);
</script>

{#snippet content()}
  {#if leading}
    <span class="lead">{@render leading()}</span>
  {:else if Icon}
    <span class="lead icon">
      <Icon strokeWidth={ICON_STROKE} aria-hidden="true" class={['ic', { 'flip-rtl': flipIcon }]} />
    </span>
  {/if}
  <span class="main">
    <span class="title" dir={userText ? textDir(title) : undefined}>{title}</span>
    {#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
  </span>
  {#if value}<span class="value">{value}</span>{/if}
  {#if trailing}<span class="trail">{@render trailing()}</span>{/if}
  {#if chevron}
    <ChevronRight strokeWidth={ICON_STROKE} aria-hidden="true" class="chev flip-rtl" />
  {/if}
{/snippet}

{#if href}
  <a {href} class={classes}>{@render content()}</a>
{:else if onclick}
  <button type="button" class={classes} {onclick}>{@render content()}</button>
{:else}
  <div class={classes}>{@render content()}</div>
{/if}

<style>
  .row {
    --pad: var(--row-pad, var(--s4));
    --lead: calc(var(--icon-md) + var(--s4)); /* 36px at 100%, grows with the text */
    --row-inset: var(--pad);
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: 56px;
    padding-block: var(--s2);
    padding-inline: var(--pad);
    color: var(--ink);
    text-align: start;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .has-lead {
    --row-inset: calc(var(--pad) + var(--lead) + var(--s3));
  }

  /* Hairline between consecutive rows: from the text column to the inline-end content edge. */
  :global(.hc-list-row + .hc-list-row::before) {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--row-inset) var(--pad);
    border-block-start: 1px solid var(--line);
  }

  .lead {
    display: grid;
    place-items: center;
    flex: none;
    min-inline-size: var(--lead);
  }

  .lead.icon {
    inline-size: var(--lead);
    block-size: var(--lead);
    border-radius: var(--r-control-sm);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .lead :global(.ic) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .main {
    display: grid;
    gap: var(--s0-5);
    flex: 1;
    min-inline-size: 0;
  }

  .title {
    font: var(--font-body);
    font-weight: 500;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .subtitle {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .value {
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 45%;
    font: var(--font-callout);
    color: var(--ink-2);
    text-align: end;
  }

  .trail {
    display: flex;
    align-items: center;
    flex: none;
  }

  .row :global(.chev) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-3);
    margin-inline-end: calc(var(--s1) * -1);
  }

  .danger .title {
    color: var(--danger);
  }

  .danger .lead.icon {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .interactive {
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .interactive:active {
    background: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  @media (hover: hover) {
    .interactive:hover {
      background: color-mix(in srgb, var(--surface-2) 45%, transparent);
    }
  }

  .interactive:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
    border-radius: var(--r-md);
  }

  /* Rows inside a rounded card: round the first/last press highlight with it. */
  .row:first-child {
    border-start-start-radius: inherit;
    border-start-end-radius: inherit;
  }

  .row:last-child {
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
  }
</style>
