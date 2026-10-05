<script lang="ts">
  /*
   * Jar (#/jar, step 4.2): the shared treat jar. A big ProgressJar (marbles in the colours of whoever
   * closed each task, no per-person tallies), the treat, "7 מתוך 10 · עוד 3 משימות", edit through
   * JarSetupSheet. When full: the CelebrationOverlay once per round (remembered per household and
   * round on this device), and "מימשנו! צנצנת חדשה" → household.redeemJar(). Below: earned treats.
   * No jar yet: an invitation to set one up.
   */
  import Pencil from '@lucide/svelte/icons/pencil';
  import Gift from '@lucide/svelte/icons/gift';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import Header from '$components/shell/Header.svelte';
  import { Button, Card, EmptyState, IconButton, SectionHeader } from '$components/ui';
  import { EmptyJar } from '$components/illustrations';
  import ProgressJar from '$components/jar/ProgressJar.svelte';
  import CelebrationOverlay from '$components/jar/CelebrationOverlay.svelte';
  import type { MemberColor } from '$lib/domain/types';
  import { isFull, remaining } from '$lib/domain/jar';
  import { formatDate } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { ui } from '$lib/state/ui.svelte';

  const t = he.jar;
  const jar = $derived(household.jar);
  const ids = $derived(household.memberIds ?? []);
  const full = $derived(isFull(jar, ids));
  const left = $derived(remaining(jar, ids));

  /** Marble colours: this round's completions in order; older ones (not loaded) in member colours. */
  const colors = $derived.by((): (MemberColor | null)[] => {
    if (!jar) return [];
    const done = tasks.done
      .filter((x) => x.completedAt !== null && x.completedAt >= jar.startedAt)
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
      .map((x) => household.memberById(x.completedBy)?.color ?? null);
    const palette = household.members.map((m) => m.color);
    const out: (MemberColor | null)[] = [];
    const missing = Math.max(0, jar.count - done.length);
    for (let i = 0; i < missing; i++) out.push(palette[i % Math.max(1, palette.length)] ?? null);
    return [...out, ...done].slice(-Math.max(jar.count, 0)).slice(0, jar.target);
  });

  // ── Celebration: once per round, per household, on this device ─────────────
  const KEY = 'homecare.jar.celebrated';
  let celebrating = $state(false);

  function celebratedRound(hid: string): number | null {
    try {
      const v = localStorage.getItem(`${KEY}.${hid}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  }

  function remember(hid: string, round: number) {
    try {
      localStorage.setItem(`${KEY}.${hid}`, String(round));
    } catch {
      // storage blocked: the overlay may show again next time, which is harmless
    }
  }

  $effect(() => {
    const hid = household.household?.id;
    if (!hid || !jar || !full) return;
    if (celebratedRound(hid) === jar.round) return;
    remember(hid, jar.round);
    celebrating = true;
    haptic('jarFull');
  });

  function redeem() {
    household.redeemJar();
    ui.show(t.redeemed);
  }

  const openSetup = () => router.openSheet({ name: 'jarSetup' });
  const today = $derived(clock.today);
</script>

<section class="jar-screen" aria-labelledby="jar-title">
  <Header>
    <h1 id="jar-title" class="title">{t.title}</h1>
    {#snippet actions()}
      {#if jar}
        <IconButton icon={Pencil} label={t.edit} variant="tonal" onclick={openSetup} />
      {/if}
    {/snippet}
  </Header>

  <div class="content">
    {#if !household.loaded}
      <!-- the household is still loading -->
    {:else if !jar}
      <div class="empty" data-jar="none">
        <EmptyState title={t.empty.title} body={t.empty.body}>
          {#snippet illustration()}<EmptyJar />{/snippet}
          {#snippet action()}<Button icon={Gift} onclick={openSetup}>{t.empty.cta}</Button
            >{/snippet}
        </EmptyState>
      </div>
    {:else}
      <Card padding="lg" class={full ? 'hero full' : 'hero'}>
        <div class="hero-inner" data-jar={full ? 'full' : 'filling'}>
          <ProgressJar count={jar.count} target={jar.target} {colors} size={200} />
          <p class="treat" dir={textDir(jar.treat)}>{jar.treat}</p>
          <p class="count">
            <span class="num" data-jar-count
              >{t.progress(Math.min(jar.count, jar.target), jar.target)}</span
            >
            {#if !full}<span class="dot" aria-hidden="true">·</span><span data-jar-left
                >{t.remaining(left)}</span
              >{/if}
          </p>
          {#if full}
            <div class="full-box">
              <p class="full-title"><PartyPopper size={18} aria-hidden="true" />{t.full}</p>
              <Button size="lg" block onclick={redeem} data-action="redeem">{t.redeem}</Button>
            </div>
          {:else}
            <p class="explainer">{t.explainer}</p>
          {/if}
        </div>
      </Card>
    {/if}

    {#if household.treats.length > 0}
      <section class="history" aria-labelledby="jar-history">
        <SectionHeader id="jar-history" title={t.history} count={household.treats.length} />
        <ul class="treats">
          {#each household.treats as e (e.id)}
            <li class="treat-row" data-treat={e.id}>
              <span class="badge" aria-hidden="true"><Gift size={18} /></span>
              <span class="treat-text">
                <span class="treat-name" dir={textDir(e.treat)}>{e.treat}</span>
                <span class="treat-meta">
                  {#if e.redeemedAt !== null}
                    {t.redeemedOn(formatDate(e.redeemedAt, { today }))}
                  {:else}
                    {t.filledOn(formatDate(e.filledAt, { today }))} · {t.waiting}
                  {/if}
                </span>
              </span>
              <span class="round">{t.round(Number(e.id) || 0)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</section>

{#if celebrating && jar}
  <CelebrationOverlay
    treat={jar.treat}
    colors={household.members.map((m) => m.color)}
    onClose={() => (celebrating = false)}
  />
{/if}

<style>
  .jar-screen {
    padding-block-end: var(--s9);
  }

  .title {
    font: var(--font-title);
    color: var(--ink);
  }

  .content {
    display: grid;
    gap: var(--s6);
    padding-inline: var(--screen-pad);
    padding-block-start: var(--s3);
  }

  .hero-inner {
    display: grid;
    justify-items: center;
    gap: var(--s2);
    text-align: center;
  }

  .content :global(.hero) {
    background:
      radial-gradient(
        90% 60% at 50% 30%,
        color-mix(in srgb, var(--accent-soft) 55%, transparent),
        transparent 70%
      ),
      var(--surface);
  }

  .treat {
    margin-block-start: var(--s3);
    font: var(--font-title);
    color: var(--ink);
    text-wrap: balance;
  }

  .count {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--s2);
    font: var(--font-body);
    color: var(--ink-2);
  }

  .count .num {
    font-weight: 600;
    color: var(--accent-ink);
  }

  .dot {
    color: var(--ink-3);
  }

  .explainer {
    max-inline-size: 30ch;
    margin-block-start: var(--s2);
    font: var(--font-callout);
    color: var(--ink-2);
    text-wrap: balance;
  }

  .full-box {
    display: grid;
    gap: var(--s3);
    inline-size: 100%;
    margin-block-start: var(--s3);
  }

  .full-title {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: var(--s2);
    font: var(--font-headline);
    color: var(--accent-ink);
  }

  .history {
    display: grid;
    gap: var(--s3);
  }

  .treats {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    overflow: hidden;
  }

  .treat-row {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s3) var(--card-pad);
  }

  .treat-row + .treat-row {
    border-block-start: 1px solid var(--line);
  }

  .badge {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .treat-text {
    display: grid;
    flex: 1;
    gap: 2px;
    min-inline-size: 0;
  }

  .treat-name {
    font: var(--font-body);
    font-weight: 500;
    color: var(--ink);
  }

  .treat-meta {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .round {
    flex: none;
    font: var(--font-caption);
    color: var(--ink-3);
  }

  .empty {
    padding-block: var(--s8);
  }
</style>
