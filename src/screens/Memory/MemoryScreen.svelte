<script lang="ts">
  // owner: step 3.3 (Memory, #/memory). "זיכרון הבית": every completed task, searchable in natural
  // Hebrew ("מתי החלפנו מצבר ובאיזה מוסך?") over title, notes and the documentation. Category and
  // member chips filter; results are grouped by month. Nothing hides behind extra taps: search,
  // filters and the cards (who, when, cost, place, photo) are all on the screen.
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import type { CategoryId } from '$lib/domain/types';
  import { DEFAULT_CATEGORIES } from '$lib/domain/categories';
  import { searchDoneTasks } from '$lib/domain/search';
  import {
    Button,
    Chip,
    EmptyState,
    ICON_STROKE,
    MemberChip,
    Skeleton,
    TextField,
    categoryIcon
  } from '$components/ui';
  import { EmptyMemory } from '$components/illustrations';
  import MemoryCard from '$components/memory/MemoryCard.svelte';
  import { groupByMonth } from '$components/memory/group';
  import { he } from '$lib/i18n/he';
  import { tasks } from '$lib/state/tasks.svelte';
  import { household } from '$lib/state/household.svelte';
  import { clock } from '$lib/state/clock.svelte';

  const t = he.memory;

  let query = $state('');
  let categoryId = $state<CategoryId | null>(null);
  let memberId = $state<string | null>(null);

  const today = $derived(clock.today);
  const filtering = $derived(query.trim() !== '' || categoryId !== null || memberId !== null);
  const results = $derived(searchDoneTasks(tasks.done, query, { categoryId, memberId }));
  const groups = $derived(groupByMonth(results));
  /** Only the categories the history actually has (plus a selected one). */
  const categories = $derived(
    DEFAULT_CATEGORIES.filter(
      (c) => c.id === categoryId || tasks.done.some((d) => d.categoryId === c.id)
    )
  );
  const members = $derived(household.members.length > 1 ? household.members : []);

  // A search or filter looks through the WHOLE memory: page older history in while there is more.
  $effect(() => {
    if (filtering && tasks.doneLoaded && tasks.hasMoreDone) tasks.loadMoreDone();
  });

  function clearAll() {
    query = '';
    categoryId = null;
    memberId = null;
  }
</script>

<section class="memory" data-testid="memory">
  <header class="head">
    <h1>{t.title}</h1>
    <p class="subtitle">{t.subtitle}</p>
  </header>

  <div class="search" role="search">
    <TextField
      label={t.searchLabel}
      hideLabel
      type="search"
      icon={Search}
      placeholder={t.searchPlaceholder}
      bind:value={query}
      enterkeyhint="search"
      autocomplete="off"
    >
      {#snippet trailing()}
        {#if query}
          <button type="button" class="clear" aria-label={t.clearSearch} onclick={() => (query = '')}>
            <X strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
        {/if}
      {/snippet}
    </TextField>
  </div>

  {#if categories.length > 0 || members.length > 0}
    <div class="filters" aria-label={t.filters} role="group">
      {#each categories as c (c.id)}
        <Chip
          label={c.short}
          icon={categoryIcon(c.id)}
          selected={categoryId === c.id}
          onclick={() => (categoryId = categoryId === c.id ? null : c.id)}
          data-category={c.id}
        />
      {/each}
      {#if members.length > 0 && categories.length > 0}
        <span class="sep" aria-hidden="true"></span>
      {/if}
      {#each members as m (m.uid)}
        <MemberChip
          person={m}
          selected={memberId === m.uid}
          onclick={() => (memberId = memberId === m.uid ? null : m.uid)}
          data-member={m.uid}
        />
      {/each}
    </div>
  {/if}

  {#if !tasks.doneLoaded}
    <div class="list" aria-busy="true">
      <Skeleton width="30%" height="18px" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  {:else if tasks.done.length === 0}
    <EmptyState title={t.emptyTitle} body={t.emptyBody}>
      {#snippet illustration()}<EmptyMemory />{/snippet}
    </EmptyState>
  {:else if results.length === 0}
    <EmptyState title={t.noMatchTitle} body={t.noMatchBody} compact>
      {#snippet illustration()}<EmptyMemory />{/snippet}
      {#snippet action()}
        <Button variant="secondary" onclick={clearAll}>{t.clearFilters}</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#if filtering}
      <p class="count" role="status">{t.results(results.length)}</p>
    {/if}
    <div class="list">
      {#each groups as g (g.key)}
        <section class="month" aria-labelledby="m-{g.key}" data-month={g.key}>
          <h2 id="m-{g.key}" class="month-title">{g.label}</h2>
          <ul class="cards">
            {#each g.tasks as task (task.id)}
              <li><MemoryCard {task} {today} /></li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
    {#if !filtering && tasks.hasMoreDone}
      <div class="more">
        <Button variant="secondary" onclick={() => tasks.loadMoreDone()}>{t.loadMore}</Button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .memory {
    display: grid;
    align-content: start;
    gap: var(--s4);
    padding: calc(var(--safe-top) + var(--s6)) var(--screen-pad) calc(var(--s10) + var(--s8));
  }

  .head {
    display: grid;
    gap: var(--s1);
  }

  h1 {
    font: var(--font-display);
    color: var(--ink);
  }

  .subtitle {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .search :global(input[type='search']::-webkit-search-cancel-button) {
    appearance: none;
  }

  .clear {
    display: grid;
    place-items: center;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    margin-inline-end: calc(var(--s2) * -1);
    border-radius: var(--r-pill);
    color: var(--ink-2);
  }

  .clear :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .filters {
    display: flex;
    align-items: center;
    gap: var(--s2);
    margin-inline: calc(var(--screen-pad) * -1);
    padding-inline: var(--screen-pad);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filters > :global(*) {
    flex: none;
  }

  .sep {
    inline-size: 1px;
    block-size: 24px;
    background: var(--line);
  }

  .count {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .list {
    display: grid;
    gap: var(--s6);
  }

  .month {
    display: grid;
    gap: var(--s3);
  }

  .month-title {
    font: var(--font-caption);
    font-weight: 600;
    color: var(--ink-2);
    letter-spacing: 0.01em;
  }

  .cards {
    display: grid;
    gap: var(--s3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .more {
    display: flex;
    justify-content: center;
  }
</style>
