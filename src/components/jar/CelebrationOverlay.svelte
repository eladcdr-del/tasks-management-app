<script lang="ts">
  /*
   * CelebrationOverlay: the jar filled. A warm full-screen moment, in beats:
   *   the jar arrives (spring) → shakes with anticipation → the lid pops off → marbles in the
   *   household's colours fountain out of the mouth and rain down around it, sparkles twinkle,
   *   a glow breathes behind → "עשינו את זה ביחד" → the treat card → everyone's avatars, one by
   *   one → "איזה כיף".
   * Shown once per jar round (the Jar screen decides). Transform/opacity only. Reduced motion: the
   * same final composition, perfectly still (the lid resting beside the jar, marbles landed).
   */
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Gift from '@lucide/svelte/icons/gift';
  import { Avatar, type AvatarPerson } from '$components/ui';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { dur, reducedMotion } from '$lib/platform/motion';

  interface Props {
    treat: string;
    /** Everyone in the household (their colours fill the burst; their avatars close the moment). */
    people?: readonly AvatarPerson[];
    /** 'each' jar: "כל אחד עשה את החלק שלו". */
    each?: boolean;
    onClose: () => void;
  }

  let { treat, people = [], each = false, onClose }: Props = $props();
  const t = he.jar.party;

  let button: HTMLButtonElement | undefined = $state();
  onMount(() => button?.focus());

  /** Where the jar's mouth is, relative to the stage centre (px). */
  const MOUTH_Y = -50;
  /** The "table" the jar stands on (its base), relative to the stage centre (px). */
  const TABLE_Y = 52;
  /** Marble diameter in the piles (sizes vary ±1px around it). */
  const D = 15;
  /** Each pile, bottom row first: how many marbles per row (a little pyramid). */
  const ROWS = [5, 4, 2];
  /** The piles start this far from the centre line, just clear of the glass (±46px). */
  const INNER = 54;
  // The marbles fly up out of the mouth and come down into two small piles on the table, one on
  // each side of the jar, bottom row first and colours mixed. Every landing spot is inside the
  // stage (≤ 110px below its centre), so none lands on the headline under it.
  const burst = $derived.by(() => {
    const spots: { x: number; y: number }[] = [];
    ROWS.forEach((n, row) => {
      for (let k = 0; k < n; k++) {
        spots.push({
          x: INNER + D / 2 + row * (D / 2) + k * D,
          y: TABLE_Y - D / 2 - row * D * 0.86
        });
      }
    });
    const out: {
      dx: number;
      dy: number;
      peak: number;
      size: number;
      color: string;
      delay: number;
    }[] = [];
    let order = 0;
    for (const spot of spots) {
      for (const side of [1, -1]) {
        const i = out.length;
        const p = people.length > 0 ? people[(order + (side > 0 ? 0 : 1)) % people.length] : null;
        out.push({
          dx: side * spot.x,
          dy: spot.y,
          peak: MOUTH_Y - 64 - ((i * 29) % 5) * 22, // −114..−202: well above the jar
          size: D - 1 + ((i * 7) % 3),
          color: p
            ? `var(--member-${p.color}-base)`
            : i % 3 === 0
              ? 'var(--sage)'
              : 'var(--accent)',
          delay: 980 + order * 52 + (side > 0 ? 0 : 26)
        });
      }
      order++;
    }
    return out;
  });
  const sparkles = [
    { x: -58, y: -96, s: 1, d: 1_050 },
    { x: 62, y: -84, s: 0.8, d: 1_180 },
    { x: -30, y: -128, s: 0.7, d: 1_300 },
    { x: 36, y: -134, s: 1.1, d: 1_120 },
    { x: -86, y: -40, s: 0.6, d: 1_420 },
    { x: 90, y: -30, s: 0.75, d: 1_360 }
  ];
  const colorOf = (i: number) =>
    people.length > 0 ? `var(--member-${people[i % people.length]!.color}-base)` : 'var(--accent)';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="celebration-title"
  data-celebration
  data-motion={reducedMotion.current ? 'static' : 'animated'}
  transition:fade={{ duration: dur(240) }}
