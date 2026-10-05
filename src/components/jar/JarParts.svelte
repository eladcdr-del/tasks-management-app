<script lang="ts">
  /*
   * JarParts ('each' jars): one row per current member, their own part only (never a comparison,
   * never sorted by who did more): avatar, name, a segment per task of the share, and "4 מתוך 5" or
   * "הושלם". Segments fill with a small spring; when a part completes while the screen is open the
   * avatar gets a burst of member-coloured sparks and the check pops in. Reduced motion: still.
   */
  import { untrack } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import { Avatar } from '$components/ui';
  import type { JarPart } from '$lib/domain/jar';
  import type { Member } from '$lib/domain/types';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { reducedMotion } from '$lib/platform/motion';

  interface Props {
    parts: readonly JarPart[];
    memberById: (uid: string) => Member | null;
    class?: string;
  }

  let { parts, memberById, class: className }: Props = $props();
  const t = he.jar.part;
  /** Above this, the share is one continuous bar instead of one segment per task. */
  const MAX_SEGMENTS = 10;
  const SPARKS = 8;

  // Parts that just completed (false → true while mounted) burst for a moment.
  let bursting = $state<ReadonlySet<string>>(new Set());
  let was = untrack(() => new Map(parts.map((p) => [p.uid, p.complete])));
  $effect(() => {
    const now = parts.map((p) => [p.uid, p.complete] as const);
    untrack(() => {
      const fresh = now.filter(([uid, c]) => c && was.get(uid) === false).map(([uid]) => uid);
      was = new Map(now);
      if (fresh.length === 0 || reducedMotion.current) return;
      bursting = new Set([...bursting, ...fresh]);
      setTimeout(() => {
        bursting = new Set([...bursting].filter((uid) => !fresh.includes(uid)));
      }, 1_400);
    });
  });
</script>

<ul class={['parts', className]} aria-label={t.label}>
  {#each parts as p (p.uid)}
    {@const m = memberById(p.uid)}
    {@const name = m?.displayName ?? ''}
    <li
      class={['part', { complete: p.complete, burst: bursting.has(p.uid) }]}
      data-part={p.uid}
      data-complete={p.complete ? 'true' : 'false'}
      style:--c={`var(--member-${m?.color ?? 'terracotta'}-base)`}
      style:--c-soft={`var(--member-${m?.color ?? 'terracotta'}-soft)`}
      style:--c-ink={`var(--member-${m?.color ?? 'terracotta'}-ink)`}
    >
      <span class="visually-hidden">
        {p.complete ? t.doneAria(name) : t.aria(name, p.done, p.share)}
      </span>
      <span class="who" aria-hidden="true">
        <Avatar
          {name}
          photoURL={m?.photoURL ?? null}
          color={m?.color ?? 'terracotta'}
          size="sm"
          decorative
        />
        {#if bursting.has(p.uid)}
          <span class="sparks">
            {#each { length: SPARKS }, i (i)}
              {@const a = ((i / SPARKS) * 360 + 12) * (Math.PI / 180)}
              <span
                class="spark"
                style:--tx={`${Math.cos(a) * (i % 2 ? 22 : 30)}px`}
                style:--ty={`${Math.sin(a) * (i % 2 ? 22 : 30)}px`}
              ></span>
            {/each}
          </span>
        {/if}
      </span>
      <span class="main" aria-hidden="true">
        <span class="name" dir={textDir(name)}>{name}</span>
        {#if p.share <= MAX_SEGMENTS}
          <span class="track">
            {#each { length: p.share }, i (i)}
              <span class={['seg', { on: i < p.done }]}><span class="fill"></span></span>
            {/each}
          </span>
        {:else}
          <span class="track bar">
            <span class="seg on"
              ><span class="fill" style:transform={`scaleX(${p.done / p.share})`}></span></span
            >
          </span>
        {/if}
      </span>
      <span class="state" aria-hidden="true">
        {#if p.complete}
          <span class="done"><Check size={14} strokeWidth={2.5} />{t.done}</span>
        {:else}
          <span class="of">{t.of(p.done, p.share)}</span>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .parts {
    display: grid;
    gap: var(--s1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part {
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 52px;
  }

  .who {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
  }

  .main {
    display: grid;
    flex: 1;
    gap: 6px;
    min-inline-size: 0;
  }

  .name {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track {
    display: flex;
    gap: 3px;
    block-size: 8px;
  }

  .seg {
    flex: 1;
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--progress-track);
  }

  .fill {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: var(--c);
    transform: scaleX(0);
    transform-origin: right center;
    transition: transform 520ms var(--ease-spring);
  }

  .seg.on .fill {
    transform: scaleX(1);
  }

  .bar .fill {
    transition: transform 620ms var(--ease-out);
  }

  /* A completed part: a quiet shine on the full track. */
  .complete .seg .fill {
    background:
      linear-gradient(180deg, color-mix(in srgb, #fff 28%, transparent), transparent 70%), var(--c);
  }

  .state {
    flex: none;
    min-inline-size: 64px;
    text-align: end;
    font: var(--font-caption);
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }

  .done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px var(--s2) 3px var(--s2-5);
    border-radius: var(--r-pill);
    background: var(--success-soft);
    color: var(--sage-ink);
    font-weight: 600;
  }

  .burst .done {
    animation: pop 520ms var(--ease-spring) both;
  }

  .burst .who {
    animation: cheer 700ms var(--ease-spring);
  }

  .burst .who::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid var(--c);
    animation: ring 800ms var(--ease-out) both;
    pointer-events: none;
  }

  .sparks {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .spark {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: 5px;
    block-size: 5px;
    margin: -2.5px;
    border-radius: 50%;
    background: var(--c);
    animation: spark 760ms cubic-bezier(0.2, 0.8, 0.3, 1) both;
  }

  .spark:nth-child(even) {
    background: var(--accent);
    inline-size: 4px;
    block-size: 4px;
  }

  @keyframes spark {
    0% {
      translate: 0 0;
      scale: 0.4;
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      translate: var(--tx) var(--ty);
      scale: 1;
      opacity: 0;
    }
  }

  @keyframes ring {
    from {
      scale: 0.9;
      opacity: 0.9;
    }
    to {
      scale: 1.7;
      opacity: 0;
    }
  }

  @keyframes cheer {
    0% {
      scale: 1;
    }
    35% {
      scale: 1.16;
    }
    100% {
      scale: 1;
    }
  }

  @keyframes pop {
    from {
      scale: 0.5;
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fill,
    .bar .fill {
      transition: none;
    }

    .burst .done,
    .burst .who,
    .burst .who::after,
    .spark {
      animation: none;
    }
  }
</style>
