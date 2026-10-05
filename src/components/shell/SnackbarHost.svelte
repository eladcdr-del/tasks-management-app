<script lang="ts">
  // owner: step 3.1. The one live region for Snackbars ("בוצע · ביטול", 5 s, with action/undo).
  // The queue lives in ui.svelte.ts (2.4); the Snackbar primitive runs the timer and calls
  // onDismiss, which removes that snackbar from the queue. A keyed item per message restarts the
  // timer per message. Sits above the bottom nav when there is one, else above the safe area; and
  // above the FAB while it shows (Home, Memory) and a screen's fixed action bar (task detail:
  // בוצע / דחייה), so the main buttons never hide behind a message.
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
  <!-- One keyed item per message (the timer restarts per message). The item keeps its own
       message while it fades out, so a timer firing then removes only that message, even after
       the queue moved on or emptied. -->
  {#each snack ? [snack] : [] as item (item.id)}
    <div class="slot">
      <Snackbar
        message={item.message}
        actionLabel={item.action}
        onAction={item.onAction}
        duration={item.duration}
        onDismiss={() => ui.dismiss(item.id)}
      />
    </div>
  {/each}
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

  /* FabHost (not hidden): the 56px FAB sits --s4 above the nav. */
  :global(body:has([data-fab-host]:not([inert]))) .host.above-nav {
    inset-block-end: calc(var(--nav-h) + var(--safe-bottom) + var(--s4) + 56px + var(--s3));
  }

  /* A fixed bottom action bar ([data-action-bar]): a 52px button, --s3 padding and a 1px rule. */
  :global(body:has([data-action-bar])) .host {
    inset-block-end: calc(var(--safe-bottom) + 52px + 2 * var(--s3) + 1px + var(--s3));
  }

  .slot {
    inline-size: min(100%, var(--content-max));
    pointer-events: auto;
  }
</style>
