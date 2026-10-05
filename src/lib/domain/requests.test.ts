import { describe, expect, it } from 'vitest';
import { isPendingRequestFor, pendingRequestOf, requestView, type RequestFields } from './requests';

// מיכל (m) asked דני (d); נועה (n) is a third member.
const MEMBERS = ['m', 'd', 'n'];
const pending: RequestFields = {
  ownerId: null,
  requestedOf: 'd',
  requestedBy: 'm',
  status: 'open'
};

describe('pendingRequestOf', () => {
  it('names the asked member while nobody holds the task', () => {
    expect(pendingRequestOf(pending)).toBe('d');
    expect(pendingRequestOf(pending, MEMBERS)).toBe('d');
  });

  it('is null once someone holds it: accepted, taken by someone else, or a legacy write', () => {
    // Accepted: requestedOf cleared, requestedBy kept.
    expect(pendingRequestOf({ ...pending, ownerId: 'd', requestedOf: null })).toBeNull();
    // The previous app version took it without touching requestedOf: the owner wins.
    expect(pendingRequestOf({ ...pending, ownerId: 'n', requestedBy: null })).toBeNull();
    // The previous app version re-requested it (ownerId = the new target), requestedOf stale.
    expect(pendingRequestOf({ ...pending, ownerId: 'n', requestedBy: 'm' })).toBeNull();
  });

  it('is null when the request was cleared, or never was (missing field = null)', () => {
    // The previous app version released it: requestedBy cleared, requestedOf stale.
    expect(pendingRequestOf({ ...pending, requestedBy: null })).toBeNull();
    expect(pendingRequestOf({ ownerId: null, requestedBy: null })).toBeNull();
    expect(pendingRequestOf({ ownerId: null, requestedBy: 'm' })).toBeNull();
    expect(pendingRequestOf({ ...pending, requestedOf: undefined })).toBeNull();
  });

  it('is null for a done task, a request to oneself, or a request to a former member', () => {
    expect(pendingRequestOf({ ...pending, status: 'done' })).toBeNull();
    expect(pendingRequestOf({ ...pending, requestedBy: 'd' })).toBeNull();
    expect(pendingRequestOf(pending, ['m', 'n'])).toBeNull();
    // Membership not known yet: trusted.
    expect(pendingRequestOf(pending, undefined)).toBe('d');
  });
});

describe('isPendingRequestFor', () => {
  it('only for the asked member, and never for an unknown viewer', () => {
    expect(isPendingRequestFor(pending, 'd')).toBe(true);
    expect(isPendingRequestFor(pending, 'm')).toBe(false);
    expect(isPendingRequestFor(pending, 'n')).toBe(false);
    expect(isPendingRequestFor(pending, null)).toBe(false);
    expect(isPendingRequestFor(pending, 'd', ['m'])).toBe(false);
  });
});

describe('requestView', () => {
  it('a waiting request reads from where the viewer stands', () => {
    expect(requestView(pending, 'd', MEMBERS)).toEqual({ kind: 'askedMe', by: 'm' });
    expect(requestView(pending, 'm', MEMBERS)).toEqual({ kind: 'iAsked', to: 'd' });
    expect(requestView(pending, 'n', MEMBERS)).toEqual({ kind: 'between', by: 'm', to: 'd' });
    expect(requestView(pending, null, MEMBERS)).toEqual({ kind: 'between', by: 'm', to: 'd' });
  });

  it('an accepted request (or one by the previous app version) is owned', () => {
    const accepted: RequestFields = { ownerId: 'd', requestedOf: null, requestedBy: 'm' };
    for (const me of ['d', 'm', 'n']) {
      expect(requestView(accepted, me, MEMBERS)).toEqual({ kind: 'accepted', by: 'm', owner: 'd' });
    }
    expect(requestView({ ownerId: 'd', requestedBy: 'm' }, 'd')).toEqual({
      kind: 'accepted',
      by: 'm',
      owner: 'd'
    });
  });

  it('nothing to say otherwise', () => {
    expect(requestView({ ownerId: null, requestedBy: null }, 'd')).toEqual({ kind: 'none' });
    expect(requestView({ ownerId: 'd', requestedBy: null }, 'd')).toEqual({ kind: 'none' });
    // Asked by the owner themself (self-request is a take): nothing.
    expect(requestView({ ownerId: 'm', requestedBy: 'm' }, 'm')).toEqual({ kind: 'none' });
    // The owner left: the task waits for anyone.
    expect(requestView({ ownerId: 'gone', requestedBy: 'm' }, 'm', MEMBERS)).toEqual({
      kind: 'none'
    });
    // A request to a former member: waits for anyone.
    expect(requestView({ ...pending, requestedOf: 'gone' }, 'm', MEMBERS)).toEqual({
      kind: 'none'
    });
  });
});
