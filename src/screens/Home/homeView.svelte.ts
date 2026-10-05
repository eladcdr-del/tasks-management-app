// Home's view choices (bucket tab, member filter). Module state, so coming back from a task keeps
// the tab the user was on; it resets with the page.
export type HomeBucket = 'today' | 'week' | 'later';
/** 'all', 'mine', or a member uid. */
export type HomeFilter = string;

export const homeView = $state<{
  bucket: HomeBucket;
  filter: HomeFilter;
  /** The task quick add created last; Home brings it into sight once the sheet closes. */
  lastAdded: string | null;
}>({
  bucket: 'today',
  filter: 'all',
  lastAdded: null
});
