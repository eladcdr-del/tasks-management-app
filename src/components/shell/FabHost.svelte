<script lang="ts">
  // owner: step 3.1. No props. App.svelte mounts this only where ROUTE_META[route].fab is true
  // (Home, Memory) and hides it while a sheet or the keyboard is open (`hidden`). The Fab primitive
  // sits at inline-end, above the bottom nav; it collapses to a circle while scrolling down.
  import { Fab } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';

  let { hidden = false }: { hidden?: boolean } = $props();

  let extended = $state(true);
  let lastY = 0;

  function onscroll() {
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 8) return;
    extended = y < lastY || y < 24;
    lastY = y;
  }
</script>

<svelte:window {onscroll} />

<div class="fab-host" class:hidden inert={hidden} data-fab-host>
  <Fab
    label={he.shell.fab}
    {extended}
    data-fab
    onclick={() => router.openSheet({ name: 'quickAdd' })}
  />
</div>

<style>
  .fab-host {
    position: fixed;
    inset-inline-end: calc(var(--screen-pad) + max(0px, (100vw - var(--content-max)) / 2));
    inset-block-end: calc(var(--nav-h) + var(--safe-bottom) + var(--s4));
    z-index: var(--z-fab);
    transition:
      transform var(--d-base) var(--ease-out),
      opacity var(--d-base) var(--ease-out);
  }

  .fab-host.hidden {
    transform: translateY(calc(var(--nav-h) + 80px));
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab-host.hidden {
      transform: none;
    }
  }
</style>
