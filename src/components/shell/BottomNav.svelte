<script lang="ts">
  // STUB (1.1 → 3.1): bottom navigation, 4 tabs in RTL order from the right.
  // Step 3.1 replaces this file (icons, polish); keep the props contract.
  import { he } from '$lib/i18n/he';
  import { TABS, TAB_ROUTE, href, type TabId } from '$lib/router/routes';

  interface Props {
    active: TabId;
  }

  let { active }: Props = $props();
</script>

<nav class="nav" aria-label={he.shell.navLabel} data-stub="BottomNav">
  {#each TABS as tab (tab)}
    <a href={href(TAB_ROUTE[tab])} aria-current={tab === active ? 'page' : undefined}>
      {he.shell.tabs[tab]}
    </a>
  {/each}
</nav>

<style>
  .nav {
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: var(--z-nav);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    block-size: calc(var(--nav-h) + var(--safe-bottom));
    padding-block-end: var(--safe-bottom);
    background: var(--surface);
    border-block-start: 1px solid var(--line);
  }

  a {
    display: grid;
    place-items: center;
    min-block-size: var(--tap-min);
    font: var(--font-caption);
    color: var(--ink-2);
    text-decoration: none;
  }

  a[aria-current='page'] {
    color: var(--accent-ink);
    font-weight: 600;
  }
</style>
