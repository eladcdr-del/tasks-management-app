<script lang="ts">
  // owner: step 3.1 — STUB (1.1 → 3.1); only 3.1 edits this file. No props.
  // App.svelte mounts this only where ROUTE_META[route].fab is true (Home, Memory). Placeholder "+"
  // that opens QuickAdd; step 3.1 swaps in the Fab primitive from 1.4 (inline-end, above the nav).
  import Plus from '@lucide/svelte/icons/plus';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
</script>

<button
  type="button"
  class="fab"
  aria-label={he.shell.fab}
  data-stub="FabHost"
  onclick={() => router.openSheet({ name: 'quickAdd' })}
>
  <Plus size={28} aria-hidden="true" />
</button>

<style>
  .fab {
    position: fixed;
    inset-inline-end: calc(var(--screen-pad) + max(0px, (100vw - var(--content-max)) / 2));
    inset-block-end: calc(var(--nav-h) + var(--safe-bottom) + var(--s4));
    z-index: var(--z-fab);
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    box-shadow: var(--sh-2);
  }
</style>
