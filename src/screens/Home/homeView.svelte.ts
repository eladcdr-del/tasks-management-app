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
  /**
   * The tasks quick add's list mode just created, in order. Once the sheet closes and they are in
   * the lists, Home scrolls the first one into sight.
   */
  addedBatch: string[];
}>({
  bucket: 'today',
  filter: 'all',
  lastAdded: null,
  addedBatch: []
});
