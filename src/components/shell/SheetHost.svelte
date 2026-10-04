<script lang="ts">
  // owner: step 3.1. Renders the open sheet (router.sheet) inside the BottomSheet primitive.
  //   - `open` follows router.sheet; the last spec is kept in `shown` until `onClosed`, so the
  //     content stays rendered while the sheet animates out (Back, scrim, ×, drag, Escape).
  //   - `onClose` pops the sheet's history entry (router.closeSheet), so the hardware Back button
  //     and the UI never disagree.
  //   - The 'photo' sheet is full-screen (PhotoSheet, owner 3.3), outside the bottom-sheet panel.
  // Sheets render their own visible heading; the panel takes the sheet's title as its accessible
  // name.
  import { BottomSheet } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import type { SheetSpec } from '$lib/router/routes';
  import QuickAddSheet from '../../sheets/QuickAddSheet.svelte';
  import CompleteSheet from '../../sheets/CompleteSheet.svelte';
  import RequestSheet from '../../sheets/RequestSheet.svelte';
  import SnoozeSheet from '../../sheets/SnoozeSheet.svelte';
  import JarSetupSheet from '../../sheets/JarSetupSheet.svelte';
  import PhotoSheet from '../../sheets/PhotoSheet.svelte';

  type PanelSpec = Exclude<SheetSpec, { name: 'photo' }>;

  const LABELS: Record<PanelSpec['name'], string> = {
    quickAdd: he.sheetQuickAdd.title,
    complete: he.sheetComplete.title,
    request: he.sheetRequest.title,
    snooze: he.sheetSnooze.title,
    jarSetup: he.jar.setup.title
  };

  const live = $derived(router.sheet);
  const photo = $derived(live?.name === 'photo' ? live : null);
  const panelLive = $derived(live && live.name !== 'photo' ? live : null);

  // The last panel spec, kept through the exit animation.
  let shown = $state.raw<PanelSpec | null>(null);
  $effect.pre(() => {
    if (panelLive) shown = panelLive;
  });

  const close = () => void router.closeSheet();
</script>

{#if photo}
  <PhotoSheet photoId={photo.photoId} onClose={close} />
{/if}

{#if shown}
  {@const spec = shown}
  <BottomSheet
    open={panelLive !== null}
    onClose={close}
    onClosed={() => {
      if (!panelLive) shown = null;
    }}
    label={LABELS[spec.name]}
  >
    <div class="sheet-body" data-sheet={spec.name}>
      {#key spec}
        {#if spec.name === 'quickAdd'}
          <QuickAddSheet onClose={close} />
        {:else if spec.name === 'complete'}
          <CompleteSheet taskId={spec.taskId} onClose={close} />
        {:else if spec.name === 'request'}
          <RequestSheet taskId={spec.taskId} onClose={close} />
        {:else if spec.name === 'snooze'}
          <SnoozeSheet taskId={spec.taskId} onClose={close} />
        {:else if spec.name === 'jarSetup'}
          <JarSetupSheet onClose={close} />
        {/if}
      {/key}
    </div>
  </BottomSheet>
{/if}
