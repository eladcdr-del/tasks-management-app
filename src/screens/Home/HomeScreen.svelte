<script lang="ts">
  /*
   * Home (step 3.2): "a clear picture in one second".
   *   header      greeting + name (clock.wall), today's date, sync pill, the household's avatars
   *   pulse       attention / today / waiting numerals (tap → that list) + balance row
   *   jar strip   JarMini
   *   attention   "דורש תשומת לב" (only when non-empty)
   *   requested   "ביקשו ממך": what someone else asked me, whatever the date tab (only when non-empty)
   *   waiting     "מחכות שמישהו ייקח" with one-tap take / request (only when non-empty, and only
   *               once someone else is in the household: alone, "take" is noise and the plan lists
   *               them anyway)
   *   plan        היום | השבוע | בהמשך + member filter, then the TaskCards (unowned ones muted)
   * Every list comes from tasks.groups (domain groupTasks); nothing is bucketed here.
   */
  import { tick } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Header from '$components/shell/Header.svelte';
  import {
    AvatarStack,
    Button,
    Chip,
    EmptyState,
    MemberChip,
    SectionHeader,
    SegmentedControl,
    Skeleton,
    SyncIndicator
  } from '$components/ui';
  import { EmptyHome } from '$components/illustrations';
  import JarMini from '$components/jar/JarMini.svelte';
  import TaskList from '$components/task/TaskList.svelte';
  import { openRequest, takeTask } from '$components/task/actions';
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
  import { homeView, type HomeBucket } from './homeView.svelte';

  const t = he.home;

  const me = $derived(household.me);
  const others = $derived(household.members.filter((m) => m.uid !== household.uid));
  const memberIds = $derived(new Set(household.members.map((m) => m.uid)));
  const alone = $derived(household.loaded && others.length === 0);
  const groups = $derived(tasks.groups);

  /** Unowned (or a former member's): highlighted in "waiting", quieter in the time lists. */
  const isUnowned = (task: Task): boolean =>
    task.ownerId === null || (memberIds.size > 0 && !memberIds.has(task.ownerId));

  // A filter on a member who left falls back to everyone.
  $effect(() => {
    const f = homeView.filter;
    if (f !== 'all' && f !== 'mine' && household.loaded && !others.some((m) => m.uid === f)) {
      homeView.filter = 'all';
    }
  });

  function matches(task: Task): boolean {
    const f = homeView.filter;
    if (f === 'all') return true;
    if (f === 'mine') return task.ownerId !== null && task.ownerId === household.uid;
    return task.ownerId === f;
  }

  const filtered = $derived({
    today: groups.today.filter(matches),
    week: groups.week.filter(matches),
    later: groups.later.filter(matches)
  });
  const list = $derived(filtered[homeView.bucket]);

  const weekend = $derived(clock.wall.weekday >= 5);
  const bucketOptions = $derived<{ value: HomeBucket; label: string; count: number }[]>([
    { value: 'today', label: t.buckets.today, count: filtered.today.length },
    {
      value: 'week',
      label: weekend ? t.buckets.weekAhead : t.buckets.week,
      count: filtered.week.length
    },
    { value: 'later', label: t.buckets.later, count: filtered.later.length }
  ]);

  const nothingOpen = $derived(tasks.openLoaded && tasks.open.length === 0);
  /**
   * An empty Today is calm only when nothing waits above it, and it points to the first tab that
   * actually has tasks (not always "השבוע").
   */
  const emptyCopy = $derived.by((): { title: string; body?: string; calm?: boolean } => {
    if (homeView.filter !== 'all') return t.empty.filtered;
    if (homeView.bucket !== 'today') return t.empty[homeView.bucket];
    const next = bucketOptions.find((o) => o.value !== 'today' && o.count > 0);
    const calm = groups.attention.length === 0 && groups.requested.length === 0;
    return {
      title: calm ? t.empty.today.title : t.empty.today.rest,
      body: next ? t.empty.today.body(next.label) : undefined,
      calm
    };
  });

  let attentionEl: HTMLElement | undefined = $state();
  let requestedEl: HTMLElement | undefined = $state();
  let waitingEl: HTMLElement | undefined = $state();
  let planEl: HTMLElement | undefined = $state();

  async function pick(key: 'attention' | 'today' | 'waiting' | 'requested') {
    let target: HTMLElement | undefined;
    if (key === 'today') {
      homeView.bucket = 'today';
      await tick();
      target = planEl;
    } else {
      target = key === 'attention' ? attentionEl : key === 'requested' ? requestedEl : waitingEl;
      if (!target) {
        // Nothing to show there: the plan list is the closest useful place.
        target = planEl;
      }
    }
    target?.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth', block: 'start' });
  }
