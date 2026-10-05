<script lang="ts">
  /*
   * AppMark: the HomeCare brand mark. A folded-paper house in two tones, split down the ridge:
   * the two halves are the two people who share the home.
   *
   *   <AppMark size={48} />            inline mark in var(--accent), right half a shade deeper
   *                                    (adapts to dark mode)
   *   <AppMark size={512} tile />      app icon: cream/sand house on a terracotta rounded tile,
   *                                    kept inside the maskable safe zone (r = 40% of the canvas)
   *   <AppMark size={512} fullBleed /> maskable icon: terracotta fills the whole square (the OS
   *                                    applies its own mask); same house, same safe zone
   *   <AppMark mono />                 the whole house in currentColor, for one-colour contexts
   *
   * scripts/generate-icons.mjs draws the same geometry (HOUSE / RIGHT / colours): keep in sync.
   */
  interface Props {
    size?: number;
    /** Terracotta rounded-square tile behind the mark (the home-screen icon). */
    tile?: boolean;
    /** Maskable icon: square, edge-to-edge terracotta (implies the tile colours). */
    fullBleed?: boolean;
    /** Single colour (currentColor). */
    mono?: boolean;
    /** Accessible name; omit when the word "HomeCare" is next to it. */
    title?: string;
    class?: string;
  }

  let {
    size = 48,
    tile = false,
    fullBleed = false,
    mono = false,
    title,
    class: className
  }: Props = $props();

  const boxed = $derived(tile || fullBleed);

  const uid = $props.id();
  const gradId = `${uid}-grad`;

  // The house (softened ridge, gently rounded base corners) and its right half. The whole house is
  // filled and the right half laid over it, so no seam can show between the halves.
  const HOUSE =
    'M256 140Q260 140 264 143.5L375 240Q380 244 380 250V370Q380 384 366 384H146' +
    'Q132 384 132 370V250Q132 244 137 240L248 143.5Q252 140 256 140Z';
  const RIGHT = 'M256 140Q260 140 264 143.5L375 240Q380 244 380 250V370Q380 384 366 384H256Z';
  // On the tile the house is drawn ×1.14 around its centre (its corners stay inside r = 40%).
  const HOUSE_TRANSFORM = 'translate(256 262) scale(1.14) translate(-256 -262)';
  // Tight square crop around the house for inline use; the full 512 canvas for the tile.
  const viewBox = $derived(boxed ? '0 0 512 512' : '120 128 272 272');
</script>

<svg
  class={['appmark', { tile: boxed, fullBleed, mono }, className]}
  width={size}
  height={size}
  {viewBox}
  role={title ? 'img' : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  {#if boxed}
    <defs>
      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#E3885D" />
        <stop offset="1" stop-color="#CF6A3D" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx={fullBleed ? 0 : 116} fill="url(#{gradId})" />
  {/if}
  <g transform={boxed ? HOUSE_TRANSFORM : undefined}>
    <path class="house" d={HOUSE} />
    {#if !mono}
      <path class="right" d={RIGHT} />
    {/if}
  </g>
</svg>

<style>
  .appmark {
    display: block;
    flex: none;
    max-inline-size: none;
  }

  .house {
    fill: var(--accent);
  }

  .right {
    fill: color-mix(in oklab, var(--accent) 78%, #000);
  }

  .mono .house {
    fill: currentColor;
  }

  /* The icon is brand-fixed: cream and sand on terracotta in every theme. */
  .tile .house {
    fill: #fbf6ef;
  }

  .tile .right {
    fill: #e9cdb2;
  }
</style>
