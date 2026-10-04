<script lang="ts">
  /*
   * ProgressJar (step 4.2): a glass jar holding one marble per completed task, in the colour of
   * whoever closed it. Cooperative by design: colours mix in the order the work happened and there
   * are no per-person numbers. Empty slots show as faint outlines so "how much is left" is visible.
   *
   * New marbles drop in with a small bounce when `count` grows (staggered when several arrive at
   * once); the first render is static. Reduced motion: always static.
   */
  import { untrack } from 'svelte';
  import type { MemberColor } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';
  import { reducedMotion } from '$lib/platform/motion';

  interface Props {
    count: number;
    target: number;
    /** Marble colours in completion order (missing entries fall back to the brand accent). */
    colors?: readonly (MemberColor | null)[];
    /** Rendered width in px (the height follows the 200×240 artwork). */
    size?: number;
    class?: string;
  }

  let { count, target, colors = [], size = 220, class: className }: Props = $props();

  const uid = $props.id();

  // Interior of the jar body (artwork units).
  const LEFT = 28;
  const WIDTH = 144;
  const BOTTOM = 222;
  const HEIGHT = 150;

  const slots = $derived.by(() => {
    const n = Math.max(1, Math.min(60, Math.round(target)));
    let cols = 3;
    let r = 0;
    for (cols = 3; cols <= 12; cols++) {
      r = WIDTH / (2 * cols + 0.7);
      const rows = Math.ceil(n / cols);
      if (rows * 2 * r * 0.9 + r * 0.2 <= HEIGHT) break;
    }
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Odd rows sit a little to one side, with a tiny deterministic wobble: settled, not gridded.
      const wobble = (((i * 37) % 7) - 3) * 0.06 * r;
      const shift = row % 2 === 1 ? r * 0.7 : 0;
      out.push({
        x: LEFT + r + col * 2 * r + shift + wobble,
        y: BOTTOM - r - row * 2 * r * 0.9 + Math.abs(wobble) * 0.5,
        r: r * 0.94
      });
    }
    return out;
  });

  const filled = $derived(Math.max(0, Math.min(count, slots.length)));

  // Marbles at index ≥ dropFrom animate in (only those added since the last change).
  let dropFrom = $state(Number.POSITIVE_INFINITY);
  let previous = untrack(() => count);
  $effect(() => {
    const c = count;
    untrack(() => {
      dropFrom = c > previous ? previous : Number.POSITIVE_INFINITY;
      previous = c;
    });
  });

  const colorOf = (i: number): string => {
    const c = colors[i];
    return c ? `var(--member-${c}-base)` : 'var(--accent)';
  };
</script>

<svg
  class={['jar', className]}
  viewBox="0 0 200 240"
  width={size}
  height={(size * 240) / 200}
  role="img"
  aria-label={he.jar.aria(Math.min(count, target), target)}
  data-count={count}
  data-motion={reducedMotion.current ? 'static' : 'animated'}
>
  <defs>
    <clipPath id="{uid}-inside">
      <path
        d="M70 52c0 7-10 9-22 13C33 70 26 80 26 97v102c0 15 11 25 26 25h96c15 0 26-10 26-25V97c0-17-7-27-22-32-12-4-22-6-22-13z"
      />
    </clipPath>
    <radialGradient id="{uid}-shine" cx="0.35" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
      <stop offset="0.35" stop-color="#fff" stop-opacity="0.18" />
      <stop offset="1" stop-color="#000" stop-opacity="0.12" />
    </radialGradient>
  </defs>

  <!-- shadow on the "table" -->
  <ellipse class="floor" cx="100" cy="232" rx="78" ry="6" />

  <!-- glass body -->
  <path
    class="glass"
    d="M66 40v8c0 8-10 10-22 14C28 67 20 78 20 96v104c0 18 14 30 32 30h96c18 0 32-12 32-30V96c0-18-8-29-24-34-12-4-22-6-22-14v-8z"
  />

  <g clip-path="url(#{uid}-inside)">
    {#each slots as s, i (i)}
      {#if i < filled}
        <g
          class={['marble', { drop: !reducedMotion.current && i >= dropFrom }]}
          style:--delay={`${Math.max(0, i - dropFrom) * 110}ms`}
        >
          <circle cx={s.x} cy={s.y} r={s.r} fill={colorOf(i)} />
          <circle cx={s.x} cy={s.y} r={s.r} fill="url(#{uid}-shine)" />
        </g>
      {:else}
        <circle class="slot" cx={s.x} cy={s.y} r={s.r * 0.82} />
      {/if}
    {/each}
  </g>

  <!-- glass highlights over the marbles -->
  <path class="gleam" d="M36 104c0-12 4-20 12-25" />
  <path class="gleam soft" d="M36 120v62" />
  <path
    class="rim"
    d="M66 40v8c0 8-10 10-22 14C28 67 20 78 20 96v104c0 18 14 30 32 30h96c18 0 32-12 32-30V96c0-18-8-29-24-34-12-4-22-6-22-14v-8"
  />

  <!-- lid -->
  <rect class="lid" x="58" y="20" width="84" height="22" rx="7" />
  <path class="lid-line" d="M64 31h72" />
</svg>

<style>
  .jar {
    display: block;
    overflow: visible;
  }

  .floor {
    fill: var(--ink);
    opacity: 0.06;
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

  .lid {
    fill: var(--accent);
  }

  .lid-line {
    stroke: color-mix(in srgb, var(--ink) 18%, transparent);
    stroke-width: 1.5;
  }

  .slot {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }

  .marble {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }

  .drop {
    animation: drop 620ms cubic-bezier(0.3, 0.7, 0.4, 1) both;
    animation-delay: var(--delay, 0ms);
  }

  @keyframes drop {
    0% {
      translate: 0 -190px;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    70% {
      translate: 0 0;
      scale: 1.08 0.9;
    }
    85% {
      translate: 0 -6px;
      scale: 0.97 1.03;
    }
    100% {
      translate: 0 0;
      scale: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drop {
      animation: none;
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
