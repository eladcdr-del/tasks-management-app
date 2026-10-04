<script lang="ts">
  // owner: step 3.1. Shared layout for the onboarding, join and setup screens: an optional hero
  // (illustration), a title + lead, the step's content, and the actions pinned to the bottom of
  // the screen on tall phones (they follow the content when it is long).
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    lead?: string;
    hero?: Snippet;
    children?: Snippet;
    actions?: Snippet;
    /** Centre the hero + titles (welcome, setup). */
    centered?: boolean;
    /** data-screen attribute for tests. */
    screen: string;
  }

  let { title, lead, hero, children, actions, centered = false, screen }: Props = $props();
</script>

<section class="frame" class:centered data-screen={screen}>
  <div class="top">
    {#if hero}<div class="hero">{@render hero()}</div>{/if}
    <h1>{title}</h1>
    {#if lead}<p class="lead">{lead}</p>{/if}
  </div>
  {#if children}<div class="content">{@render children()}</div>{/if}
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</section>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: var(--s6);
    min-block-size: 100dvh;
    padding-block: calc(var(--safe-top) + var(--s8)) calc(var(--safe-bottom) + var(--s6));
    padding-inline: var(--screen-pad);
  }

  :global(.demo-banner ~ main) .frame {
    min-block-size: calc(100dvh - 48px);
  }

  .top {
    display: grid;
    gap: var(--s3);
  }

  .centered .top {
    margin-block-start: auto;
    justify-items: center;
    text-align: center;
  }

  .hero {
    margin-block-end: var(--s2);
  }

  h1 {
    font: var(--font-display);
    color: var(--ink);
    text-wrap: balance;
  }

  .lead {
    max-inline-size: 34ch;
    font: var(--font-body);
    color: var(--ink-2);
    text-wrap: pretty;
  }

  .content {
    display: grid;
    gap: var(--s5);
  }

  .actions {
    display: grid;
    gap: var(--s3);
    margin-block-start: auto;
  }
</style>
