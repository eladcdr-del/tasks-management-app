<script lang="ts">
  // owner: step 3.3. Up to `max` photos (receipt, result): pick from the gallery or the camera,
  // compress on the phone (platform/image.ts: ≤1600px ≤200 KB + a 240px thumb), show thumbs with ×.
  // `bind:photos` holds the EncodedPhotos ready for tasks.complete().
  import Camera from '@lucide/svelte/icons/camera';
  import X from '@lucide/svelte/icons/x';
  import type { EncodedPhoto } from '$lib/domain/types';
  import { ICON_STROKE, Spinner } from '$components/ui';
  import { encodePhoto } from '$lib/platform/image';
  import { he } from '$lib/i18n/he';

  interface Props {
    photos?: EncodedPhoto[];
    max?: number;
    label?: string;
    /** True while a photo is being compressed (the parent may hold its submit). */
    busy?: boolean;
  }

  let {
    photos = $bindable([]),
    max = 3,
    label = he.sheetComplete.photos,
    busy = $bindable(false)
  }: Props = $props();
  const t = he.taskDetail.pick;
  const id = $props.id();
  let error = $state('');

  async function onpick(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const files = [...(input.files ?? [])].slice(0, max - photos.length);
    input.value = '';
    if (files.length === 0) return;
    error = '';
    busy = true;
    try {
      for (const file of files) {
        try {
          const p = await encodePhoto(file);
          photos = [...photos, p].slice(0, max);
        } catch (err) {
          console.warn('[homecare] photo encode failed', err);
          error = t.photoError;
        }
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="picker" role="group" aria-labelledby="{id}-label">
  <div class="head">
    <span class="label" id="{id}-label">{label}</span>
    <span class="limit">{t.photoLimit(max)}</span>
  </div>
  <ul class="grid">
    {#each photos as p, i (p.thumbDataUrl + i)}
      <li class="thumb">
        <img src={p.thumbDataUrl} alt={he.taskDetail.photo(i + 1)} />
        <button
          type="button"
          class="remove"
          aria-label={t.photoRemove(i + 1)}
          onclick={() => (photos = photos.filter((_, j) => j !== i))}
        >
          <span class="x"><X strokeWidth={ICON_STROKE} aria-hidden="true" /></span>
        </button>
      </li>
    {/each}
    {#if photos.length < max}
      <li>
        <label class="add" aria-busy={busy}>
          {#if busy}
            <Spinner size={20} label={t.photoBusy} />
          {:else}
            <Camera strokeWidth={ICON_STROKE} aria-hidden="true" />
          {/if}
          <span>{t.photoAdd}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onchange={onpick}
            data-testid="photo-input"
          />
        </label>
      </li>
    {/if}
  </ul>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .picker {
    display: grid;
    gap: var(--s2);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--s2);
  }

  .label {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .limit {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-3);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .thumb,
  .add {
    position: relative;
    aspect-ratio: 1;
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .thumb img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    display: block;
  }

  .remove {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
  }

  .x {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--r-pill);
    background: rgb(0 0 0 / 0.55);
    color: #fff;
  }

  .x :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }

  .add {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s1);
    border: 1.5px dashed var(--hairline-strong);
    background: var(--surface-2);
    color: var(--ink-2);
    font: var(--font-caption);
    text-align: center;
    cursor: pointer;
  }

  .add:focus-within {
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .add :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .add input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .error {
    font: var(--font-caption);
    color: var(--danger);
  }
</style>
