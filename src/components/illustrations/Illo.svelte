<script lang="ts">
  // Shared frame for the empty-state illustrations: one viewBox (200×160), one stroke weight, one
  // palette, all from tokens, so every scene adapts to dark mode and they read as a family.
  // Classes for children:  .l line · .lt thin line · .f-surface · .f-sand · .f-soft · .f-sage
  //                        · .f-accent · .s-accent (accent line) · .f-line (solid line colour)
  import type { Snippet } from 'svelte';

  interface Props {
    /** Accessible description; omit for decorative use (the usual case, next to a heading). */
    title?: string;
    class?: string;
    children: Snippet;
  }

  let { title, class: className, children }: Props = $props();
</script>

<svg
  class={['illo', className]}
  viewBox="0 0 200 160"
  role={title ? 'img' : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  {@render children()}
</svg>

<style>
  .illo {
    --illo-line: color-mix(in oklab, var(--ink-2) 82%, var(--ink-3));
    --illo-sage: color-mix(in oklab, var(--sage) 38%, var(--surface));
    display: block;
    inline-size: 100%;
    block-size: auto;
    overflow: visible;
  }

  .illo :global(*) {
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .illo :global(.l),
  .illo :global(.lt),
  .illo :global(.s-accent) {
    fill: none;
    stroke-width: 2.5;
  }

  .illo :global(.l) {
    stroke: var(--illo-line);
  }

  .illo :global(.lt) {
    stroke: var(--illo-line);
    stroke-width: 2;
    opacity: 0.55;
  }

  .illo :global(.s-accent) {
    stroke: var(--accent);
  }

  .illo :global(.f-surface) {
    fill: var(--surface);
  }

  .illo :global(.f-sand) {
    fill: var(--surface-2);
  }

  .illo :global(.f-soft) {
    fill: var(--accent-soft);
  }

  .illo :global(.f-sage) {
    fill: var(--illo-sage);
  }

  .illo :global(.f-accent) {
    fill: var(--accent);
  }

  .illo :global(.f-line) {
    fill: var(--illo-line);
  }

  /* Filled shapes that also carry an outline. */
  .illo :global(.o) {
    stroke: var(--illo-line);
    stroke-width: 2.5;
  }
</style>
