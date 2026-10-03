<script lang="ts">
  // SectionHeader: "דורש תשומת לב  (2)  ·········  הכל". Title + optional count + optional action.
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    count?: number;
    /** Tone of the count pill: neutral, or danger for "דורש תשומת לב". */
    tone?: 'neutral' | 'danger' | 'accent';
    actionLabel?: string;
    onaction?: (e: MouseEvent) => void;
    actionHref?: string;
    /** Heading level (default h2). */
    level?: 2 | 3;
    id?: string;
    /** Custom trailing content instead of the action button. */
    trailing?: Snippet;
    class?: string;
  }

  let {
    title,
    count,
    tone = 'neutral',
    actionLabel,
    onaction,
    actionHref,
    level = 2,
    id,
    trailing,
    class: className
  }: Props = $props();
</script>

<div class={['section-header', className]}>
  <svelte:element this={`h${level}`} class="title" {id}>
    <span>{title}</span>
    {#if count !== undefined}
      <span class={['count', 'num', tone]}>{count}</span>
    {/if}
  </svelte:element>
  {#if trailing}
    {@render trailing()}
  {:else if actionLabel && actionHref}
    <a class="action" href={actionHref}>{actionLabel}</a>
  {:else if actionLabel && onaction}
    <button type="button" class="action" onclick={onaction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s3);
    min-block-size: var(--tap-min);
  }

  .title {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    font: var(--font-headline);
    color: var(--ink);
    min-inline-size: 0;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 24px;
    block-size: 22px;
    padding-inline: 7px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    font-weight: 600;
    line-height: 1;
  }

  .count.danger {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .count.accent {
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .action {
    display: inline-grid;
    place-items: center;
    min-block-size: var(--tap-min);
    min-inline-size: var(--tap-min);
    padding-inline: var(--s2);
    margin-inline-end: calc(var(--s2) * -1);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    font: var(--font-callout);
    font-weight: 500;
    text-decoration: none;
  }

  .action:active {
    background: var(--accent-soft);
  }

  .action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
