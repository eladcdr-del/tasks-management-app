<script lang="ts">
  /*
   * JarMini (Home strip): "ארוחה במסעדה · 7 מתוך 10" under a small jar whose level shows the
   * progress; the whole strip opens #/jar. The bar under the line follows the goal:
   *   together  one bar
   *   each      one short bar per member, in their colour (their own part; no names, no order)
   * When a completion lands, a marble drops into the little jar and it bumps; a member's bar that
   * just completed gets a glint. Full: a small celebration card. Renders nothing while no jar is
   * set (the Jar tab invites to set one up). Members come from the household store, so the only
   * prop stays `jar`.
   */
  import { untrack } from 'svelte';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import { ProgressBar } from '$components/ui';
  import type { TreatJar } from '$lib/domain/types';
  import { filled, isFull, modeOf, partsOf, progress, required, tallyOf } from '$lib/domain/jar';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { reducedMotion } from '$lib/platform/motion';
  import { href } from '$lib/router/routes';
  import { household } from '$lib/state/household.svelte';

  interface Props {
    jar: TreatJar | null;
  }

  let { jar }: Props = $props();
  const t = he.jar;
  const ids = $derived(household.memberIds ?? household.members.map((m) => m.uid));
  const full = $derived(isFull(jar, ids));
  const each = $derived(jar !== null && modeOf(jar) === 'each');
  const parts = $derived(partsOf(jar, ids));
  const level = $derived(progress(jar, ids));
  const line = $derived(jar ? t.progress(filled(jar, ids), required(jar, ids)) : '');
  const partsLabel = $derived(
    t.mini.parts(
      parts
        .map(
          (p) => `${household.memberById(p.uid)?.displayName ?? ''} ${t.part.of(p.done, p.share)}`
        )
        .join(', ')
    )
  );

  // A completion (any tally or the count went up): a marble plops in and the jar bumps.
  const total = (j: TreatJar | null) =>
    j === null
      ? 0
      : Math.max(
          j.count,
          ids.reduce((s, uid) => s + tallyOf(j, uid), 0)
        );
  let plops = $state(0);
  let glint = $state<ReadonlySet<string>>(new Set());
  let before = untrack(() => ({ total: total(jar), round: jar?.round ?? 0, parts }));
  let glassEl: HTMLElement | undefined = $state();
  $effect(() => {
    const now = { total: total(jar), round: jar?.round ?? 0, parts };
    untrack(() => {
      const grew = now.round === before.round && now.total > before.total;
      const completed = now.parts
        .filter((p) => p.complete && before.parts.some((q) => q.uid === p.uid && !q.complete))
        .map((p) => p.uid);
      before = now;
      if (!grew || reducedMotion.current) return;
      plops++;
      glassEl?.animate?.(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.14) rotate(-4deg)', offset: 0.45 },
          { transform: 'scale(0.97) rotate(2deg)', offset: 0.7 },
          { transform: 'scale(1)' }
        ],
        { duration: 620, delay: 260, easing: 'ease-out' }
      );
      if (completed.length > 0) {
        glint = new Set(completed);
        setTimeout(() => (glint = new Set()), 1_300);
      }
    });
  });

  const uid = $props.id();
  const clipId = `${uid}-clip`;
</script>

