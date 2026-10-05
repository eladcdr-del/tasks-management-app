<script lang="ts">
  // CelebrationOverlay (step 4.2): the jar filled. A warm full-screen moment: marbles burst out in
  // the household's colours, the treat is named, one button closes. Shown once per jar round (the
  // Jar screen decides). Reduced motion: the same composition, perfectly still.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { MemberColor } from '$lib/domain/types';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { dur, reducedMotion } from '$lib/platform/motion';

  interface Props {
    treat: string;
    /** Member colours for the burst (the household's). */
    colors?: readonly MemberColor[];
    onClose: () => void;
  }

  let { treat, colors = [], onClose }: Props = $props();
  const t = he.jar.party;

  let button: HTMLButtonElement | undefined = $state();
  onMount(() => button?.focus());

  const MARBLES = 18;
  // Up and sideways the marbles fly far; downward they fly half as far, so they land inside the
  // stage (110px below its centre) and never on the headline under it. The still layout (reduced
  // motion) is the same end state.
  const burst = $derived(
    Array.from({ length: MARBLES }, (_, i) => {
      const angle = (i / MARBLES) * Math.PI * 2 + (i % 2 ? 0.17 : -0.05);
      const dist = 110 + ((i * 53) % 5) * 22;
      const c = colors.length > 0 ? colors[i % colors.length] : null;
      const sin = Math.sin(angle);
      return {
        dx: Math.cos(angle) * dist,
        dy: sin * dist * (sin > 0 ? 0.45 : 0.9),
        size: 10 + ((i * 31) % 4) * 4,
        color: c ? `var(--member-${c}-base)` : i % 3 === 0 ? 'var(--sage)' : 'var(--accent)',
        delay: (i % 6) * 40
      };
    })
  );
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
    {#each burst as m, i (i)}
      <span
        class="marble"
        style:--dx={`${m.dx}px`}
        style:--dy={`${m.dy}px`}
        style:--size={`${m.size}px`}
        style:--c={m.color}
        style:--delay={`${m.delay}ms`}
      ></span>
    {/each}
    <svg class="jar-icon" viewBox="0 0 64 72" width="96" height="108">
      <rect x="18" y="4" width="28" height="9" rx="3" class="lid" />
      <path
        class="glass"
        d="M21 13v4c0 3-4 4-8 6-5 2-7 6-7 12v24c0 6 4 10 10 10h32c6 0 10-4 10-10V35c0-6-2-10-7-12-4-2-8-3-8-6v-4z"
      />
      <circle cx="22" cy="58" r="7" class="m1" />
      <circle cx="37" cy="59" r="7" class="m2" />
      <circle cx="48" cy="50" r="6" class="m1" />
      <circle cx="29" cy="46" r="6.5" class="m2" />
      <circle cx="17" cy="44" r="5.5" class="m3" />
      <circle cx="42" cy="38" r="6" class="m3" />
      <circle cx="29" cy="32" r="5.5" class="m1" />
    </svg>
  </div>

  <h2 id="celebration-title">{t.title}</h2>
  <p class="body">{t.body}</p>
  <p class="treat" dir={textDir(treat)}>{treat}</p>
  <button bind:this={button} type="button" class="close" onclick={onClose}>{t.close}</button>
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
    padding: var(--s8) var(--screen-pad);
    background:
      radial-gradient(
        120% 70% at 50% 35%,
        color-mix(in srgb, var(--accent-soft) 85%, var(--bg)) 0%,
        var(--bg) 70%
      ),
      var(--bg);
    text-align: center;
  }

  .stage {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 240px;
    block-size: 220px;
    margin-block-end: var(--s4);
  }

  .marble {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: var(--size);
    block-size: var(--size);
    margin: calc(var(--size) / -2);
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.7), transparent 45%), var(--c);
    translate: var(--dx) var(--dy);
    animation: burst 900ms cubic-bezier(0.16, 0.9, 0.3, 1) both;
    animation-delay: var(--delay);
  }

  [data-motion='animated'] .jar-icon {
    animation: pop 700ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
  }

  [data-motion='static'] .marble {
    animation: none;
  }

  @keyframes burst {
    0% {
      translate: 0 0;
      scale: 0.2;
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      translate: var(--dx) var(--dy);
      scale: 1;
      opacity: 1;
    }
  }

  @keyframes pop {
    0% {
      scale: 0.6;
      opacity: 0;
    }
    100% {
      scale: 1;
      opacity: 1;
    }
  }

  .jar-icon .lid {
    fill: var(--accent);
  }

  .jar-icon .glass {
    fill: var(--surface);
    stroke: var(--ink-3);
    stroke-width: 2;
  }

  .m1 {
    fill: var(--accent);
  }

  .m2 {
    fill: var(--sage);
  }

  .m3 {
    fill: var(--member-slate-base);
  }

  h2 {
    font: var(--font-display);
    color: var(--ink);
  }

  .body {
    font: var(--font-body);
    color: var(--ink-2);
  }

  .treat {
    font: var(--font-title);
    color: var(--accent-ink);
    text-wrap: balance;
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
    box-shadow: var(--sh-2);
  }

  .close:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .marble,
    .jar-icon {
      animation: none !important;
    }
  }
</style>
