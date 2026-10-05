<script lang="ts">
  /*
   * Home (step 3.2; feature "home": calm with many tasks). "A clear picture in one second", and a
   * list that stays short however many tasks the family adds.
   *   header      greeting + name (clock.wall), today's date, sync pill, the household's avatars
   *   pulse       attention / today / waiting numerals, then one line: the "ביקשו ממך" link and the
   *               balance. Tap: attention / requests scroll to their block; today shows tab "היום"
   *               (chip "הכל"); waiting shows tab "הכל" with chip "פנויות"
   *   jar strip   JarMini
   *   attention   "דורש תשומת לב" (only when non-empty): at most three, then "עוד N"; every row
   *               ends with its seat, an urgent request to me carries its two answers instead
   *   requested   "ביקשו ממך": requests waiting for my answer, whatever the tab (only when
   *               non-empty), each with "אני לוקח/ת" / "לא מתאים לי". Not mine until I accept
   *   bar         sticky: time tabs "היום · השבוע · בהמשך · הכל" with counts, and the chips
   *               "הכל · שלי · פנויות · <member>"; they combine (homeView, kept for the session)
   *   list        the open tasks of that view, minus what the blocks above already show
   *               (domain/homeList). Every row ends with its seat (components/task/Seat): the
   *               owner's avatar, or the empty seat ("לקחת": me, or ask anyone at once), or a
   *               request that waits ("מחכה לדני"). Past six tasks it folds into category groups of
   *               three with "עוד N" (HomeList)
   * Adding: quick add's last task (homeView.lastAdded) and a list's tasks (homeView.addedBatch)
   * switch the bar to a view that lists them, stay in sight even inside a folded group
   * (homeView.fresh), and are scrolled to and washed for a moment (revealAdded.ts). Alone in the
   * household the seat takes a task at once (nobody to ask): a new undated task is found the same way.
   */
  import { tick, untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Header from '$components/shell/Header.svelte';
  import {
    AvatarStack,
    Button,
    EmptyState,
    SectionHeader,
    Skeleton,
    SyncIndicator
  } from '$components/ui';
  import { EmptyHome } from '$components/illustrations';
  import JarMini from '$components/jar/JarMini.svelte';
  import TaskList from '$components/task/TaskList.svelte';
  import Seat from '$components/task/Seat.svelte';
  import { acceptRequest, declineRequest } from '$components/task/actions';
  import { isRequestFor } from '$lib/domain/buckets';
  import {
    homeList,
    isFree,
    matchesWho,
    nextTabWithTasks,
    preview,
    tabCounts,
    type HomeTab,
    type HomeView
  } from '$lib/domain/homeList';
  import type { Task } from '$lib/domain/types';
  import { formatLongDate, greeting } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { sync } from '$lib/state/sync.svelte';
  import { reducedMotion } from '$lib/platform/motion';
  import PulseCard from './PulseCard.svelte';
  import HomeControls from './HomeControls.svelte';
  import HomeList from './HomeList.svelte';
  import MoreToggle from './MoreToggle.svelte';
  import { homeView } from './homeView.svelte';
  import { revealAdded } from './revealAdded';

  const t = he.home;

  const me = $derived(household.me);
  const others = $derived(household.members.filter((m) => m.uid !== household.uid));
  const groups = $derived(tasks.groups);
  const memberIds = $derived(household.memberIds);

  /** Nobody holds it (a request waiting for someone's answer included). */
  const isUnowned = (task: Task): boolean => isFree(task, household.memberIds);
  /** A request waiting for my answer (it may sit in attention, with accept / decline). */
  const askedMe = (task: Task): boolean => isRequestFor(task, household.uid, household.memberIds);

  // A chip on a member who left falls back to everyone.
  $effect(() => {
    const f = homeView.filter;
    if (
      !['all', 'mine', 'free'].includes(f) &&
      household.loaded &&
      !others.some((m) => m.uid === f)
    ) {
      homeView.filter = 'all';
    }
  });

  const view = $derived<HomeView>({ tab: homeView.bucket, who: homeView.filter });
  const list = $derived(homeList(groups, view, household.uid, memberIds));
  const counts = $derived(tabCounts(groups, homeView.filter, household.uid, memberIds));

  const weekend = $derived(clock.wall.weekday >= 5);
  const tabLabel = (tab: HomeTab): string =>
    tab === 'week' && weekend ? t.buckets.weekAhead : t.buckets[tab];
  const tabOptions = $derived(
    (['today', 'week', 'later', 'all'] as const).map((value) => ({
      value,
      label: tabLabel(value),
      count: counts[value]
    }))
  );

  /** Switches the view; a new view lets go of the "just added" tasks it kept in sight. */
  function setView(next: HomeView) {
    if (next.tab === homeView.bucket && next.who === homeView.filter) return;
    homeView.bucket = next.tab;
    homeView.filter = next.who;
    homeView.fresh = [];
  }

  let planEl: HTMLElement | undefined = $state();
  let stuck = $state(false);
  let barHeight = $state(0);

  /** The user picked a tab or chip: once the list is scrolled under the bar, start it at the top. */
  async function pickView(next: HomeView) {
    const wasStuck = stuck;
    setView(next);
    if (!wasStuck) return;
    await tick();
    planEl?.scrollIntoView({ block: 'start' });
  }

  // ── Bringing just-added tasks into sight ───────────────────────────────────────
  let homeEl: HTMLElement | undefined = $state();

  /**
   * Brings just-added tasks into sight. For the ones that belong in the list, it keeps the current
   * tab and chip when they show every one, else the closest view that does (their tab, or "הכל"
   * when they span tabs; chip "הכל" when the chip hides one); `prefer` replaces that choice when it
   * lists them all. Every one of them (attention included) stays in sight inside a folded block
   * until the next view change, and gets a short wash.
   */
  function showTasks(ids: readonly string[], prefer?: HomeView) {
    const added = ids
      .map((id) => tasks.open.find((task) => task.id === id))
      .filter((task): task is Task => !!task);
    const bucketOf = (task: Task) =>
      (['today', 'week', 'later'] as const).find((b) => groups[b].some((x) => x.id === task.id));
    const listed = added.filter(
      (task) => bucketOf(task) && !groups.requested.some((x) => x.id === task.id)
    );
    const lists = (v: HomeView) => {
      const shown = new Set(homeList(groups, v, household.uid, memberIds).map((x) => x.id));
      return listed.every((task) => shown.has(task.id));
    };
    let next: HomeView = { tab: homeView.bucket, who: homeView.filter };
    if (prefer && lists(prefer)) next = prefer;
    else if (!lists(next)) {
      const tabs = new Set(listed.map(bucketOf));
      const tab: HomeTab =
        next.tab === 'all' || tabs.size !== 1 ? 'all' : ([...tabs][0] as HomeTab);
      const who = listed.every((task) =>
        matchesWho(task, next.who, household.uid, household.memberIds)
      )
        ? next.who
        : 'all';
      next = { tab, who };
    }
    setView(next);
    homeView.fresh = [...new Set([...homeView.fresh, ...added.map((task) => task.id)])];
    void tick().then(() => {
      if (homeEl) {
        void revealAdded(homeEl, new Set(ids), {
          reducedMotion: reducedMotion.current,
          topInset: barHeight
        });
      }
    });
  }

  // Tasks just added in quick add (it stays open for the next one, so there may be several): once
  // the sheet closes and the last one is on Home, show them.
  let quickAdds: string[] = [];
  $effect(() => {
    const id = homeView.lastAdded;
    if (id === null) return;
    if (!quickAdds.includes(id)) quickAdds = [...quickAdds, id];
    if (router.sheet !== null) return;
    const lists = [groups.attention, groups.requested, groups.today, groups.week, groups.later];
    if (!lists.some((l) => l.some((task) => task.id === id))) return;
    homeView.lastAdded = null;
    const ids = quickAdds;
    quickAdds = [];
    untrack(() => showTasks(ids));
  });

  // Many tasks added at once (quick add's list mode): show them with chip "פנויות" (nobody has
  // taken them), under "הכל", then scroll to them and wash them for a moment.
  $effect(() => {
    const ids = homeView.addedBatch;
    if (ids.length === 0 || router.sheet !== null || !homeEl) return;
    const added = new Set(ids);
    if (!tasks.open.some((task) => added.has(task.id))) return;
    homeView.addedBatch = [];
    untrack(() => showTasks(ids, { tab: 'all', who: 'free' }));
  });

  // ── Empty states ───────────────────────────────────────────────────────────────
  const nothingOpen = $derived(tasks.openLoaded && tasks.open.length === 0);
  /**
   * An empty list says why, and points to the first tab that has tasks under the same chip. An
   * empty Today is calm only when nothing waits above it or for someone to take it.
   */
  const emptyCopy = $derived.by((): { title: string; body?: string; calm?: boolean } => {
    const { tab, who } = view;
    const next = nextTabWithTasks(counts, tab);
    const pointer = next && tab !== 'all' ? t.empty.today.body(tabLabel(next)) : undefined;
    if (who === 'free') {
      return { title: counts.all === 0 ? t.empty.free.none : t.empty.free.title, body: pointer };
    }
    if (who !== 'all')
      return { title: t.empty.filtered.title, body: pointer ?? t.empty.filtered.body };
    if (tab === 'all') return { title: t.empty.allTab.title };
    if (tab !== 'today') return t.empty[tab];
    const calm =
      groups.attention.length === 0 && groups.requested.length === 0 && groups.waiting.length === 0;
    return {
      title: calm ? t.empty.today.title : t.empty.today.rest,
      body: pointer,
      calm
    };
  });

  // ── Attention: three, then "עוד N" ────────────────────────────────────────────
  const freshSet = $derived(new Set(homeView.fresh));
  const attentionOpen = $derived(homeView.expanded.includes('attention'));
  const attention = $derived(preview(groups.attention, attentionOpen, freshSet));
  const attentionFoldable = $derived(
    attentionOpen && preview(groups.attention, false, freshSet).hidden > 0
  );
  function toggleAttention() {
    homeView.expanded = attentionOpen
      ? homeView.expanded.filter((k) => k !== 'attention')
      : [...homeView.expanded, 'attention'];
  }

  // ── Pulse ──────────────────────────────────────────────────────────────────────
  let attentionEl: HTMLElement | undefined = $state();
  let requestedEl: HTMLElement | undefined = $state();

  async function pick(key: 'attention' | 'today' | 'waiting' | 'requested') {
    let target: HTMLElement | undefined;
    if (key === 'today' || key === 'waiting') {
      setView(key === 'today' ? { tab: 'today', who: 'all' } : { tab: 'all', who: 'free' });
      await tick();
      target = planEl;
    } else {
      // Nothing to show there: the list is the closest useful place.
      target = (key === 'attention' ? attentionEl : requestedEl) ?? planEl;
    }
    target?.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth', block: 'start' });
  }
</script>

<!-- Every row ends with its seat: who does it, or take it / ask someone. A request to me answers
     below the meta line instead, with nothing at the end (the line already says who asked). -->
{#snippet seat(task: Task)}
  <Seat {task} />
{/snippet}

<!-- A request waiting for my answer: yes, or a gentle no. -->
{#snippet requestActions(task: Task)}
  <Button size="sm" onclick={() => acceptRequest(task.id)} data-action="accept"
    >{he.taskCard.accept(me ?? 'n')}</Button
  >
  <Button
    size="sm"
    variant="secondary"
    onclick={() => declineRequest(task.id)}
    data-action="decline">{he.taskCard.decline}</Button
  >
{/snippet}

<section class="home" aria-labelledby="home-title" bind:this={homeEl}>
  <Header>
    <h1 id="home-title" class="greeting">
      {t.hello(greeting(clock.wall.hour))}<bdi data-me dir={textDir(me?.displayName)}
        >{me?.displayName ?? ''}</bdi
      >
    </h1>
    <p class="date">{formatLongDate(clock.today)}</p>
    {#snippet actions()}
      <div class="head-actions">
        <SyncIndicator status={sync.status} pending={sync.pendingWrites} announce />
        {#if household.members.length > 0}
          <AvatarStack people={[...household.members]} size="sm" label={t.people} />
        {/if}
      </div>
    {/snippet}
  </Header>

  <div class="content">
    <PulseCard
      pulse={tasks.pulse}
      members={household.members}
      counts={tasks.countsByMember}
      onpick={pick}
    />

    <JarMini jar={household.jar} />

    {#if !tasks.openLoaded}
      <div class="loading" aria-busy="true" aria-label={t.loading}>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    {:else if nothingOpen}
      <div class="all-clear">
        <EmptyState title={t.empty.all.title} body={t.empty.all.body} compact>
          {#snippet illustration()}<EmptyHome />{/snippet}
          {#snippet action()}
            <Button icon={Plus} onclick={() => router.openSheet({ name: 'quickAdd' })}
              >{t.newTask}</Button
            >
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      {#if groups.attention.length > 0}
        <section
          class="block"
          bind:this={attentionEl}
          data-section="attention"
          aria-labelledby="home-attention"
        >
          <SectionHeader
            id="home-attention"
            title={t.sections.attention}
            count={groups.attention.length}
            tone="danger"
          />
          <TaskList
            id="home-attention-list"
            tasks={attention.shown}
            labelledby="home-attention"
            variant="row"
            trailing={seat}
            actions={requestActions}
            withActions={askedMe}
          >
            {#snippet footer()}
              {#if attention.hidden > 0 || attentionFoldable}
                <MoreToggle
                  open={attentionOpen}
                  hidden={attention.hidden}
                  name={t.sections.attention}
                  controls="home-attention-list"
                  ontoggle={toggleAttention}
                />
              {/if}
            {/snippet}
          </TaskList>
        </section>
      {/if}

      {#if groups.requested.length > 0}
        <section
          class="block"
          bind:this={requestedEl}
          data-section="requested"
          aria-labelledby="home-requested"
        >
          <SectionHeader
            id="home-requested"
            title={t.sections.requested}
            count={groups.requested.length}
          />
          <TaskList
            tasks={groups.requested}
            labelledby="home-requested"
            variant="row"
            trailing={seat}
            actions={requestActions}
          />
        </section>
      {/if}

      <section
        class="block plan"
        bind:this={planEl}
        data-section="plan"
        aria-labelledby="home-list-title"
        style:--home-bar-h="{barHeight}px"
      >
        <h2 id="home-list-title" class="visually-hidden">{t.sections.list}</h2>
        <HomeControls
          tabs={tabOptions}
          tab={homeView.bucket}
          who={homeView.filter}
          {others}
          onpick={pickView}
          bind:stuck
          bind:height={barHeight}
        />
        {#key `${view.tab}|${view.who}`}
          <div class="view" data-view={`${view.tab}|${view.who}`}>
            {#if list.length > 0}
              <HomeList
                tasks={list}
                label={tabLabel(view.tab)}
                trailing={seat}
              />
            {:else}
              <div class="bucket-empty" data-empty={view.tab}>
                <EmptyState title={emptyCopy.title} body={emptyCopy.body} compact level={3}>
                  {#snippet illustration()}
                    {#if emptyCopy.calm}<EmptyHome />{/if}
                  {/snippet}
                </EmptyState>
              </div>
            {/if}
          </div>
        {/key}
      </section>
    {/if}
  </div>
</section>

<style>
  .home {
    padding-block-end: calc(var(--s10) + var(--s6));
  }

  .greeting {
    font: var(--font-title);
    color: var(--ink);
    text-wrap: balance;
  }

  .date {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .head-actions {
    display: flex;
    flex-wrap: wrap-reverse;
    align-items: center;
    justify-content: flex-end;
    gap: var(--s2);
    padding-block-start: var(--s1);
  }

  .content {
    display: grid;
    gap: var(--s3-5);
    padding-inline: var(--screen-pad);
    padding-block-start: var(--s1);
  }

  .block {
    display: grid;
    gap: var(--s1-5);
    scroll-margin-block-start: var(--s4);
  }

  /* A heading, not a control: no tap-height needed. */
  .block :global(.section-header) {
    min-block-size: 28px;
  }

  /* Home's header sits a little closer to the top than other screens' (the list needs the room). */
  .home > :global(.header) {
    padding-block-start: calc(var(--safe-top) + var(--s3));
  }

  .plan {
    display: block;
    scroll-margin-block-start: 0;
  }

  .plan :global([data-home-controls]) {
    margin-block-end: var(--s3);
  }

  .view {
    animation: view-in var(--d-base) var(--ease-out);
  }

  @keyframes view-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .view {
      animation: none;
    }
  }

  .loading {
    display: grid;
    gap: 10px;
    margin-block-start: var(--s3);
  }

  .all-clear,
  .bucket-empty {
    padding-block: var(--s4);
  }
</style>
