// @vitest-environment jsdom
import '../../test/jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Household, Member, TreatJar } from '$lib/domain/types';
import { household } from '$lib/state/household.svelte';
import JarMini from './JarMini.svelte';

const member = (uid: string, displayName: string, color: Member['color']): Member => ({
  uid,
  displayName,
  photoURL: null,
  color,
  addressAs: 'f',
  role: 'member',
  joinedAt: 0,
  notify: { requests: true, reminders: true, partnerDone: true, weekly: true },
  inviteCode: null
});

function seat(jar: TreatJar | null) {
  household.members = [member('michal', 'מיכל', 'terracotta'), member('dani', 'דני', 'slate')];
  household.household = {
    id: 'h',
    name: 'הבית',
    memberIds: ['michal', 'dani'],
    memberCount: 2,
    maxMembers: 6,
    createdBy: 'michal',
    createdAt: 0,
    jar,
    invite: null
  } satisfies Household;
}

const each: TreatJar = {
  treat: 'ארוחה במסעדה',
  mode: 'each',
  share: 5,
  target: 10,
  count: 7,
  counts: { michal: 4, dani: 3 },
  round: 3,
  startedAt: 0
};

afterEach(() => {
  household.household = null;
  household.members = [];
});

describe('JarMini', () => {
  it('each: the total, and a short bar per member in their colour', () => {
    seat(each);
    render(JarMini, { props: { jar: each } });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-jar-mode', 'each');
    expect(link).toHaveTextContent('ארוחה במסעדה · 7 מתוך 10');
    const bars = screen.getByRole('img', { name: 'החלקים: מיכל 4 מתוך 5, דני 3 מתוך 5' });
    const parts = [...bars.querySelectorAll<HTMLElement>('[data-mini-part]')];
    expect(parts.map((p) => p.dataset.miniPart)).toEqual(['michal', 'dani']);
    expect(parts[0]!.style.getPropertyValue('--c')).toBe('var(--member-terracotta-base)');
    expect(parts[1]!.querySelector<HTMLElement>('.fill')!.style.transform).toBe('scaleX(0.6)');
  });

  it('together: one progress bar', () => {
    const jar: TreatJar = { ...each, mode: 'together', counts: {} };
    seat(jar);
    render(JarMini, { props: { jar } });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-mini-part]')).toHaveLength(0);
  });

  it('a completion drops a marble into the little jar', async () => {
    seat(each);
    const view = render(JarMini, { props: { jar: each } });
    expect(document.querySelectorAll('.plop')).toHaveLength(0);
    const after = { ...each, count: 8, counts: { michal: 5, dani: 3 } };
    seat(after);
    await view.rerender({ jar: after });
    expect(document.querySelectorAll('.plop')).toHaveLength(1);
    expect(document.querySelector('[data-mini-part="michal"]')).toHaveClass('complete', 'glint');
  });

  it('full: a small celebration; no jar: nothing', () => {
    const full = { ...each, count: 10, counts: { michal: 5, dani: 6 } };
    seat(full);
    const view = render(JarMini, { props: { jar: full } });
    expect(screen.getByRole('link')).toHaveAttribute('data-jar-mini', 'full');
    expect(screen.getByText('לחגוג')).toBeInTheDocument();
    view.unmount();
    seat(null);
    render(JarMini, { props: { jar: null } });
    expect(screen.queryByRole('link')).toBeNull();
  });
});
