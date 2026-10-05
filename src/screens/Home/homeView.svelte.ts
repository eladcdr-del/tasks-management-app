// Home's view choices (time tab, "whose" chip, opened groups). Module state, so coming back from a
// task keeps what the user was looking at; it resets with the page (one session).
import type { HomeTab, HomeWho } from '$lib/domain/homeList';

export type HomeBucket = HomeTab;
/** 'all', 'mine', 'free', or a member uid. */
export type HomeFilter = HomeWho;

export const homeView = $state<{
  bucket: HomeBucket;
  filter: HomeFilter;
  /** Category groups opened with "עוד N" (GroupKey), and 'attention' for that block. */
  expanded: string[];
  /**
   * Tasks just added on this device: shown even inside a collapsed group, until the user picks
   * another tab or chip.
   */
  fresh: string[];
  /** The task quick add created last; Home brings it into sight once the sheet closes. */
  lastAdded: string | null;
  /**
   * The tasks quick add's list mode just created, in order. Once the sheet closes and they are in
   * the lists, Home shows them (tab "הכל", chip "פנויות") and rings them.
   */
  addedBatch: string[];
}>({
  bucket: 'today',
  filter: 'all',
  expanded: [],
  fresh: [],
  lastAdded: null,
  addedBatch: []
});
