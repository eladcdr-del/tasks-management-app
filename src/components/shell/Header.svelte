<script lang="ts">
  // owner: step 3.1 — STUB (1.1 → 3.1); only 3.1 edits this file. Keep the props contract.
  // Screen header: optional back button (arrow mirrors in RTL), title, subtitle, trailing actions.
  // `children` renders under the titles (e.g. Home's date line or a search field).
  import type { Snippet } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import { he } from '$lib/i18n/he';

  interface Props {
    title?: string;
    subtitle?: string;
    /** Shows a back button that calls this (screens usually pass `() => router.back('/…')`). */
    onBack?: () => void;
    /** Trailing (inline-end) actions, e.g. an IconButton. */
    actions?: Snippet;
    children?: Snippet;
  }

  let { title, subtitle, onBack, actions, children }: Props = $props();
</script>

<header class="header" data-stub="Header">
  {#if onBack}
    <button type="button" class="back" aria-label={he.common.back} onclick={onBack}>
      <ArrowLeft class="flip-rtl" size={24} aria-hidden="true" />
    </button>
  {/if}
  <div class="titles">
    {#if title}<h1>{title}</h1>{/if}
    {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
    {@render children?.()}
  </div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .header {
    display: flex;
    align-items: flex-start;
    gap: var(--s2);
    padding-block: calc(var(--safe-top) + var(--s4)) var(--s2);
    padding-inline: var(--screen-pad);
  }

  .back {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    margin-inline-start: calc(-1 * var(--s3));
    border-radius: var(--r-pill);
    color: var(--ink);
  }

  .titles {
    display: grid;
    flex: 1;
    gap: var(--s1);
    min-inline-size: 0;
    padding-block-start: var(--s2);
  }

  h1 {
    font: var(--font-title);
    color: var(--ink);
  }

  .subtitle {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .actions {
    display: flex;
    flex: none;
    gap: var(--s1);
  }
</style>
