<script lang="ts">
  // STUB (orchestrator → 3.3): full-screen photo viewer for the 'photo' sheet
  // ({ name: 'photo', photoId }). Opened from TaskDetail (3.3) and Memory (4.1) with
  // router.openSheet({ name: 'photo', photoId }); Android Back closes it (history-backed sheet).
  // 3.3 implements: load the photo via the tasks/household stores → repo.getPhoto(hid, photoId),
  // show the full image (contain, pinch-zoom optional), a close button, alt text, dark backdrop.
  import { he } from '$lib/i18n/he';

  interface Props {
    photoId: string;
    onClose: () => void;
  }

  let { photoId, onClose }: Props = $props();
</script>

<div class="viewer" role="dialog" aria-modal="true" aria-label={he.common.close} data-photo-id={photoId}>
  <button type="button" class="close" onclick={onClose}>{he.common.close}</button>
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: rgb(0 0 0 / 0.92);
    display: grid;
    place-items: center;
  }

  .close {
    position: absolute;
    inset-block-start: calc(var(--s4) + var(--safe-top));
    inset-inline-end: var(--s4);
    min-block-size: var(--tap-min, 44px);
    min-inline-size: var(--tap-min, 44px);
    color: #fff;
  }
</style>
