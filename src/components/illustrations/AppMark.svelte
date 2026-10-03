<script lang="ts">
  /*
   * AppMark: the HomeCare brand mark. A soft, round-cornered house with a check knocked out of
   * it (the check is real transparency, so it shows whatever is behind: cream, a card, dark mode).
   *
   *   <AppMark size={48} />            inline mark in var(--accent) (adapts to dark mode)
   *   <AppMark size={512} tile />      app icon: terracotta house on a cream rounded tile, kept
   *                                    inside the maskable safe zone (r = 40% of the canvas)
   *   <AppMark mono />                 currentColor, for one-colour contexts
   *
   * Step 5.1 exports `tile` at 512 as public/icons/source.svg.
   */
  interface Props {
    size?: number;
    /** Cream rounded-square tile behind the mark (the home-screen icon). */
    tile?: boolean;
    /** Single colour (currentColor). */
    mono?: boolean;
    /** Accessible name; omit when the word "HomeCare" is next to it. */
    title?: string;
    class?: string;
  }

  let { size = 48, tile = false, mono = false, title, class: className }: Props = $props();

  const uid = $props.id();
  const maskId = `${uid}-mask`;
  const gradId = `${uid}-grad`;

  // A soft house: a broad, rounded roof peak, gentle eaves, generous base corners.
  const HOUSE =
    'M221.7 155.6Q256 128 290.3 155.6L368.2 218.4Q390 236 390 264V350Q390 394 346 394H166' +
    'Q122 394 122 350V264Q122 236 143.8 218.4Z';
  const CHECK = 'M206 304L242 339L308 271';
  // Tight square crop around the house for inline use; the full 512 canvas for the tile.
  const viewBox = $derived(tile ? '0 0 512 512' : '116 128 280 280');
</script>

<svg
  class={['appmark', { tile, mono }, className]}
  width={size}
  height={size}
  {viewBox}
  role={title ? 'img' : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  <defs>
    <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <path d={HOUSE} fill="#fff" />
      <path
        d={CHECK}
        fill="none"
        stroke="#000"
        stroke-width="36"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </mask>
    {#if tile}
      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#E2875C" />
        <stop offset="1" stop-color="#D2703F" />
      </linearGradient>
    {/if}
  </defs>
  {#if tile}
    <rect class="tile-bg" width="512" height="512" rx="116" />
  {/if}
  <rect
    class="house"
    x="0"
    y="0"
    width="512"
    height="512"
    mask="url(#{maskId})"
    style:fill={tile ? `url(#${gradId})` : undefined}
  />
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

  .mono .house {
    fill: currentColor;
  }

  /* The icon is brand-fixed: terracotta on cream in every theme. */
  .tile-bg {
    fill: #fbf6ef;
  }
</style>
