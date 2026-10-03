<script lang="ts">
  // A labelled row of specimens inside a gallery section.
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** Layout of the specimens. */
    layout?: 'row' | 'stack' | 'grid';
    children: Snippet;
  }

  let { label, layout = 'row', children }: Props = $props();
</script>

<div class="g-group">
  <p class="g-label">{label}</p>
  <div class={['g-items', layout]}>
    {@render children()}
  </div>
</div>

<style>
  .g-group {
    display: grid;
    gap: var(--s3);
  }

  .g-label {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .g-items.row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s2) var(--s3);
  }

  .g-items.stack {
    display: grid;
    gap: var(--s3);
  }

  .g-items.grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s3);
  }
</style>