{#if jar}
  <a
    class={['mini', { full }]}
    href={href('jar')}
    data-jar-mini={full ? 'full' : 'filling'}
    data-jar-mode={each ? 'each' : 'together'}
  >
    <span class="glass" aria-hidden="true" bind:this={glassEl}>
      <svg viewBox="0 0 24 28" width="24" height="28">
        <clipPath id={clipId}>
          <path
            d="M9.5 6.5c0 1-3.5 2-3.5 5.5v10c0 1.5 1 2.2 2.2 2.2h7.6c1.2 0 2.2-.7 2.2-2.2V12c0-3.5-3.5-4.5-3.5-5.5z"
          />
        </clipPath>
        <g clip-path={`url(#${clipId})`}>
          <rect class="level" x="0" y="7" width="24" height="18" style:--p={level} />
          {#key plops}
            {#if plops > 0}<circle class="plop" cx="12" cy="20" r="2.6" />{/if}
          {/key}
        </g>
        <path
          class="outline"
          d="M8 3h8M9 3v3c0 1-4 2-4 6v10c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V12c0-4-4-5-4-6V3"
        />
      </svg>
    </span>
    {#if full}
      <span class="text">
        <span class="title"><PartyPopper size={16} aria-hidden="true" />{t.mini.full}</span>
        <span class="sub"><bdi dir={textDir(jar.treat)}>{jar.treat}</bdi></span>
      </span>
      <span class="cta">{t.mini.fullCta}</span>
    {:else}
      <span class="text">
        <span class="line"><bdi dir={textDir(jar.treat)}>{jar.treat}</bdi> · {line}</span>
        {#if each && parts.length > 0}
          <span class="parts" role="img" aria-label={partsLabel}>
            {#each parts as p (p.uid)}
              {@const color = household.memberById(p.uid)?.color ?? 'terracotta'}
              <span
                class={['part', { complete: p.complete, glint: glint.has(p.uid) }]}
                style:--c={`var(--member-${color}-base)`}
                data-mini-part={p.uid}
              >
                <span class="fill" style:transform={`scaleX(${p.done / p.share})`}></span>
              </span>
            {/each}
          </span>
        {:else}
          <ProgressBar value={level * 100} max={100} label={t.mini.label} valueText={line} />
        {/if}
      </span>
      <ChevronLeft class="chev" size={18} aria-hidden="true" />
    {/if}
  </a>
{/if}

<style>
  .mini {
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 56px;
    padding: var(--s3) var(--card-pad);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    color: var(--ink);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform var(--d-fast) var(--ease-out);
  }

  .mini:active {
    transform: scale(0.99);
  }

  .mini:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .glass {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
  }

  .outline {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .level {
    fill: var(--accent);
    opacity: 0.85;
    transform-box: fill-box;
    transform-origin: 50% 100%;
    transform: scaleY(var(--p));
    transition: transform 700ms var(--ease-spring) 380ms;
  }

  .plop {
    fill: var(--accent-strong);
    animation: plop 640ms both;
  }

  @keyframes plop {
    0% {
      translate: 0 -18px;
      opacity: 0;
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
    }
    15% {
      opacity: 1;
    }
    55% {
      translate: 0 0;
      opacity: 1;
      animation-timing-function: cubic-bezier(0.1, 0.5, 0.5, 1);
    }
    72% {
      translate: 0 -2.5px;
    }
    100% {
      translate: 0 0;
      opacity: 0;
    }
  }

  .text {
    display: grid;
    flex: 1;
    gap: 6px;
    min-inline-size: 0;
  }

  .line {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }

  .parts {
    display: flex;
    gap: 4px;
    block-size: 6px;
  }

  .part {
    position: relative;
    flex: 1;
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--progress-track);
  }

  .part .fill {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: var(--c);
    transform-origin: right center;
    transition: transform 620ms var(--ease-spring) 380ms;
  }

  .part.glint::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 20%,
      color-mix(in srgb, #fff 75%, transparent) 50%,
      transparent 80%
    );
    translate: 110% 0;
    animation: glint 900ms var(--ease-out) 700ms both;
  }

  @keyframes glint {
    to {
      translate: -110% 0;
    }
  }

  .mini :global(.chev) {
    flex: none;
    color: var(--ink-3);
  }

  .full {
    background: var(--accent-soft);
  }

  .full .glass {
    background: var(--surface);
  }

  .title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: var(--font-callout);
    font-weight: 600;
    color: var(--accent-ink);
  }

  .sub {
    font: var(--font-callout);
    color: var(--ink);
  }

  .cta {
    flex: none;
    padding: var(--s2) var(--s4);
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    font: var(--font-callout);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .level,
    .part .fill {
      transition: none;
    }

    .plop,
    .part.glint::after {
      animation: none;
      opacity: 0;
    }
  }
</style>
