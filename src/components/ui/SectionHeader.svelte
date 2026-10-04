<script lang="ts">
  // SectionHeader: "דורש תשומת לב  (2)  ·········  הכל". Title + optional count + optional action.
  // tone="danger" turns the count into the solid danger pill (the attention block only).
  // The title wraps and the count pill grows with large text.
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    count?: number;
    /** Tone of the count pill: neutral, or solid danger for "דורש תשומת לב". */
    tone?: 'neutral' | 'danger';
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
    <span class="t">{title}</span>
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
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s1) var(--s2);
    min-inline-size: 0;
    font: var(--font-headline);
    color: var(--ink);
  }

  .t {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 1.85em;
    min-block-size: 1.7em;
    padding-inline: 0.55em;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    font-weight: 600;
    line-height: 1;
  }

  .count.danger {
    background: var(--danger-solid);
    color: var(--on-danger);
  }

  .action {
    display: inline-grid;
    place-items: center;
    flex: none;
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
    background: var(--surface-2);
  }

  .action:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
</style>
