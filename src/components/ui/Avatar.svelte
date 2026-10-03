<script lang="ts">
  // Avatar: a Google photo, or the first letter on the member's soft tint, inside a ring of the
  // member colour. `unassigned` draws the dashed "?" used for tasks nobody has taken yet.
  // The ring gap takes `--avatar-gap` (defaults to --surface); set it to the backdrop colour
  // when the avatar sits on something else (AvatarStack does this).
  import type { MemberColor } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';

  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  interface Props {
    name?: string;
    photoURL?: string | null;
    color?: MemberColor;
    size?: Size;
    /** The dashed "?" for unassigned tasks. */
    unassigned?: boolean;
    /** Accessible name. Defaults to the name (or "עדיין לא נלקחה" when unassigned). */
    label?: string;
    /** Hide from assistive tech when the name is already next to the avatar. */
    decorative?: boolean;
    /** Draw the member-colour ring (default true). */
    ring?: boolean;
    class?: string;
  }

  let {
    name = '',
    photoURL = null,
    color = 'terracotta',
    size = 'md',
    unassigned = false,
    label,
    decorative = false,
    ring = true,
    class: className
  }: Props = $props();

  const PX: Record<Size, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 };

  let failed = $state(false);
  $effect(() => {
    // A new URL deserves a fresh attempt.
    void photoURL;
    failed = false;
  });

  /** First user-perceived character, so Hebrew letters and emoji names both work. */
  const initial = $derived.by(() => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const seg = new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(trimmed);
    const first = seg[Symbol.iterator]().next().value?.segment ?? '';
    return first.toLocaleUpperCase('he');
  });

  const px = $derived(PX[size]);
  const showPhoto = $derived(!unassigned && !!photoURL && !failed);
  const accessible = $derived(label ?? (unassigned ? he.dev.ui.unassigned : name));
</script>

<span
  class={['avatar', size, { ring: ring && !unassigned, unassigned }, className]}
  style:--px="{px}px"
  data-member-color={unassigned ? undefined : color}
  role={decorative ? undefined : 'img'}
  aria-label={decorative ? undefined : accessible}
  aria-hidden={decorative ? 'true' : undefined}
>
  <span class="face">
    {#if unassigned}
      <span class="glyph" aria-hidden="true">?</span>
    {:else if showPhoto}
      <img
        src={photoURL}
        alt=""
        width={px}
        height={px}
        referrerpolicy="no-referrer"
        decoding="async"
        draggable="false"
        onerror={() => (failed = true)}
      />
    {:else}
      <span class="glyph" aria-hidden="true">{initial}</span>
    {/if}
  </span>
</span>

<style>
  .avatar {
    --ring-w: 2px;
    --gap-w: 2px;
    position: relative;
    display: inline-grid;
    place-items: center;
    inline-size: var(--px);
    block-size: var(--px);
    border-radius: var(--r-pill);
    flex: none;
    font-size: calc(var(--px) * 0.42);
    font-weight: 600;
    line-height: 1;
    user-select: none;
    -webkit-user-select: none;
  }

  .xs,
  .sm {
    --ring-w: 1.5px;
    --gap-w: 1.5px;
  }

  .xl {
    --ring-w: 2.5px;
    --gap-w: 3px;
  }

  .face {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    overflow: hidden;
    border-radius: inherit;
    background: var(--avatar-face, var(--m-soft));
    color: var(--m-ink);
  }

  /* Ring: member colour, separated from the face by a gap in the backdrop colour. */
  .ring {
    padding: calc(var(--ring-w) + var(--gap-w));
    background: var(--avatar-gap, var(--surface));
    box-shadow: inset 0 0 0 var(--ring-w) var(--m-base);
  }

  .glyph {
    /* Optical centring: Hebrew letters sit high in Rubik's em box. */
    transform: translateY(0.04em);
  }

  img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    max-inline-size: none;
  }

  .unassigned .face {
    background: transparent;
    color: var(--ink-2);
    box-shadow: none;
    border: 1.5px dashed var(--ink-3);
    font-weight: 500;
  }
</style>
