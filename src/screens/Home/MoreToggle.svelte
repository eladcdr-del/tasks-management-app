<script lang="ts">
  // The last line of a folded block on Home: "עוד 6 ⌄" opens it, "פחות ⌃" folds it back. A full-width
  // row on the block's surface, aligned with the task titles above it.
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { he } from '$lib/i18n/he';

  interface Props {
    open: boolean;
    /** Tasks the folded block hides. */
    hidden: number;
    /** The block's name, for screen readers ("בית ותיקונים"). */
    name: string;
    /** id of the list it opens. */
    controls: string;
    ontoggle: () => void;
  }

  let { open, hidden, name, controls, ontoggle }: Props = $props();
  const t = he.home.groups;
</script>

<button
  type="button"
  class={['more', { open }]}
  aria-expanded={open}
  aria-controls={controls}
  aria-label={open ? t.lessLabel(name) : t.moreLabel(hidden, name)}
  data-more={open ? 'less' : 'more'}
  onclick={ontoggle}
>
  <span class="label">{open ? t.less : t.more(hidden)}</span>
  <ChevronDown class="chev" strokeWidth={2} aria-hidden="true" />
</button>

<style>
  .more {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s1);
    inline-size: 100%;
    min-block-size: var(--tap-min);
    padding-inline: 50px var(--s4);
    color: var(--accent-ink);
    font: var(--font-callout);
    font-weight: 500;
    text-align: start;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  /* The same inset hairline as between the rows. */
  .more::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: 50px 0;
    border-block-start: 1px solid var(--line);
  }

  .more:active {
    background: var(--surface-2);
  }

  .more:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .more :global(.chev) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    transition: rotate var(--d-base) var(--ease-out);
  }

  .open :global(.chev) {
    rotate: 180deg;
  }

  @media (prefers-reduced-motion: reduce) {
    .more :global(.chev) {
      transition: none;
    }
  }
</style>
