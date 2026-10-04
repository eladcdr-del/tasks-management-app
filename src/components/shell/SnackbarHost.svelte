<script lang="ts">
  // owner: step 3.1. The one live region for Snackbars ("בוצע · ביטול", 5 s, with action/undo).
  // The queue lives in ui.svelte.ts (2.4); the Snackbar primitive runs the timer and calls
  // onDismiss, which removes that snackbar from the queue. `{#key id}` restarts the timer per
  // message. Sits above the bottom nav when there is one, else above the safe area.
  import { Snackbar } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { ui } from '$lib/state/ui.svelte';

  let { aboveNav = false }: { aboveNav?: boolean } = $props();

  const snack = $derived(ui.current);
</script>

<div
  class="host"
  class:above-nav={aboveNav}
  role="status"
  aria-live="polite"
  aria-label={he.shell.snackbarRegion}
  data-snackbar-host
>
  {#if snack}
    {#key snack.id}
      <div class="slot">
        <Snackbar
          message={snack.message}
          actionLabel={snack.action}
          onAction={snack.onAction}
          duration={snack.duration}
          onDismiss={() => ui.dismiss(snack.id)}
        />
      </div>
    {/key}
  {/if}
</div>

<style>
  .host {
    position: fixed;
    inset-inline: var(--s4);
    inset-block-end: calc(var(--safe-bottom) + var(--s4));
    z-index: var(--z-snackbar);
    display: grid;
    justify-items: center;
    pointer-events: none;
  }

  .host.above-nav {
    inset-block-end: calc(var(--nav-h) + var(--safe-bottom) + var(--s3));
  }

  .slot {
    inline-size: min(100%, var(--content-max));
    pointer-events: auto;
  }
</style>
