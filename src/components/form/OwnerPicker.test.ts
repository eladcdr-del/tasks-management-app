// @vitest-environment jsdom
import '../../test/jsdom';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Member } from '$lib/domain/types';
import OwnerPicker from './OwnerPicker.svelte';

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

describe('OwnerPicker', () => {
  it('"אני" carries my own initial and colour, and picks my uid', () => {
    const onChange = vi.fn();
    render(OwnerPicker, {
      props: {
        value: null,
        members: [member('michal', 'מיכל', 'terracotta'), member('dani', 'דני', 'sage')],
        meUid: 'michal',
        onChange
      }
    });
    const mine = screen.getByRole('button', { name: 'אני' });
    expect(mine).toHaveAttribute('data-member-color', 'terracotta');
    expect(mine.querySelector('.glyph')).toHaveTextContent('מ');
    expect(screen.getByRole('button', { name: 'דני' }).querySelector('.glyph')).toHaveTextContent(
      'ד'
    );
    fireEvent.click(mine);
    expect(onChange).toHaveBeenCalledWith('michal');
  });
});
