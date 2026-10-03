<script lang="ts">
  // ListRow: a 56px+ row for settings, members and pickers. Rows placed next to each other get an
  // inset hairline between them automatically. Put them inside <Card padding="none">.
  //   - `href` → link, `onclick` → button, neither → static row (may hold its own controls).
  //   - `chevron` adds a "forward" chevron at inline-end (points left in RTL).
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
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
    /** Title is user-entered (names, task titles): dir="auto". */
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
      <Icon
        size={20}
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
        class={flipIcon ? 'flip-rtl' : ''}
      />
    </span>
  {/if}
  <span class="main">
    <span class="title" dir={userText ? 'auto' : undefined}>{title}</span>
    {#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
  </span>
  {#if value}<span class="value">{value}</span>{/if}
  {#if trailing}<span class="trail">{@render trailing()}</span>{/if}
  {#if chevron}
    <ChevronRight size={18} strokeWidth={ICON_STROKE} aria-hidden="true" class="chev flip-rtl" />
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
    --row-inset: var(--s4);
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: 56px;
    padding-block: var(--s2);
    padding-inline: var(--s4);
    color: var(--ink);
    text-align: start;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .has-lead {
    --row-inset: calc(var(--s4) + 36px + var(--s3));
  }

  /* Hairline between consecutive rows, aligned with the text column. */
  :global(.hc-list-row + .hc-list-row::before) {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--row-inset) 0;
    border-block-start: 1px solid var(--line);
  }

  .lead {
    display: grid;
    place-items: center;
    flex: none;
    min-inline-size: 36px;
  }

  .lead.icon {
    inline-size: 36px;
    block-size: 36px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .main {
    display: grid;
    gap: 2px;
    flex: 1;
    min-inline-size: 0;
  }

  .title {
    font: var(--font-body);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subtitle {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .value {
    flex: none;
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .trail {
    display: flex;
    align-items: center;
    flex: none;
  }

  .row :global(.chev) {
    flex: none;
    color: var(--ink-3);
    margin-inline-end: -4px;
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
    outline: 2px solid var(--accent);
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
