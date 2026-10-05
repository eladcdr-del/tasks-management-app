<script lang="ts">
  /*
   * ProgressJar: a glass jar holding one marble per completion this round (marbles.ts jarPicture),
   * in the colour of whoever closed it, in the order the work happened; dashed outlines for what is
   * still needed. A "help" marble (done for whoever asked) carries a tiny heart; a bonus marble
   * (past the goal) a soft halo and a glint.
   *
   * Motion (transform/opacity only; none under reduced motion):
   *  - a new marble drops in through the mouth: the lid hops, the marble falls with gravity, lands
   *    with a squash, bounces twice and settles; the glass wobbles a little on impact;
   *  - marbles index ≥ `seen` drop in, staggered, when the jar first appears (what was added since
   *    the last visit); later additions drop as they arrive;
   *  - positions glide when the layout changes (a bonus marble needs room);
   *  - full: the lid rests ajar over a warm glow that breathes.
   */
  import { untrack } from 'svelte';
  import type { Marble } from './marbles';
  import { jarSlots } from './marbles';
  import { reducedMotion } from '$lib/platform/motion';

  interface Props {
    marbles: readonly Marble[];
    /** Outlines still to fill. */
    empty: number;
    /** Marbles at index ≥ seen drop in when the jar first appears. Default: none. */
    seen?: number;
    full?: boolean;
    /** Accessible description ("צנצנת עם 7 גולות מתוך 10"). */
    label: string;
    /** Rendered width in px (the height follows the 200×240 artwork). */
    size?: number;
    class?: string;
  }

  let {
    marbles,
    empty,
    seen = Number.POSITIVE_INFINITY,
    full = false,
    label,
    size = 220,
    class: className
  }: Props = $props();

  const uid = $props.id();
  /** The newest this many arrivals animate; older ones just appear (keeps a long gap short). */
  const MAX_DROPS = 8;
  const STAGGER = 170;
  const DROP_MS = 760;
  /** When the marble meets the pile (fraction of DROP_MS, see @keyframes fall-y). */
  const IMPACT = 0.52;
  const MOUTH = { x: 100, y: 30 };

  const slots = $derived(jarSlots(marbles.length + Math.max(0, empty)));
  const motion = $derived(!reducedMotion.current);

  // Marbles at index ≥ dropFrom fall in (only those added since the last change).
  let dropFrom = $state(Number.POSITIVE_INFINITY);
  let baseDelay = $state(0);
  let previous = untrack(() => marbles.length);
  untrack(() => {
    if (seen < marbles.length) {
      dropFrom = Math.max(seen, marbles.length - MAX_DROPS);
      baseDelay = 380; // let the screen settle first
    }
  });
  $effect(() => {
    const n = marbles.length;
    untrack(() => {
      if (n > previous) {
        dropFrom = Math.max(previous, n - MAX_DROPS);
        baseDelay = 60;
      } else if (n < previous) {
        dropFrom = Number.POSITIVE_INFINITY;
      }
      previous = n;
    });
  });

  let bodyEl: SVGGElement | undefined = $state();
  let lidEl: SVGGElement | undefined = $state();

  // Each wave of arrivals: the lid hops as the first marble enters, the glass wobbles as it lands.
  $effect(() => {
    const from = dropFrom;
    const n = marbles.length;
    if (!motion || !Number.isFinite(from) || from >= n) return;
    const delay = untrack(() => baseDelay);
    const arrivals = n - from;
    untrack(() => {
      for (let k = 0; k < arrivals; k++) {
        const start = delay + k * STAGGER;
        if (!full) {
          lidEl?.animate?.(
            [
              { transform: 'translate(0, 0) rotate(0deg)' },
              { transform: 'translate(-2px, -9px) rotate(-5deg)', offset: 0.35 },
              { transform: 'translate(0, 0) rotate(0deg)' }
            ],
            { duration: 420, delay: Math.max(0, start - 140), easing: 'ease-in-out' }
          );
        }
        bodyEl?.animate?.(
          [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-1.4deg)', offset: 0.25 },
            { transform: 'rotate(0.9deg)', offset: 0.55 },
            { transform: 'rotate(-0.3deg)', offset: 0.8 },
            { transform: 'rotate(0deg)' }
          ],
          { duration: 520, delay: start + DROP_MS * IMPACT, easing: 'ease-out' }
        );
      }
    });
  });

  const fill = (m: Marble) => (m.color ? `var(--member-${m.color}-base)` : 'var(--accent)');
