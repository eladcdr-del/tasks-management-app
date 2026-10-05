// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CelebrationOverlay from './CelebrationOverlay.svelte';

/** Half the stage's height (CelebrationOverlay .stage: 220px): the headline starts below it. */
const STAGE_HALF = 110;

describe('CelebrationOverlay', () => {
  it('every marble lands inside the stage, never on the headline below it', () => {
    render(CelebrationOverlay, {
      props: { treat: 'ארוחה במסעדה', colors: ['terracotta', 'sage'], onClose: () => {} }
    });
    expect(screen.getByRole('heading', { name: 'הצנצנת התמלאה' })).toBeInTheDocument();
    const marbles = [...document.querySelectorAll<HTMLElement>('.marble')];
    expect(marbles.length).toBeGreaterThan(0);
    const bottoms = marbles.map(
      (m) =>
        parseFloat(m.style.getPropertyValue('--dy')) +
        parseFloat(m.style.getPropertyValue('--size')) / 2
    );
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(STAGE_HALF);
    // Still a burst: some fly well above the jar.
    expect(Math.min(...bottoms)).toBeLessThan(-STAGE_HALF);
  });
});
