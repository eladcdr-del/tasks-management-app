// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CelebrationOverlay from './CelebrationOverlay.svelte';

/** Half the stage's height (CelebrationOverlay .stage: 220px): the headline starts below it. */
const STAGE_HALF = 110;

const PEOPLE = [
  { displayName: 'מיכל', color: 'terracotta' as const },
  { displayName: 'דני', color: 'slate' as const }
];

describe('CelebrationOverlay', () => {
  it('every marble lands inside the stage, never on the headline below it', () => {
    render(CelebrationOverlay, {
      props: { treat: 'ארוחה במסעדה', people: PEOPLE, onClose: () => {} }
    });
    expect(screen.getByRole('heading', { name: 'עשינו את זה ביחד' })).toBeInTheDocument();
    const marbles = [...document.querySelectorAll<HTMLElement>('.marble')];
    expect(marbles.length).toBeGreaterThan(0);
    const px = (m: HTMLElement, v: string) => parseFloat(m.style.getPropertyValue(v));
    const bottoms = marbles.map((m) => px(m, '--dy') + px(m, '--size') / 2);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(STAGE_HALF);
    // Still a burst: on the way, some fly well above the jar.
    expect(Math.min(...marbles.map((m) => px(m, '--peak')))).toBeLessThan(-STAGE_HALF);
  });

  it('the burst is in the household’s colours; everyone’s avatar closes the moment', () => {
    render(CelebrationOverlay, {
      props: { treat: 'ערב סרט', people: PEOPLE, each: true, onClose: () => {} }
    });
    const colors = new Set(
      [...document.querySelectorAll<HTMLElement>('.marble')].map((m) =>
        m.style.getPropertyValue('--c')
      )
    );
    expect(colors).toEqual(new Set(['var(--member-terracotta-base)', 'var(--member-slate-base)']));
    expect(screen.getByRole('list', { name: 'מיכל, דני' }).children).toHaveLength(2);
    expect(screen.getByText('כל אחד עשה את החלק שלו. מגיע לנו:')).toBeInTheDocument();
    expect(screen.getByText('ערב סרט')).toBeInTheDocument();
  });

  it('focuses its one button, and Escape or the button closes it', async () => {
    let closed = 0;
    render(CelebrationOverlay, {
      props: { treat: 'גלידה', people: PEOPLE, onClose: () => closed++ }
    });
    const button = screen.getByRole('button', { name: 'איזה כיף' });
    expect(document.activeElement).toBe(button);
    button.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);
  });
});