</script>

<svg
  class={['jar', { full }, className]}
  viewBox="0 0 200 240"
  width={size}
  height={(size * 240) / 200}
  role="img"
  aria-label={label}
  data-count={marbles.length}
  data-full={full ? '' : undefined}
  data-motion={motion ? 'animated' : 'static'}
>
  <defs>
    <clipPath id="{uid}-inside">
      <path
        d="M70 40v12c0 7-10 9-22 13C33 70 26 80 26 97v102c0 15 11 25 26 25h96c15 0 26-10 26-25V97c0-17-7-27-22-32-12-4-22-6-22-13V40z"
      />
    </clipPath>
    <radialGradient id="{uid}-shine" cx="0.34" cy="0.28" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="0.8" />
      <stop offset="0.3" stop-color="#fff" stop-opacity="0.2" />
      <stop offset="0.75" stop-color="#000" stop-opacity="0.04" />
      <stop offset="1" stop-color="#000" stop-opacity="0.16" />
    </radialGradient>
    <radialGradient id="{uid}-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" class="glow-in" />
      <stop offset="1" class="glow-out" />
    </radialGradient>
  </defs>

  <!-- a warm glow behind a full jar -->
  <ellipse class="glow" cx="100" cy="118" rx="112" ry="118" fill="url(#{uid}-glow)" />
  <!-- shadow on the "table" -->
  <ellipse class="floor" cx="100" cy="232" rx="78" ry="6" />

  <g class="body" bind:this={bodyEl}>
    <!-- glass body -->
    <path
      class="glass"
      d="M66 40v8c0 8-10 10-22 14C28 67 20 78 20 96v104c0 18 14 30 32 30h96c18 0 32-12 32-30V96c0-18-8-29-24-34-12-4-22-6-22-14v-8z"
    />

    <g clip-path="url(#{uid}-inside)">
      {#each slots as s, i (i)}
        {#if i >= marbles.length}
          <circle class="slot" cx={s.x} cy={s.y} r={s.r * 0.82} />
        {/if}
      {/each}
      {#each marbles as m, i (i)}
        {@const s = slots[i] ?? slots[slots.length - 1]!}
        {@const dropping = motion && i >= dropFrom}
        <g class="pos" style:transform={`translate(${s.x}px, ${s.y}px)`}>
          <g
            class={['fall', { drop: dropping }]}
            style:--dx={`${MOUTH.x - s.x}px`}
            style:--dy={`${MOUTH.y - s.y}px`}
            style:--hop={`${-Math.max(2.5, s.r * 0.85)}px`}
            style:--hop2={`${-Math.max(1, s.r * 0.25)}px`}
            style:--delay={`${baseDelay + Math.max(0, i - dropFrom) * STAGGER}ms`}
            style:--dur={`${DROP_MS}ms`}
          >
            <g class="fall-y">
              <g class="squash">
                {#if m.bonus}
                  <circle class="halo" r={s.r * 1.32} fill={fill(m)} />
                {/if}
                <circle class="marble" r={s.r} fill={fill(m)} data-marble={m.uid ?? ''} />
                <circle r={s.r} fill="url(#{uid}-shine)" />
                {#if m.help}
                  <path
                    class="heart"
                    data-help
                    transform={`translate(0 ${s.r * 0.08}) scale(${(s.r / 10) * 1.05})`}
                    d="M0 3.1C-4.6 0-3.4-4.4 0-1.9 3.4-4.4 4.6 0 0 3.1z"
                  />
                {/if}
                {#if m.bonus}
                  <path
                    class="glint"
                    transform={`translate(${s.r * 0.62} ${-s.r * 0.62}) scale(${s.r / 10})`}
                    d="M0-4.2 1 -1 4.2 0 1 1 0 4.2-1 1-4.2 0-1-1z"
                  />
                {/if}
              </g>
            </g>
          </g>
        </g>
      {/each}
    </g>

    <!-- glass highlights over the marbles -->
    <path class="gleam" d="M36 104c0-12 4-20 12-25" />
    <path class="gleam soft" d="M36 120v62" />
    <path
      class="rim"
      d="M66 40v8c0 8-10 10-22 14C28 67 20 78 20 96v104c0 18 14 30 32 30h96c18 0 32-12 32-30V96c0-18-8-29-24-34-12-4-22-6-22-14v-8"
    />
    <!-- a full jar: light from the open mouth -->
    <ellipse class="mouth-light" cx="100" cy="40" rx="30" ry="7" />
  </g>

  <!-- lid -->
  <g class="lid" bind:this={lidEl}>
    <rect class="lid-top" x="58" y="20" width="84" height="22" rx="7" />
    <path class="lid-line" d="M64 31h72" />
  </g>
</svg>

<style>
  .jar {
    display: block;
    overflow: visible;
  }

  .glow {
    opacity: 0;
    transition: opacity var(--d-slow) var(--ease-out);
  }

  .glow-in {
    stop-color: var(--accent);
    stop-opacity: 0.3;
  }

  .glow-out {
    stop-color: var(--accent);
    stop-opacity: 0;
  }

  .full .glow {
    opacity: 1;
  }

  .floor {
    fill: var(--ink);
    opacity: 0.06;
  }

  .body {
    transform-box: view-box;
    transform-origin: 100px 230px;
  }

  .glass {
    fill: color-mix(in srgb, var(--surface) 70%, transparent);
  }

  .rim {
    fill: none;
    stroke: var(--ink-3);
    stroke-width: 2.5;
    stroke-linejoin: round;
    opacity: 0.7;
  }

  .gleam {
    fill: none;
    stroke: #fff;
    stroke-width: 5;
    stroke-linecap: round;
    opacity: 0.6;
  }

  .gleam.soft {
    stroke-width: 3;
    opacity: 0.35;
  }

  .mouth-light {
    fill: var(--accent);
    opacity: 0;
  }

  .full .mouth-light {
    opacity: 0.35;
  }

  .lid {
    transform-box: view-box;
    transform-origin: 58px 42px;
    transition: transform 520ms var(--ease-spring);
  }

  /* A full jar: the lid rests ajar, the treat is ready. */
  .full .lid {
    transform: translate(-6px, -12px) rotate(-13deg);
  }

  .lid-top {
    fill: var(--accent);
  }

  .lid-line {
    stroke: color-mix(in srgb, var(--ink) 18%, transparent);
    stroke-width: 1.5;
  }

  .slot {
    fill: none;
    stroke: var(--hairline-strong);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }

  .pos {
    transition: transform 480ms var(--ease-out);
  }

  .halo {
    opacity: 0.22;
  }

  .heart {
    fill: #fff;
    opacity: 0.92;
  }

  .glint {
    fill: #fff;
    opacity: 0.95;
  }

  .squash {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }

  /* The drop: X drifts from the mouth to the slot while Y falls with gravity and bounces. */
  .drop {
    animation: fall-x var(--dur) linear var(--delay) both;
  }

  .drop .fall-y {
    animation: fall-y var(--dur) linear var(--delay) both;
  }

  .drop .squash {
    animation: squash var(--dur) linear var(--delay) both;
  }

  @keyframes fall-x {
    from {
      translate: var(--dx) 0;
    }
    52% {
      translate: 0 0;
    }
    to {
      translate: 0 0;
    }
  }

  @keyframes fall-y {
    0% {
      translate: 0 var(--dy);
      opacity: 0;
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
    }
    8% {
      opacity: 1;
    }
    52% {
      translate: 0 0;
      animation-timing-function: cubic-bezier(0.1, 0.5, 0.5, 1);
    }
    68% {
      translate: 0 var(--hop);
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
    }
    82% {
      translate: 0 0;
      animation-timing-function: cubic-bezier(0.1, 0.5, 0.5, 1);
    }
    90% {
      translate: 0 var(--hop2);
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
    }
    100% {
      translate: 0 0;
      opacity: 1;
    }
  }

  @keyframes squash {
    0%,
    48% {
      scale: 0.96 1.06;
    }
    53% {
      scale: 1.2 0.78;
    }
    60% {
      scale: 0.94 1.07;
    }
    70% {
      scale: 1 1;
    }
    82% {
      scale: 1 1;
    }
    85% {
      scale: 1.07 0.92;
    }
    90%,
    100% {
      scale: 1 1;
    }
  }

  .full[data-motion='animated'] .glow {
    animation: breathe 3.2s ease-in-out infinite alternate;
  }

  @keyframes breathe {
    from {
      opacity: 0.65;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drop,
    .drop .fall-y,
    .drop .squash,
    .glow {
      animation: none !important;
    }

    .pos,
    .lid {
      transition: none;
    }
  }

  :global([data-theme='dark']) .gleam,
  :global([data-theme='dark']) .gleam.soft {
    opacity: 0.18;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .gleam {
      opacity: 0.18;
    }
  }
</style>
