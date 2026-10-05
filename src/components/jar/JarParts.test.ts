// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { JarPart } from '$lib/domain/jar';
import type { Member } from '$lib/domain/types';
import JarParts from './JarParts.svelte';

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
const MEMBERS = new Map([
  ['michal', member('michal', 'מיכל', 'terracotta')],
  ['dani', member('dani', 'דני', 'slate')]
]);
const memberById = (uid: string) => MEMBERS.get(uid) ?? null;
const part = (uid: string, done: number, share = 5, extra = 0): JarPart => ({
  uid,
  done,
  share,
  complete: done >= share,
  extra
});

describe('JarParts', () => {
  it('one row per member: their own part only, in the given order', () => {
    render(JarParts, { props: { parts: [part('michal', 4), part('dani', 5, 5, 3)], memberById } });
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-part'))).toEqual(['michal', 'dani']);
    expect(rows[0]).toHaveTextContent('מיכל: 4 מתוך 5');
    expect(rows[0]!.querySelectorAll('.seg')).toHaveLength(5);
    expect(rows[0]!.querySelectorAll('.seg.on')).toHaveLength(4);
    // A completed part says so; its extra work is never shown as a per-person number.
    expect(rows[1]).toHaveAttribute('data-complete', 'true');
    expect(rows[1]).toHaveTextContent('החלק של דני הושלם');
    expect(rows[1]).not.toHaveTextContent('8');
    expect(screen.getByRole('list', { name: 'החלקים שלנו' })).toBeInTheDocument();
  });

  it('a big share is one continuous bar', () => {
    render(JarParts, { props: { parts: [part('michal', 6, 12)], memberById } });
    const row = screen.getByRole('listitem');
    expect(row.querySelectorAll('.seg')).toHaveLength(1);
    expect(row.querySelector<HTMLElement>('.fill')!.style.transform).toBe('scaleX(0.5)');
  });

  it('a part that completes while on screen bursts', async () => {
    const view = render(JarParts, { props: { parts: [part('michal', 4)], memberById } });
    expect(document.querySelectorAll('.spark')).toHaveLength(0);
    await view.rerender({ parts: [part('michal', 5)], memberById });
    expect(screen.getByRole('listitem')).toHaveClass('burst');
    expect(document.querySelectorAll('.spark').length).toBeGreaterThan(0);
  });

  it('a part that was already complete does not burst again', async () => {
    const view = render(JarParts, { props: { parts: [part('michal', 5)], memberById } });
    await view.rerender({ parts: [part('michal', 5, 5, 1)], memberById });
    expect(document.querySelectorAll('.spark')).toHaveLength(0);
  });
});
