<script lang="ts">
  // Card: the white (dark: warm-brown) surface everything sits on. 22px radius, warm soft shadow,
  // a hairline edge in dark mode.
  //   - `href` → <a>, `onclick` → <button> (whole card is one target; no nested controls inside).
  //   - For cards WITH nested controls (TaskCard: completion circle + open), keep the Card static
  //     and put a stretched link on the title: `<a class="stretched">` + `position:relative` here.
  import type { Snippet } from 'svelte';

  type Padding = 'none' | 'sm' | 'md' | 'lg';

  interface Props {
    padding?: Padding;
    /** `sunken` = a sand well (surface-2) without shadow, for grouped secondary content. */
    tone?: 'raised' | 'flat' | 'sunken';
    as?: 'div' | 'article' | 'section' | 'li';
    href?: string;
    onclick?: (e: MouseEvent) => void;
    /** Accessible name when the card is a link/button with complex content. */
    label?: string;
    class?: string;
    children: Snippet;
  }

  let {
    padding = 'md',
    tone = 'raised',
    as = 'div',
    href,
    onclick,
    label,
    class: className,
    children
  }: Props = $props();

  const classes = $derived(['card', `pad-${padding}`, tone, className]);
</script>

{#if href}
  <a {href} class={[...classes, 'interactive']} aria-label={label}>{@render children()}</a>
{:else if onclick}
  <button type="button" class={[...classes, 'interactive']} aria-label={label} {onclick}>
    {@render children()}
  </button>
{:else}
  <svelte:element this={as} class={classes}>{@render children()}</svelte:element>
{/if}

<style>
  .card {
    position: relative;
    display: block;
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    color: var(--ink);
    text-align: start;
    text-decoration: none;
  }

  .flat {
    box-shadow: none;
    border: 1px solid var(--line);
  }

  .sunken {
    background: var(--surface-2);
    box-shadow: none;
    border: 0;
  }

  .pad-none {
    padding: 0;
  }

  .pad-sm {
    padding: var(--s3);
  }

  .pad-md {
    padding: var(--card-pad);
  }

  .pad-lg {
    padding: var(--s5);
  }

  button.card {
    inline-size: 100%;
  }

  .interactive {
    transition:
      transform var(--d-fast) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out);
  }

  .interactive:active {
    transform: scale(0.985);
    box-shadow: 0 1px 2px rgb(74 44 24 / 0.06);
  }

  @media (hover: hover) {
    .interactive:hover {
      box-shadow: var(--sh-2);
    }
  }

  .interactive:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .interactive:active {
      transform: none;
    }
  }
</style>
