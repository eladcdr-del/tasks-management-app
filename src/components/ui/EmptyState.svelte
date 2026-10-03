<script lang="ts">
  // EmptyState: illustration, a warm title, one line of body, an optional CTA.
  //   <EmptyState title="הכל סגור להיום. אפשר לנשום.">
  //     {#snippet illustration()}<EmptyHome />{/snippet}
  //     {#snippet action()}<Button icon={Plus}>משימה חדשה</Button>{/snippet}
  //   </EmptyState>
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    body?: string;
    illustration?: Snippet;
    action?: Snippet;
    /** Tighter spacing for use inside cards / sheets. */
    compact?: boolean;
    /** Heading level of the title (default h2). */
    level?: 2 | 3;
    class?: string;
  }

  let {
    title,
    body,
    illustration,
    action,
    compact = false,
    level = 2,
    class: className
  }: Props = $props();
</script>

<div class={['empty', { compact }, className]}>
  {#if illustration}<div class="art">{@render illustration()}</div>{/if}
  <svelte:element this={`h${level}`} class="title">{title}</svelte:element>
  {#if body}<p class="body">{body}</p>{/if}
  {#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    padding-block: var(--s8) var(--s7);
    padding-inline: var(--s5);
  }

  .compact {
    padding-block: var(--s5);
  }

  .art {
    inline-size: min(200px, 60%);
    margin-block-end: var(--s5);
    color: var(--ink-3);
  }

  .compact .art {
    inline-size: min(176px, 56%);
    margin-block-end: var(--s4);
  }

  .title {
    max-inline-size: 22ch;
    font: var(--font-headline);
    font-size: 1.25rem;
    line-height: 1.75rem;
    color: var(--ink);
  }

  .body {
    max-inline-size: 30ch;
    margin-block-start: var(--s2);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .action {
    margin-block-start: var(--s6);
  }

  .compact .action {
    margin-block-start: var(--s5);
  }
</style>
