// Tasks just added (quick add, and its list mode: homeView.lastAdded / addedBatch): once the sheet
// has closed and Home has switched to a view that lists them, Home brings them into sight. It
// scrolls to where most of them landed (usually the list under the bar) and gives every new row a
// short accent wash, so they stand out from the tasks already there. `topInset` is the sticky bar
// that covers the top of the screen once the list scrolls under it.

/** Space kept above the target: a section's own top, or a peek of the card before a card. */
const SECTION_MARGIN = 16;
const CARD_MARGIN = 72;
/** Already in comfortable sight when its top is in the upper part of the screen. */
const IN_SIGHT = 0.6;
/** Frames to wait at most for the sheet's exit (about one second). */
const MAX_WAIT_FRAMES = 60;

export interface RevealOptions {
  reducedMotion: boolean;
  /** Height covered at the top of the screen (Home's sticky control bar). */
  topInset?: number;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** The cards of `ids` under `root`, in page order. */
export function addedCards(root: ParentNode, ids: ReadonlySet<string>): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-task-id]')].filter((el) =>
    ids.has(el.dataset.taskId ?? '')
  );
}

/**
 * Where to scroll: the section holding most of the new cards (the first such section on a tie),
 * at its first new card. When that card opens its section, the section itself, so its heading
 * shows too.
 */
export function revealTarget(cards: readonly HTMLElement[]): { el: HTMLElement; margin: number } {
  const bySection = new Map<Element | null, HTMLElement[]>();
  for (const card of cards) {
    const section = card.closest('[data-section]');
    bySection.set(section, [...(bySection.get(section) ?? []), card]);
  }
  let best: [Element | null, HTMLElement[]] = [null, []];
  for (const entry of bySection) if (entry[1].length > best[1].length) best = entry;
  const [section, inSection] = best;
  const first = inSection[0] ?? cards[0]!;
  if (section instanceof HTMLElement && section.querySelector('[data-task-id]') === first) {
    return { el: section, margin: SECTION_MARGIN };
  }
  return { el: first, margin: CARD_MARGIN };
}

/** Scrolls the new cards into sight and marks them. Waits for an open sheet to finish closing. */
export async function revealAdded(
  root: HTMLElement,
  ids: ReadonlySet<string>,
  opts: RevealOptions
): Promise<void> {
  // Popping the sheet's history entry restores the page's scroll position, which would cancel a
  // scroll started while the sheet is still on its way out.
  for (let i = 0; i < MAX_WAIT_FRAMES && document.querySelector('dialog[open]'); i++) {
    await nextFrame();
  }
  await nextFrame();
  const cards = addedCards(root, ids);
  if (cards.length === 0) return;

  const { el, margin } = revealTarget(cards);
  // A section's own top holds the bar; a card further down must clear it.
  const inset = el.dataset.section === undefined ? (opts.topInset ?? 0) : 0;
  const top = el.getBoundingClientRect().top;
  if (top < inset || top > window.innerHeight * IN_SIGHT) {
    window.scrollTo({
      top: Math.max(0, window.scrollY + top - margin - inset),
      behavior: opts.reducedMotion ? 'auto' : 'smooth'
    });
  }
  wash(cards);
}

/**
 * A soft accent wash over each new card's surface that holds, then fades back (no movement, so it
 * also suits reduced motion).
 */
function wash(cards: readonly HTMLElement[]): void {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'peru';
  for (const card of cards) {
    const surface = card.querySelector<HTMLElement>('article') ?? card;
    const base = getComputedStyle(surface).backgroundColor || 'transparent';
    const on = `color-mix(in srgb, ${accent} 20%, ${base})`;
    surface.animate?.(
      [
        { backgroundColor: on, offset: 0 },
        { backgroundColor: on, offset: 0.55 },
        { backgroundColor: base, offset: 1 }
      ],
      { duration: 2800, easing: 'ease-out' }
    );
  }
}
