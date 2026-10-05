<script lang="ts">
  // JarMini (Home strip, step 4.2): "ארוחה במסעדה · 7 מתוך 10" with a slim progress bar; the whole
  // strip opens #/jar. When the jar is full it turns into a small celebration card. Renders nothing
  // while no jar is set (the Jar tab invites to set one up).
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import { ProgressBar } from '$components/ui';
  import type { TreatJar } from '$lib/domain/types';
  import { isFull, progress } from '$lib/domain/jar';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { href } from '$lib/router/routes';
  import { household } from '$lib/state/household.svelte';

  interface Props {
    jar: TreatJar | null;
  }

  let { jar }: Props = $props();
  const t = he.jar;
  const ids = $derived(household.memberIds ?? []);
  const full = $derived(isFull(jar, ids));
  const uid = $props.id();
  const clipId = `${uid}-clip`;
</script>

{#if jar}
  <a class={['mini', { full }]} href={href('jar')} data-jar-mini={full ? 'full' : 'filling'}>
    <span class="glass" aria-hidden="true">
      <svg viewBox="0 0 24 28" width="24" height="28">
        <path
          class="outline"
          d="M8 3h8M9 3v3c0 1-4 2-4 6v10c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V12c0-4-4-5-4-6V3"
        />
        <clipPath id={clipId}>
          <path
            d="M9.5 6.5c0 1-3.5 2-3.5 5.5v10c0 1.5 1 2.2 2.2 2.2h7.6c1.2 0 2.2-.7 2.2-2.2V12c0-3.5-3.5-4.5-3.5-5.5z"
          />
        </clipPath>
        <rect
          class="level"
          clip-path={`url(#${clipId})`}
          x="0"
          width="24"
          y={25 - 18 * progress(jar, ids)}
          height={18 * progress(jar, ids) + 1}
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
        <span class="line"
          ><bdi dir={textDir(jar.treat)}>{jar.treat}</bdi> · {t.progress(
            jar.count,
            jar.target
          )}</span
        >
        <ProgressBar
          value={jar.count}
          max={jar.target}
          label={t.mini.label}
          valueText={t.progress(jar.count, jar.target)}
        />
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
</style>