>
  <div class="stage" aria-hidden="true">
    <span class="halo"></span>
    <span class="rays"></span>
    <span class="table"></span>

    <svg class="jar-art" viewBox="0 0 120 132" width="120" height="132">
      <g class="jar-body">
        <path
          class="glass"
          d="M42 18v6c0 5-7 7-14 10-10 4-14 11-14 21v52c0 11 8 19 19 19h54c11 0 19-8 19-19V55c0-10-4-17-14-21-7-3-14-5-14-10v-6z"
        />
        <circle cx="38" cy="106" r="10" fill={colorOf(0)} />
        <circle cx="60" cy="108" r="10" fill={colorOf(1)} />
        <circle cx="82" cy="105" r="10" fill={colorOf(2)} />
        <circle cx="48" cy="88" r="9.5" fill={colorOf(3)} />
        <circle cx="71" cy="88" r="9.5" fill={colorOf(4)} />
        <circle cx="30" cy="84" r="8.5" fill={colorOf(5)} />
        <circle cx="90" cy="84" r="8.5" fill={colorOf(6)} />
        <circle cx="59" cy="70" r="9" fill={colorOf(7)} />
        <circle cx="38" cy="66" r="8" fill={colorOf(8)} />
        <circle cx="80" cy="66" r="8" fill={colorOf(9)} />
        <circle cx="58" cy="51" r="8" fill={colorOf(10)} />
        <path class="gleam" d="M24 62c0-8 3-13 8-16" />
        <path
          class="rim"
          d="M42 18v6c0 5-7 7-14 10-10 4-14 11-14 21v52c0 11 8 19 19 19h54c11 0 19-8 19-19V55c0-10-4-17-14-21-7-3-14-5-14-10v-6"
        />
        <ellipse class="mouth-light" cx="60" cy="18" rx="17" ry="4" />
      </g>
      <g class="lid">
        <rect x="36" y="5" width="48" height="14" rx="5" />
        <path d="M40 12h40" />
      </g>
    </svg>

    {#each burst as m, i (i)}
      <span class="marble-x" style:--dx={`${m.dx}px`} style:--delay={`${m.delay}ms`}>
        <span
          class="marble"
          style:--dy={`${m.dy}px`}
          style:--peak={`${m.peak}px`}
          style:--from={`${MOUTH_Y}px`}
          style:--size={`${m.size}px`}
          style:--c={m.color}
          style:--delay={`${m.delay}ms`}
        ></span>
      </span>
    {/each}

    {#each sparkles as s, i (i)}
      <svg
        class="sparkle"
        viewBox="-10 -10 20 20"
        width="20"
        height="20"
        style:--x={`${s.x}px`}
        style:--y={`${s.y}px`}
        style:--s={s.s}
        style:--delay={`${s.d}ms`}
      >
        <path d="M0-9 2.2-2.2 9 0 2.2 2.2 0 9-2.2 2.2-9 0-2.2-2.2z" />
      </svg>
    {/each}
  </div>

  <h2 id="celebration-title" class="reveal r1">{t.title}</h2>
  <p class="body reveal r2">{each ? t.bodyEach : t.body}</p>
  <div class="treat-card reveal r3">
    <span class="gift" aria-hidden="true"><Gift size={22} /></span>
    <p class="treat" dir={textDir(treat)}>{treat}</p>
  </div>
  {#if people.length > 0}
    <ul class="people" aria-label={people.map((p) => p.displayName).join(', ')}>
      {#each people as p, i (i)}
        <li class="person" style:--i={i}>
          <Avatar
            name={p.displayName}
            photoURL={p.photoURL ?? null}
            color={p.color}
            size="md"
            decorative
          />
        </li>
      {/each}
    </ul>
  {/if}
  <button bind:this={button} type="button" class="close reveal r5" onclick={onClose}
    >{t.close}</button
  >
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s3);
    padding: var(--s7) var(--screen-pad);
    background:
      radial-gradient(
        120% 70% at 50% 32%,
        color-mix(in srgb, var(--accent-soft) 85%, var(--bg)) 0%,
        var(--bg) 70%
      ),
      var(--bg);
    text-align: center;
    overflow: hidden;
  }

  .stage {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 280px;
    block-size: 220px;
    margin-block-end: var(--s2);
  }

  .halo {
    position: absolute;
    inset: -30px;
    border-radius: 50%;
    background: radial-gradient(
      closest-side,
      color-mix(in srgb, var(--accent) 34%, transparent),
      transparent 72%
    );
  }

  .rays {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: 380px;
    block-size: 380px;
    margin: -190px;
    border-radius: 50%;
    background: repeating-conic-gradient(
      from 0deg,
      color-mix(in srgb, var(--accent) 14%, transparent) 0deg 7deg,
      transparent 7deg 22.5deg
    );
    mask-image: radial-gradient(closest-side, #000 30%, transparent 100%);
    opacity: 0.7;
  }

  .table {
    position: absolute;
    inset-block-start: calc(50% + 46px);
    inset-inline-start: 50%;
    inline-size: 290px;
    block-size: 14px;
    margin-inline-start: -145px;
    border-radius: 50%;
    background: radial-gradient(
      closest-side,
      color-mix(in srgb, var(--ink) 9%, transparent),
      transparent
    );
  }

  .jar-art {
    position: relative;
    overflow: visible;
    translate: 0 -8px;
  }

  .jar-body {
    transform-box: view-box;
    transform-origin: 60px 126px;
  }

  .glass {
    fill: color-mix(in srgb, var(--surface) 82%, transparent);
  }

  .rim {
    fill: none;
    stroke: var(--ink-3);
    stroke-width: 2.2;
    stroke-linejoin: round;
    opacity: 0.8;
  }

  .gleam {
    fill: none;
    stroke: #fff;
    stroke-width: 3.5;
    stroke-linecap: round;
    opacity: 0.55;
  }

  .mouth-light {
    fill: var(--accent);
    opacity: 0.45;
  }

  .lid {
    transform-box: view-box;
    transform-origin: 60px 12px;
    /* final resting place (also the still composition): off, tilted, beside the mouth */
    translate: 46px -14px;
    rotate: 24deg;
  }

  .lid rect {
    fill: var(--accent);
  }

  .lid path {
    stroke: color-mix(in srgb, var(--ink) 18%, transparent);
    stroke-width: 1.5;
  }

  .marble-x {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    translate: var(--dx) 0;
  }

  .marble {
    display: block;
    inline-size: var(--size);
    block-size: var(--size);
    margin: calc(var(--size) / -2);
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.7), transparent 45%), var(--c);
    box-shadow: 0 2px 4px rgb(43 36 32 / 0.12);
    translate: 0 var(--dy);
  }

  .sparkle {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    margin: -10px;
    translate: var(--x) var(--y);
    scale: var(--s);
    fill: var(--accent);
    opacity: 0.8;
  }

  h2 {
    font: var(--font-display);
    color: var(--ink);
    text-wrap: balance;
  }

  .body {
    font: var(--font-body);
    color: var(--ink-2);
    text-wrap: balance;
  }

  .treat-card {
    display: flex;
    align-items: center;
    gap: var(--s3);
    max-inline-size: 100%;
    margin-block-start: var(--s1);
    padding: var(--s3) var(--s5) var(--s3) var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-2);
  }

  .gift {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .treat {
    font: var(--font-title);
    color: var(--accent-ink);
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .people {
    display: flex;
    justify-content: center;
    margin: var(--s2) 0 0;
    padding: 0;
    list-style: none;
  }

  .person {
    --avatar-gap: var(--bg);
    margin-inline-start: -8px;
    border-radius: 50%;
    box-shadow: 0 0 0 3px var(--bg);
  }

  .person:first-child {
    margin-inline-start: 0;
  }

  .close {
    min-block-size: 52px;
    min-inline-size: 200px;
    margin-block-start: var(--s5);
    padding-inline: var(--s6);
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    font: var(--font-body);
    font-weight: 600;
    box-shadow: var(--sh-accent);
  }

  .close:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
  }

  /* ── The beats (animated only) ──────────────────────────────────────────── */

  [data-motion='animated'] .jar-art {
    animation: arrive 620ms var(--ease-spring) both;
  }

  [data-motion='animated'] .jar-body {
    animation: shake 460ms ease-in-out 540ms both;
  }

  [data-motion='animated'] .lid {
    animation: lid-pop 900ms cubic-bezier(0.2, 0.7, 0.3, 1) 900ms both;
  }

  [data-motion='animated'] .halo {
    animation:
      glow-in 900ms var(--ease-out) 880ms both,
      breathe 2.8s ease-in-out 1.8s infinite alternate;
  }

  [data-motion='animated'] .rays {
    animation:
      rays-in 1s var(--ease-out) 940ms both,
      spin 24s linear 940ms infinite;
  }

  [data-motion='animated'] .marble-x {
    animation: fly-x 1150ms cubic-bezier(0.3, 0.5, 0.5, 1) var(--delay) both;
  }

  [data-motion='animated'] .marble {
    animation: fly-y 1150ms linear var(--delay) both;
  }

  [data-motion='animated'] .sparkle {
    animation: twinkle 1100ms ease-in-out var(--delay) 2 both;
  }

  [data-motion='animated'] .reveal {
    animation: rise 560ms var(--ease-out) both;
  }

  [data-motion='animated'] .r1 {
    animation-delay: 1250ms;
  }

  [data-motion='animated'] .r2 {
    animation-delay: 1360ms;
  }

  [data-motion='animated'] .r3 {
    animation: card 640ms var(--ease-spring) 1480ms both;
  }

  [data-motion='animated'] .person {
    animation: pop 520ms var(--ease-spring) calc(1700ms + var(--i) * 110ms) both;
  }

  [data-motion='animated'] .r5 {
    animation-delay: 1900ms;
  }

  @keyframes arrive {
    from {
      scale: 0.55;
      opacity: 0;
    }
    to {
      scale: 1;
      opacity: 1;
    }
  }

  @keyframes shake {
    0%,
    100% {
      rotate: 0deg;
    }
    20% {
      rotate: -5deg;
    }
    40% {
      rotate: 4.5deg;
    }
    60% {
      rotate: -3.5deg;
    }
    80% {
      rotate: 2deg;
    }
  }

  @keyframes lid-pop {
    0% {
      translate: 0 0;
      rotate: 0deg;
    }
    35% {
      translate: 26px -62px;
      rotate: 32deg;
    }
    100% {
      translate: 46px -14px;
      rotate: 24deg;
    }
  }

  @keyframes glow-in {
    from {
      scale: 0.5;
      opacity: 0;
    }
    to {
      scale: 1;
      opacity: 1;
    }
  }

  @keyframes breathe {
    from {
      scale: 1;
    }
    to {
      scale: 1.07;
    }
  }

  @keyframes rays-in {
    from {
      opacity: 0;
      scale: 0.6;
    }
    to {
      opacity: 0.7;
      scale: 1;
    }
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }

  @keyframes fly-x {
    from {
      translate: 0 0;
    }
    to {
      translate: var(--dx) 0;
    }
  }

  /* Up out of the mouth fast, slowing to the apex, then falling onto the table with a bounce. */
  @keyframes fly-y {
    0% {
      translate: 0 var(--from);
      scale: 0.3;
      opacity: 0;
      animation-timing-function: cubic-bezier(0.15, 0.6, 0.4, 1);
    }
    8% {
      opacity: 1;
      scale: 1;
    }
    38% {
      translate: 0 var(--peak);
      animation-timing-function: cubic-bezier(0.55, 0, 0.9, 0.55);
    }
    82% {
      translate: 0 var(--dy);
      animation-timing-function: cubic-bezier(0.1, 0.5, 0.5, 1);
    }
    91% {
      translate: 0 calc(var(--dy) - 9px);
      animation-timing-function: cubic-bezier(0.55, 0, 0.9, 0.55);
    }
    100% {
      translate: 0 var(--dy);
      scale: 1;
      opacity: 1;
    }
  }

  @keyframes twinkle {
    0%,
    100% {
      opacity: 0;
      scale: 0.2;
    }
    50% {
      opacity: 0.9;
      scale: var(--s);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 14px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }

  @keyframes card {
    from {
      opacity: 0;
      scale: 0.86;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  @keyframes pop {
    from {
      opacity: 0;
      scale: 0.4;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  [data-motion='static'] .sparkle {
    opacity: 0.7;
  }

  [data-motion='static'] *,
  [data-motion='static'] *::before,
  [data-motion='static'] *::after {
    animation: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay *,
    .overlay *::before,
    .overlay *::after {
      animation: none !important;
    }
  }
</style>
