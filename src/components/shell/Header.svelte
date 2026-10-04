<script lang="ts">
  // owner: step 3.1. Keep the props contract.
  // Screen header: optional back button (arrow mirrors in RTL), title, subtitle, trailing actions.
  // `children` renders under the titles (e.g. Home's date line or a search field).
  import type { Snippet } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import { IconButton } from '$components/ui';
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

<header class="header" class:has-back={!!onBack}>
  {#if onBack}
    <IconButton
      class="back"
      label={he.common.back}
      icon={ArrowLeft}
      flipRtl
      onclick={onBack}
      data-back
    />
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
    padding-block: calc(var(--safe-top) + var(--s5)) var(--s3);
    padding-inline: var(--screen-pad);
  }

  .header :global(.back) {
    flex: none;
    margin-inline-start: calc(-1 * var(--s2));
  }

  .titles {
    display: grid;
    flex: 1;
    gap: var(--s1);
    min-inline-size: 0;
  }

  .has-back .titles {
    padding-block-start: var(--s1-5);
  }

  h1 {
    font: var(--font-title);
    color: var(--ink);
    text-wrap: balance;
  }

  .subtitle {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .actions {
    display: flex;
    flex: none;
    gap: var(--s1);
    margin-inline-end: calc(-1 * var(--s2));
  }
</style>