</script>

{#snippet unownedActions(task: Task)}
  <Button size="sm" onclick={() => takeTask(task.id)} data-action="take"
    >{he.taskCard.take(me ?? 'n')}</Button
  >
  {#if others.length > 0}
    <Button size="sm" variant="secondary" onclick={() => openRequest(task.id)} data-action="request"
      >{he.taskCard.request}</Button
    >
  {/if}
{/snippet}

<section class="home" aria-labelledby="home-title">
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
        <section class="block" bind:this={attentionEl} data-section="attention">
          <SectionHeader
            id="home-attention"
            title={t.sections.attention}
            count={groups.attention.length}
            tone="danger"
          />
          <TaskList
            tasks={groups.attention}
            label={t.sections.attention}
            actions={unownedActions}
            withActions={isUnowned}
          />
        </section>
      {/if}

      {#if groups.requested.length > 0}
        <section class="block" bind:this={requestedEl} data-section="requested">
          <SectionHeader
            id="home-requested"
            title={t.sections.requested}
            count={groups.requested.length}
          />
          <TaskList tasks={groups.requested} label={t.sections.requested} />
        </section>
      {/if}

      {#if groups.waiting.length > 0 && !alone}
        <section class="block" bind:this={waitingEl} data-section="waiting">
          <SectionHeader
            id="home-waiting"
            title={t.sections.waiting}
            count={groups.waiting.length}
          />
          <TaskList tasks={groups.waiting} label={t.sections.waiting} actions={unownedActions} />
        </section>
      {/if}

      <section class="block plan" bind:this={planEl} data-section="plan">
        <SegmentedControl
          options={bucketOptions}
          bind:value={homeView.bucket}
          label={t.buckets.label}
          haptics
        />
        {#if others.length > 0}
          <div class="filters" role="group" aria-label={t.filters.label}>
            <Chip
              label={t.filters.all}
              selected={homeView.filter === 'all'}
              onclick={() => (homeView.filter = 'all')}
            />
            <Chip
              label={t.filters.mine}
              selected={homeView.filter === 'mine'}
              onclick={() => (homeView.filter = 'mine')}
            />
            {#each others as m (m.uid)}
              <MemberChip
                person={m}
                prefix={t.filters.ofPrefix}
                selected={homeView.filter === m.uid}
                onclick={() => (homeView.filter = m.uid)}
              />
            {/each}
          </div>
        {/if}

        {#if list.length > 0}
          <TaskList
            tasks={list}
            label={bucketOptions.find((o) => o.value === homeView.bucket)?.label ?? ''}
            muted={alone ? undefined : isUnowned}
          />
        {:else}
          <div class="bucket-empty" data-empty={homeView.bucket}>
            <EmptyState title={emptyCopy.title} body={emptyCopy.body} compact level={3}>
              {#snippet illustration()}
                {#if emptyCopy.calm}<EmptyHome />{/if}
              {/snippet}
            </EmptyState>
          </div>
        {/if}
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
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s2);
    padding-block-start: var(--s2);
  }

  .content {
    display: grid;
    gap: var(--s4);
    padding-inline: var(--screen-pad);
    padding-block-start: var(--s3);
  }

  .block {
    display: grid;
    gap: var(--s3);
    margin-block-start: var(--s3);
    scroll-margin-block-start: var(--s4);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
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
