// Many tasks added at once (quick add's list mode, homeView.addedBatch): once the sheet has closed,
// Home brings them into sight. It scrolls to where most of them landed (usually "waiting": they have
// no owner) and gives every new card a short ring, so they stand out from the tasks already there.

/** Space kept above the target: a section's own top, or a peek of the card before a card. */
const SECTION_MARGIN = 16;
const CARD_MARGIN = 72;
/** Already in comfortable sight when its top is in the upper part of the screen. */
const IN_SIGHT = 0.6;
/** Frames to wait at most for the sheet's exit (about one second). */
const MAX_WAIT_FRAMES = 60;

export interface RevealOptions {
  reducedMotion: boolean;
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

/** Scrolls the new cards into sight and rings them. Waits for an open sheet to finish closing. */
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
  const top = el.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight * IN_SIGHT) {
    window.scrollTo({
      top: Math.max(0, window.scrollY + top - margin),
      behavior: opts.reducedMotion ? 'auto' : 'smooth'
    });
  }
  ring(cards);
}

/** A soft accent ring that holds, then fades (no movement, so it also suits reduced motion). */
function ring(cards: readonly HTMLElement[]): void {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d9774b';
  const on = `0 0 0 2px ${accent}`;
  const off = '0 0 0 2px transparent';
  for (const card of cards) {
    card.animate?.(
      [
        { boxShadow: on, offset: 0 },
        { boxShadow: on, offset: 0.6 },
        { boxShadow: off, offset: 1 }
      ],
      { duration: 2600, easing: 'ease-out' }
    );
  }
}
