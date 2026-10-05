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
   *   history  earned treats, with who took part (TreatHistory: each can be deleted, with undo)
   * Marbles added since this device last looked drop in when the screen opens (the jar is drawn
   * once this round's done tasks are in, at most DONE_WAIT_MS later). No jar yet (or deleted from
   * the edit sheet): an invitation to set one up; focus that the deleted jar's controls took with
   * them lands on that invitation.
   */
  import { untrack } from 'svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Gift from '@lucide/svelte/icons/gift';
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import Puzzle from '@lucide/svelte/icons/puzzle';
  import Users from '@lucide/svelte/icons/users';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Header from '$components/shell/Header.svelte';
  import { AvatarStack, Button, Card, EmptyState, IconButton } from '$components/ui';
  import { EmptyJar } from '$components/illustrations';
  import ProgressJar from '$components/jar/ProgressJar.svelte';
  import JarParts from '$components/jar/JarParts.svelte';
  import CelebrationOverlay from '$components/jar/CelebrationOverlay.svelte';
  import TreatHistory from '$components/jar/TreatHistory.svelte';
  import { jarPicture } from '$components/jar/marbles';
  import { refocusWhenLost } from '$components/jar/refocus';
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
  import type { Member } from '$lib/domain/types';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { readSeen, statusLine, writeSeen } from './jarView';

  const t = he.jar;
  const DONE_WAIT_MS = 600;
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
  /** Done tasks order the marbles; they are worth waiting a moment for, never longer. */
  let doneWaitOver = $state(false);
  $effect(() => {
    const timer = setTimeout(() => (doneWaitOver = true), DONE_WAIT_MS);
    return () => clearTimeout(timer);
  });
  // The first frame with the jar (and, normally, its round's tasks) decides what is new to this
  // device; later additions drop as they arrive.
  $effect(() => {
    if (seen !== undefined || !hid || !jar || !(tasks.doneLoaded || doneWaitOver)) return;
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

  // The jar went away while on screen (deleted here or on another phone): the controls that held
  // focus went with it (the edit sheet's opener, the redeem button), so focus lands on the
  // invitation to start a new one.
  let setupCta: HTMLElement | undefined = $state();
  /** Focus lands here when the last earned treat is deleted. */
  let titleEl: HTMLElement | undefined = $state();
  let hadJar = untrack(() => jar !== null);
  $effect(() => {
    const has = jar !== null;
    if (hadJar && !has) {
      refocusWhenLost(() => setupCta?.querySelector<HTMLElement>('button') ?? null, 1600);
    }
    hadJar = has;
  });
</script>

<section class="jar-screen" aria-labelledby="jar-title">
  <Header>
    <h1 id="jar-title" class="title" tabindex="-1" bind:this={titleEl}>{t.title}</h1>
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
          {#snippet action()}<span class="cta" bind:this={setupCta}
              ><Button icon={Gift} onclick={openSetup}>{t.empty.cta}</Button></span
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

    <TreatHistory
      treats={household.treats}
      members={household.members}
      {today}
      onDelete={(id) => household.deleteTreat(id)}
      focusFallback={() => titleEl ?? null}
    />
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
    border-radius: var(--r-sm);
  }

  .title:focus {
    outline: none;
  }

  .title:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 4px;
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

  .empty {
    padding-block: var(--s8);
  }
</style>
