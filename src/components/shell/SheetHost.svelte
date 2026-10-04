<script lang="ts">
  // STUB (1.1 → 3.1): renders the open sheet (router.sheet) in a placeholder panel.
  // Step 3.1 replaces the panel with the BottomSheet from 1.4 (drag, focus trap, inert background);
  // keep the sheet-name → component mapping.
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import QuickAddSheet from '../../sheets/QuickAddSheet.svelte';
  import CompleteSheet from '../../sheets/CompleteSheet.svelte';
  import RequestSheet from '../../sheets/RequestSheet.svelte';
  import SnoozeSheet from '../../sheets/SnoozeSheet.svelte';
  import JarSetupSheet from '../../sheets/JarSetupSheet.svelte';
  import PhotoSheet from '../../sheets/PhotoSheet.svelte';

  const sheet = $derived(router.sheet);
  const close = () => router.closeSheet();
  // The 'photo' sheet is full-screen (PhotoSheet, owner 3.3), outside the bottom-sheet panel.
</script>

<svelte:window
  onkeydown={(e) => {
    if (sheet && e.key === 'Escape') close();
  }}
/>

{#if sheet && sheet.name === 'photo'}
  <PhotoSheet photoId={sheet.photoId} onClose={close} />
{:else if sheet}
  <button type="button" class="scrim" aria-label={he.common.close} onclick={close}></button>
  <div class="panel" role="dialog" aria-modal="true" data-sheet={sheet.name}>
    {#if sheet.name === 'quickAdd'}
      <QuickAddSheet onClose={close} />
    {:else if sheet.name === 'complete'}
      <CompleteSheet taskId={sheet.taskId} onClose={close} />
    {:else if sheet.name === 'request'}
      <RequestSheet taskId={sheet.taskId} onClose={close} />
    {:else if sheet.name === 'snooze'}
      <SnoozeSheet taskId={sheet.taskId} onClose={close} />
    {:else if sheet.name === 'jarSetup'}
      <JarSetupSheet onClose={close} />
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    background: var(--scrim);
  }

  .panel {
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: var(--z-sheet);
    max-block-size: 90dvh;
    overflow: auto;
    padding: var(--s6) var(--screen-pad) calc(var(--s6) + var(--safe-bottom));
    border-start-start-radius: var(--r-xl);
    border-start-end-radius: var(--r-xl);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-sheet);
  }
</style>
