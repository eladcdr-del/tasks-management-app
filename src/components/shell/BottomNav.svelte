<script lang="ts">
  // owner: step 3.1. Bottom navigation: 4 tabs in RTL order from the right (Blueprint §7).
  // Each link carries `data-tab`, so the router's click handler takes the tab path
  // (router.navigateTab: leaving Home pushes, tab → tab replaces, Back goes Home).
  // App.svelte hides it while a sheet is open or the on-screen keyboard is up (`hidden`).
  import House from '@lucide/svelte/icons/house';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Amphora from '@lucide/svelte/icons/amphora';
  import UsersRound from '@lucide/svelte/icons/users-round';
  import { he } from '$lib/i18n/he';
  import { TABS, TAB_ROUTE, href, type TabId } from '$lib/router/routes';
  import { ICON_STROKE, type IconComponent } from '$components/ui';

  interface Props {
    active: TabId;
    /** Slide out of the way (keyboard open, sheet open). */
    hidden?: boolean;
  }

  let { active, hidden = false }: Props = $props();

  const ICONS: Record<TabId, IconComponent> = {
    home: House,
    memory: BookOpen,
    jar: Amphora,
    household: UsersRound
  };
</script>

<nav
  class="nav"
  class:hidden
  aria-label={he.shell.navLabel}
  aria-hidden={hidden || undefined}
  inert={hidden}
>
  {#each TABS as tab (tab)}
    {@const Icon = ICONS[tab]}
    <a
      href={href(TAB_ROUTE[tab])}
      data-tab={tab}
      aria-current={tab === active ? 'page' : undefined}
    >
      <span class="pill" aria-hidden="true">
        <Icon size={22} strokeWidth={tab === active ? 2.25 : ICON_STROKE} />
      </span>
      <span class="label">{he.shell.tabs[tab]}</span>
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
    min-block-size: calc(var(--nav-h) + var(--safe-bottom));
    padding-block-end: var(--safe-bottom);
    padding-inline: max(var(--s2), var(--safe-left), var(--safe-right));
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(12px);
    border-block-start: 1px solid var(--line);
    transition:
      transform var(--d-base) var(--ease-out),
      opacity var(--d-base) var(--ease-out);
  }

  .nav.hidden {
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }

  a {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    min-block-size: var(--tap-min);
    padding-block: var(--s1-5);
    color: var(--ink-3);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .pill {
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 30px;
    border-radius: var(--r-pill);
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .label {
    font: var(--font-caption);
    text-align: center;
  }

  a[aria-current='page'] {
    color: var(--ink);
  }

  a[aria-current='page'] .pill {
    background: var(--select-soft);
  }

  a[aria-current='page'] .label {
    font-weight: 600;
  }

  a:focus-visible {
    outline: none;
  }

  a:focus-visible .pill {
    box-shadow: var(--focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav {
      transition: opacity var(--d-fast) linear;
    }
    .nav.hidden {
      transform: none;
    }
  }
</style>
