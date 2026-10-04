<script lang="ts">
  // owner: step 3.3. Full-screen photo viewer for the 'photo' sheet ({ name: 'photo', photoId }).
  // Opened from TaskDetail and Memory with router.openSheet; Android Back pops the sheet entry and
  // closes it, as do the × button, Escape (SheetHost) and a tap on the backdrop.
  import X from '@lucide/svelte/icons/x';
  import ImageOff from '@lucide/svelte/icons/image-off';
  import type { Photo } from '$lib/domain/types';
  import { ICON_STROKE, Spinner } from '$components/ui';
  import { loadPhoto } from '$components/memory/photos';
  import { he } from '$lib/i18n/he';

  interface Props {
    photoId: string;
    onClose: () => void;
  }

  let { photoId, onClose }: Props = $props();

  let photo = $state.raw<Photo | null | undefined>(undefined);
  let closeBtn: HTMLButtonElement | undefined = $state();

  $effect(() => {
    const id = photoId;
    let alive = true;
    photo = undefined;
    void loadPhoto(id).then((p) => {
      if (alive) photo = p;
    });
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    closeBtn?.focus({ preventScroll: true });
  });
</script>

<div
  class="viewer"
  role="dialog"
  aria-modal="true"
  aria-label={he.taskDetail.photo(1)}
  data-photo-id={photoId}
  data-testid="photo-viewer"
>
  <button type="button" class="backdrop" tabindex="-1" aria-hidden="true" onclick={onClose}
  ></button>
  {#if photo === undefined}
    <Spinner size={28} label={he.common.loading} class="state" />
  {:else if photo === null}
    <div class="state missing">
      <ImageOff strokeWidth={ICON_STROKE} aria-hidden="true" />
      <p>{he.memory.photoMissing}</p>
    </div>
  {:else}
    <img
      src={photo.dataUrl}
      width={photo.width}
      height={photo.height}
      alt={he.taskDetail.photo(1)}
    />
  {/if}
  <button
    bind:this={closeBtn}
    type="button"
    class="close"
    aria-label={he.common.close}
    onclick={onClose}
  >
    <X strokeWidth={ICON_STROKE} aria-hidden="true" />
  </button>
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: grid;
    place-items: center;
    padding: calc(var(--safe-top) + 64px) var(--s3) calc(var(--safe-bottom) + var(--s6));
    background: rgb(12 9 7 / 0.94);
    animation: fade-in var(--d-base) var(--ease-out);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .viewer {
      animation-duration: 1ms;
    }
  }

  .backdrop {
    position: absolute;
    inset: 0;
  }

  img {
    position: relative;
    max-inline-size: 100%;
    max-block-size: 100%;
    inline-size: auto;
    block-size: auto;
    object-fit: contain;
    border-radius: var(--r-sm);
    box-shadow: 0 12px 48px rgb(0 0 0 / 0.5);
  }

  .viewer :global(.state) {
    position: relative;
    color: rgb(255 255 255 / 0.8);
  }

  .missing {
    display: grid;
    justify-items: center;
    gap: var(--s2);
    font: var(--font-callout);
  }

  .missing :global(svg) {
    inline-size: var(--icon-lg);
    block-size: var(--icon-lg);
  }

  .close {
    position: absolute;
    inset-block-start: calc(var(--s3) + var(--safe-top));
    inset-inline-end: var(--s3);
    display: grid;
    place-items: center;
    inline-size: 48px;
    block-size: 48px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.14);
    color: #fff;
    backdrop-filter: blur(8px);
  }

  .close:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
  }

  .close :global(svg) {
    inline-size: 24px;
    block-size: 24px;
  }
</style>
