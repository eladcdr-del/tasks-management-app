<script lang="ts">
  // The list under Home's control bar (feature "home"). Up to GROUP_ABOVE tasks: one surface of
  // compact rows. More: category groups (domain/homeList groupByCategory), each with its icon,
  // name and count, showing its first three tasks (plus the ones just added) and "עוד N" for the
  // rest. Opened groups stay open for the session (homeView.expanded). Folding a group the reader
  // has scrolled into brings its heading back under the bar.
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { CategoryIcon } from '$components/ui';
  import TaskList from '$components/task/TaskList.svelte';
  import type { RowSelection } from '$components/task/selection';
  import { categoryLabel } from '$lib/domain/categories';
  import { groupByCategory, preview, shouldGroup, type GroupKey } from '$lib/domain/homeList';
  import type { Task } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';
  import { reducedMotion } from '$lib/platform/motion';
  import { homeView } from './homeView.svelte';
  import MoreToggle from './MoreToggle.svelte';

  interface Props {
    tasks: readonly Task[];
    /** Accessible name of the flat list (the tab's name). */
    label: string;
    trailing?: Snippet<[Task]>;
    withTrailing?: (task: Task) => boolean;
    actions?: Snippet<[Task]>;
    withActions?: (task: Task) => boolean;
    /** Choosing several tasks at once. */
    selection?: RowSelection;
  }

  let { tasks, label, trailing, withTrailing, actions, withActions, selection }: Props = $props();

  const grouped = $derived(shouldGroup(tasks.length));
  const groups = $derived(grouped ? groupByCategory(tasks) : []);
  const fresh = $derived(new Set(homeView.fresh));

  const nameOf = (key: GroupKey): string =>
    key === 'misc' ? he.home.groups.misc : categoryLabel(key);
  const isOpen = (key: GroupKey): boolean => homeView.expanded.includes(key);

  const sections: Partial<Record<GroupKey, HTMLElement>> = $state({});

  async function toggle(key: GroupKey) {
    if (isOpen(key)) {
      homeView.expanded = homeView.expanded.filter((k) => k !== key);
      await tick();
      const section = sections[key];
      // Folding a long group can pull the page up past its heading: bring the heading back.
      if (section && section.getBoundingClientRect().top < 0) {
        section.scrollIntoView({
          block: 'start',
          behavior: reducedMotion.current ? 'auto' : 'smooth'
        });
      }
    } else {
      homeView.expanded = [...homeView.expanded, key];
    }
  }
</script>

{#if !grouped}
  <TaskList
    {tasks}
    {label}
    variant="row"
    {trailing}
    {withTrailing}
    {actions}
    {withActions}
    {selection}
  />
{:else}
  <div class="groups">
    {#each groups as g (g.key)}
      {@const open = isOpen(g.key)}
      {@const p = preview(g.tasks, open, fresh)}
      {@const foldable = open && preview(g.tasks, false, fresh).hidden > 0}
      {@const head = `home-group-${g.key}`}
      <section class="group" data-group={g.key} aria-labelledby={head} bind:this={sections[g.key]}>
        <h3 class="group-head" id={head}>
          <span class="g-icon" aria-hidden="true"
            ><CategoryIcon id={g.key === 'misc' ? 'other' : g.key} /></span
          >
          <span class="g-name">{nameOf(g.key)}</span>
          <span class="g-count num">{g.tasks.length}</span>
        </h3>
        <TaskList
          id={`${head}-list`}
          tasks={p.shown}
          labelledby={head}
          variant="row"
          showCategory={false}
          {trailing}
          {withTrailing}
          {actions}
          {withActions}
          {selection}
        >
          {#snippet footer()}
            {#if p.hidden > 0 || foldable}
              <MoreToggle
                {open}
                hidden={p.hidden}
                name={nameOf(g.key)}
                controls={`${head}-list`}
                ontoggle={() => toggle(g.key)}
              />
            {/if}
          {/snippet}
        </TaskList>
      </section>
    {/each}
  </div>
{/if}

<style>
  .groups {
    display: grid;
    gap: var(--s3-5);
  }

  .group {
    display: grid;
    gap: var(--s1);
    scroll-margin-block-start: calc(var(--home-bar-h, 0px) + var(--s2));
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding-inline: var(--s1);
    font: var(--font-callout);
    font-weight: 600;
    color: var(--ink);
  }

  .g-icon {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .g-icon :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }

  .g-name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .g-count {
    color: var(--ink-2);
    font-size: var(--fs-caption);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>
