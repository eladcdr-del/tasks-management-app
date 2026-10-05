// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addedCards, revealAdded, revealTarget } from './revealAdded';

// Home's shape: sections holding task cards ([data-task-id]).
function page(sections: Record<string, string[]>): HTMLElement {
  const root = document.createElement('section');
  for (const [name, ids] of Object.entries(sections)) {
    const section = document.createElement('section');
    section.dataset.section = name;
    for (const id of ids) {
      const card = document.createElement('div');
      card.dataset.taskId = id;
      section.append(card);
    }
    root.append(section);
  }
  document.body.append(root);
  return root;
}

const card = (root: HTMLElement, section: string, id: string) =>
  root.querySelector<HTMLElement>(`[data-section="${section}"] [data-task-id="${id}"]`)!;

function placeAt(el: Element, top: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 100 } as DOMRect);
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.animate = vi.fn() as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('revealTarget', () => {
  it('aims at the section holding most of the new cards, at its first new card', () => {
    const root = page({ attention: ['a1', 'n1'], waiting: ['w1', 'n2', 'n3', 'w2', 'n4'] });
    const cards = addedCards(root, new Set(['n1', 'n2', 'n3', 'n4']));
    expect(cards.map((c) => c.dataset.taskId)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(revealTarget(cards)).toEqual({ el: card(root, 'waiting', 'n2'), margin: 72 });
  });

  it('aims at the section itself when a new card opens it, so its heading shows', () => {
    const root = page({ attention: ['a1'], waiting: ['n1', 'n2', 'w1'] });
    const cards = addedCards(root, new Set(['n1', 'n2']));
    expect(revealTarget(cards)).toEqual({
      el: root.querySelector('[data-section="waiting"]'),
      margin: 16
    });
  });

  it('on a tie, the first section wins', () => {
    const root = page({ attention: ['n1'], waiting: ['w1', 'n2'] });
    const cards = addedCards(root, new Set(['n1', 'n2']));
    expect(revealTarget(cards).el).toBe(root.querySelector('[data-section="attention"]'));
  });
});

describe('revealAdded', () => {
  it('scrolls a target below the fold into sight and rings every new card', async () => {
    const root = page({ waiting: ['w1', 'n1', 'n2'], plan: ['n1'] });
    placeAt(card(root, 'waiting', 'n1'), 1500);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);
    await revealAdded(root, new Set(['n1', 'n2']), { reducedMotion: false });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 100 + 1500 - 72, behavior: 'smooth' });
    // the card in "waiting" and its muted twin in the plan list, and n2
    expect(Element.prototype.animate).toHaveBeenCalledTimes(3);
  });

  it('does not scroll when the target is already in sight; no smooth scroll with reduced motion', async () => {
    const root = page({ waiting: ['w1', 'n1'] });
    placeAt(card(root, 'waiting', 'n1'), 300);
    await revealAdded(root, new Set(['n1']), { reducedMotion: true });
    expect(window.scrollTo).not.toHaveBeenCalled();

    placeAt(card(root, 'waiting', 'n1'), -400);
    await revealAdded(root, new Set(['n1']), { reducedMotion: true });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('waits for an open sheet to close first', async () => {
    const root = page({ waiting: ['n1'] });
    placeAt(root.querySelector('[data-section="waiting"]')!, 2000);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    const done = revealAdded(root, new Set(['n1']), { reducedMotion: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(window.scrollTo).not.toHaveBeenCalled();
    dialog.remove();
    await done;
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does nothing when none of the cards is on the page', async () => {
    const root = page({ waiting: ['w1'] });
    await revealAdded(root, new Set(['gone']), { reducedMotion: false });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(Element.prototype.animate).not.toHaveBeenCalled();
  });
});
