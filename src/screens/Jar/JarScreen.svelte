<script lang="ts">
  /*
   * Jar (#/jar): the shared treat jar, a team goal.
   *   hero     the jar (marbles in the colour of whoever closed each task, a heart on a task done
   *            for whoever asked, a halo on a bonus), the treat, the goal ("כל אחד מאיתנו סוגר 5
   *            משימות" / "ביחד · 10 משימות"), "7 מתוך 10" and a warm team line ("עוד משימה אחת
   *            שלך ו־2 משימות של דני, ואנחנו בצ׳ופר")
   *   parts    'each': every member's own part (JarParts); 'together': who has added marbles.
   *            Never a ranking. Bonus completions are shared ("ועוד 2 משימות בונוס")
   *   full     "עשינו את זה ביחד" + "מימשנו! צנצנת חדשה" → household.redeemJar(), then the setup
   *            sheet for the next treat. The CelebrationOverlay once per round (remembered per
   *            household and round on this device)
   *   history  earned treats, with who took part
   * Marbles added since this device last looked drop in when the screen opens. No jar yet: an
   * invitation to set one up.
   */
  import { untrack } from 'svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Gift from '@lucide/svelte/icons/gift';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import Puzzle from '@lucide/svelte/icons/puzzle';
  import Users from '@lucide/svelte/icons/users';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Header from '$components/shell/Header.svelte';
  import { AvatarStack, Button, Card, EmptyState, IconButton, SectionHeader } from '$components/ui';
  import { EmptyJar } from '$components/illustrations';
  import ProgressJar from '$components/jar/ProgressJar.svelte';
  import JarParts from '$components/jar/JarParts.svelte';
  import CelebrationOverlay from '$components/jar/CelebrationOverlay.svelte';
  import { jarPicture } from '$components/jar/marbles';
  import {
    bonusOf,
    contributors,
    filled,
    isFull,
    modeOf,
    partsOf,
    required,
    shareOf
  } from '$lib/domain/jar';
  import type { EarnedTreat, Member } from '$lib/domain/types';
  import { formatDate } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { readSeen, statusLine, writeSeen } from './jarView';

  const t = he.jar;
  const jar = $derived(household.jar);
  const ids = $derived(household.memberIds ?? household.members.map((m) => m.uid));
  const each = $derived(jar !== null && modeOf(jar) === 'each');
  const full = $derived(isFull(jar, ids));
  const parts = $derived(partsOf(jar, ids));
  const bonus = $derived(bonusOf(jar, ids));
  const helpers = $derived(
    contributors(jar, ids)
      .map((uid) => household.memberById(uid))
      .filter((m): m is Member => m !== null)
  );
  const status = $derived(
    statusLine(jar, ids, household.uid, (uid) => household.memberById(uid)?.displayName ?? '')
  );
  const picture = $derived(
    jarPicture(jar, ids, (uid) => household.memberById(uid)?.color ?? null, tasks.done)
  );
  const count = $derived(jar ? t.progress(filled(jar, ids), required(jar, ids)) : '');

  // ── Marbles added since this device last looked drop in ────────────────────
  const hid = $derived(household.household?.id ?? null);
  let seen = $state<number | undefined>(undefined);
  // The first frame with the jar and its round's tasks decides what is new to this device; later
  // additions drop as they arrive.
  $effect(() => {
    if (seen !== undefined || !hid || !jar || !tasks.doneLoaded) return;
    seen = untrack(() => readSeen(hid, jar.round));
  });
  $effect(() => {
    if (seen === undefined || !hid || !jar) return;
    writeSeen(hid, jar.round, picture.marbles.length);
  });

  // ── Celebration: once per round, per household, on this device ─────────────
  const KEY = 'homecare.jar.celebrated';
  let celebrating = $state(false);

  function celebratedRound(id: string): number | null {
    try {
      const v = localStorage.getItem(`${KEY}.${id}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  }

  function remember(id: string, round: number) {
    try {
      localStorage.setItem(`${KEY}.${id}`, String(round));
    } catch {
      // storage blocked: the overlay may show again next time, which is harmless
    }
  }

  $effect(() => {
    if (!hid || !jar || !full) return;
    if (celebratedRound(hid) === jar.round) return;
    remember(hid, jar.round);
    celebrating = true;
    haptic('jarFull');
  });

  function redeem() {
    household.redeemJar();
    router.openSheet({ name: 'jarSetup', next: true });
  }

  const openSetup = () => router.openSheet({ name: 'jarSetup' });
  const today = $derived(clock.today);

  /** Who took part in an earned treat, in the household's order (treats earned since goal modes know). */
  const tookPart = (e: EarnedTreat): Member[] =>
    household.members.filter((m) => (e.counts?.[m.uid] ?? 0) > 0);
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
        <div
          class="hero-inner"
          data-jar={full ? 'full' : 'filling'}
          data-jar-mode={each ? 'each' : 'together'}
        >
          {#if seen !== undefined}
            <ProgressJar
              marbles={picture.marbles}
              empty={picture.empty}
              {seen}
              {full}
              label={t.aria(filled(jar, ids), required(jar, ids))}
              size={196}
            />
          {:else}
            <div class="jar-space" aria-hidden="true"></div>
          {/if}
          <p class="treat" dir={textDir(jar.treat)}>{jar.treat}</p>
          <p class="goal" data-jar-goal>
            {#if each}<Puzzle size={15} aria-hidden="true" />{t.goal.each(
                shareOf(jar)
              )}{:else}<Users size={15} aria-hidden="true" />{t.goal.together(jar.target)}{/if}
          </p>
          {#if full}
            <div class="full-box">
              <p class="full-title"><PartyPopper size={18} aria-hidden="true" />{t.full}</p>
              <Button size="lg" block onclick={redeem} data-action="redeem">{t.redeem}</Button>
            </div>
          {:else}
            <p class="count"><span class="num" data-jar-count>{count}</span></p>
            <p class="status" data-jar-left>{status}</p>
          {/if}
        </div>

        {#if each && parts.length > 0}
          <div class="parts-block">
            <JarParts {parts} memberById={(uid) => household.memberById(uid)} />
          </div>
        {:else if helpers.length > 0}
          <div class="parts-block helpers" data-jar-helpers>
            <AvatarStack people={helpers} size="sm" max={6} backdrop="var(--surface)" />
            <span>{t.contributors}</span>
          </div>
        {/if}
        {#if bonus > 0}
          <p class="bonus" data-jar-bonus>
            <Sparkles size={15} aria-hidden="true" />{t.bonus(bonus)}
          </p>
        {/if}
      </Card>
    {/if}

    {#if household.treats.length > 0}
      <section class="history" aria-labelledby="jar-history">
        <SectionHeader id="jar-history" title={t.history} count={household.treats.length} />
        <ul class="treats">
          {#each household.treats as e (e.id)}
            {@const who = tookPart(e)}
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
              <span class="treat-end">
                {#if who.length > 0}
                  <AvatarStack
                    people={who}
                    size="xs"
                    max={4}
                    backdrop="var(--surface)"
                    label={t.tookPart(who.map((m) => m.displayName).join(', '))}
                  />
                {/if}
                <span class="round">{t.round(Number(e.id) || 0)}</span>
              </span>
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
    people={household.members}
    {each}
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
    gap: var(--s1);
    text-align: center;
  }

  .jar-space {
    inline-size: 196px;
    block-size: 235px;
  }

  .content :global(.hero) {
    background:
      radial-gradient(
        90% 55% at 50% 26%,
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

  .goal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-block-start: var(--s1);
    padding: 4px var(--s3);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .count {
    margin-block-start: var(--s3);
    font: var(--font-headline);
    font-variant-numeric: tabular-nums;
  }

  .count .num {
    color: var(--accent-ink);
  }

  .status {
    max-inline-size: 30ch;
    font: var(--font-callout);
    color: var(--ink-2);
    text-wrap: balance;
  }

  .full-box {
    display: grid;
    gap: var(--s3);
    inline-size: 100%;
    margin-block-start: var(--s4);
  }

  .full-title {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: var(--s2);
    font: var(--font-headline);
    color: var(--accent-ink);
  }

  .parts-block {
    margin-block-start: var(--s5);
    padding-block-start: var(--s4);
    border-block-start: 1px solid var(--line);
  }

  .helpers {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--s2);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .bonus {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    margin-block-start: var(--s3);
    font: var(--font-caption);
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

  .treat-end {
    display: grid;
    justify-items: end;
    gap: 4px;
    flex: none;
  }

  .round {
    font: var(--font-caption);
    color: var(--ink-3);
  }

  .empty {
    padding-block: var(--s8);
  }
</style>
