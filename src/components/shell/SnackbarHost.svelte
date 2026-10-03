<script lang="ts">
  // STUB (1.1 → 3.1): live region for Snackbars ("בוצע · ביטול", 5s, with action/undo).
  // Step 3.1 replaces this file; the snackbar queue itself lives in src/lib/state/ui.svelte.ts (2.4).
</script>

<div class="host" role="status" aria-live="polite" data-stub="SnackbarHost"></div>

<style>
  .host {
    position: fixed;
    inset-inline: var(--s4);
    inset-block-end: calc(var(--nav-h) + var(--safe-bottom) + var(--s3));
    z-index: var(--z-snackbar);
    pointer-events: none;
  }
</style>
