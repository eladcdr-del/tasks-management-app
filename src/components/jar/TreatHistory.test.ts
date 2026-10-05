// @vitest-environment jsdom
import '../../test/jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { EarnedTreat, Member } from '$lib/domain/types';
import TreatHistory from './TreatHistory.svelte';

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
const MEMBERS = [member('michal', 'מיכל', 'terracotta'), member('dani', 'דני', 'slate')];
const AUG_8 = Date.parse('2026-08-08T21:00:00+03:00');
const JUN_7 = Date.parse('2026-06-07T20:30:00+03:00');
const TREATS: EarnedTreat[] = [
  {
    id: '2',
    treat: 'סרט בקולנוע',
    target: 10,
    filledAt: AUG_8,
    redeemedAt: AUG_8,
    counts: { michal: 6, dani: 5 }
  },
  { id: '1', treat: 'גלידה בנמל', target: 10, filledAt: JUN_7, redeemedAt: JUN_7 }
];

// jsdom has no <dialog>.showModal and no popover: the Dialog falls back to the open attribute.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};

afterEach(() => cleanup());

function setup(treats = TREATS) {
  const onDelete = vi.fn();
  const view = render(TreatHistory, {
    props: { treats, members: MEMBERS, today: '2026-10-04', onDelete }
  });
  return { onDelete, view };
}

describe('TreatHistory', () => {
  it('lists the earned treats newest first, with who took part and the jar number', () => {
    setup();
    const rows = document.querySelectorAll('[data-treat]');
    expect([...rows].map((r) => r.getAttribute('data-treat'))).toEqual(['2', '1']);
    expect(rows[0]).toHaveTextContent('סרט בקולנוע');
    expect(rows[0]).toHaveTextContent('צנצנת 2');
    expect(screen.getByRole('img', { name: 'השתתפו: מיכל, דני' })).toBeInTheDocument();
    // A treat from before goal modes does not know who took part.
    expect(rows[1]!.querySelector('[role="img"]')).toBeNull();
    expect(screen.getByRole('heading', { name: /צ׳ופרים שהרווחנו/ })).toBeInTheDocument();
  });

  it('every row has a quiet "⋮" that opens a menu with "מחיקה מההיסטוריה"', () => {
    setup();
    const more = screen.getByRole('button', { name: 'אפשרויות ל״גלידה בנמל״' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    const menuId = more.getAttribute('aria-controls')!;
    expect(more).toHaveAttribute('popovertarget', menuId);
    const menu = document.getElementById(menuId)!;
    expect(menu).toHaveAttribute('role', 'menu');
    expect(menu).toHaveAttribute('popover', 'auto');
    expect(menu.querySelector('[role="menuitem"]')).toHaveTextContent('מחיקה מההיסטוריה');
  });

  it('asks before deleting, naming the treat; confirming deletes that treat only', async () => {
    const { onDelete } = setup();
    // No popover support here: the "⋮" runs its only action.
    await fireEvent.click(screen.getByRole('button', { name: 'אפשרויות ל״גלידה בנמל״' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('למחוק את ״גלידה בנמל״ מההיסטוריה?');
    expect(dialog).toHaveTextContent('הצנצנת הנוכחית לא משתנה.');
    await fireEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('1');
  });

  it('"ביטול" deletes nothing', async () => {
    const { onDelete } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'אפשרויות ל״סרט בקולנוע״' }));
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('the menu item runs the action from the menu too', async () => {
    const { onDelete } = setup();
    const item = document.querySelector<HTMLButtonElement>(
      '[data-treat="2"] [data-menu-item="delete"]'
    )!;
    await fireEvent.click(item);
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('2');
  });

  it('shows nothing without earned treats', () => {
    setup([]);
    expect(document.querySelector('[data-treat]')).toBeNull();
    expect(screen.queryByRole('heading', { name: /צ׳ופרים שהרווחנו/ })).toBeNull();
  });
});
