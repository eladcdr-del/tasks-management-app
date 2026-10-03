<script lang="ts">
  // Gallery section frame: a title, an optional one-line note, and the specimens.
  import type { Snippet } from 'svelte';

  interface Props {
    id: string;
    title: string;
    note?: string;
    children: Snippet;
  }

  let { id, title, note, children }: Props = $props();
</script>

<section class="g-section" aria-labelledby="g-{id}" data-section={id}>
  <header class="g-head">
    <h2 id="g-{id}">{title}</h2>
    {#if note}<p>{note}</p>{/if}
  </header>
  <div class="g-body">
    {@render children()}
  </div>
</section>

<style>
  .g-section {
    display: grid;
    gap: var(--s5);
    padding-block: var(--s8) 0;
  }

  .g-head {
    display: grid;
    gap: var(--s1);
    padding-block-start: var(--s5);
    border-block-start: 1px solid var(--line);
  }

  h2 {
    font: var(--font-title);
    color: var(--ink);
  }

  p {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .g-body {
    display: grid;
    gap: var(--s6);
  }
</style>
