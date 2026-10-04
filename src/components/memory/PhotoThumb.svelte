<script lang="ts">
  // owner: step 3.3. A stored photo's thumbnail (240px JPEG) that opens the full-screen viewer.
  // A warm sand placeholder holds the space while it loads.
  import ImageIcon from '@lucide/svelte/icons/image';
  import { ICON_STROKE } from '$components/ui';
  import { router } from '$lib/router/router.svelte';
  import { loadPhoto } from './photos';

  interface Props {
    photoId: string;
    /** Accessible name of the button ("תמונה 1"). */
    label: string;
    /** Edge length in px (square). */
    size?: number;
    /** Open the viewer on tap (default true). Pass false inside another link. */
    interactive?: boolean;
  }

  let { photoId, label, size = 72, interactive = true }: Props = $props();

  let src = $state<string | null>(null);
  $effect(() => {
    const id = photoId;
    let alive = true;
    src = null;
    void loadPhoto(id).then((p) => {
      if (alive) src = p?.thumbDataUrl ?? null;
    });
    return () => {
      alive = false;
    };
  });
</script>

{#snippet face()}
  {#if src}
    <img {src} alt="" />
  {:else}
    <ImageIcon strokeWidth={ICON_STROKE} aria-hidden="true" />
  {/if}
{/snippet}

{#if interactive}
  <button
    type="button"
    class="thumb"
    style:--size="{size}px"
    aria-label={label}
    data-photo-id={photoId}
    onclick={() => router.openSheet({ name: 'photo', photoId })}
  >
    {@render face()}
  </button>
{:else}
  <span class="thumb" style:--size="{size}px" data-photo-id={photoId} role="img" aria-label={label}>
    {@render face()}
  </span>
{/if}

<style>
  .thumb {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--size);
    block-size: var(--size);
    min-inline-size: var(--size);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--surface-2);
    color: var(--ink-3);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
</style>
