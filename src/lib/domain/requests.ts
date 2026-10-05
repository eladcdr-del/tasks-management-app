// Requests: asking a member to take a task is a PROPOSAL until they answer. Pure helpers over a
// Task's stored fields; every screen, the buckets and the adapters read requests through these.
//
// Stored fields
//   requestedOf   the asked member while the request waits for an answer; null (or missing, on
//                 documents written before requests could wait) otherwise
//   requestedBy   who asked; kept after the request is accepted, as history
//   requestedAt   when they asked
//   ownerId       null while the request waits: until the asked member accepts, nobody holds it
//
// States
//   pending    open, nobody owns it, requestedOf names a current member, and someone else asked
//   accepted   a current member owns it and someone else asked: an accepted request, or any request
//              written by the previous app version (it set ownerId = the asked member at once and
//              never touches requestedOf)
//   none       anything else. A stale requestedOf (the previous version took, released or
//              re-requested the task without clearing it) is ignored: an owner, or a cleared
//              requestedBy, always wins.
//
// Transitions (the repository's writes)
//   request(to)   ownerId null, requestedOf to, requestedBy me, requestedAt now   → pending
//   accept        ownerId me, requestedOf null (requestedBy/At kept)               → accepted
//   decline       requestedOf, requestedBy, requestedAt null                       → none (waiting)
//   cancel        the same three null, by the requester                            → none (waiting)
//   take          ownerId me, requestedOf null (by the asked member: an accept)

import type { Task } from './types';

/** The household's current member uids; `undefined` while not known yet (every uid is trusted). */
type Members = readonly string[] | undefined;

/** The fields a request state is read from (`status` and `requestedOf` may be missing). */
export type RequestFields = Pick<Task, 'ownerId' | 'requestedBy'> &
  Partial<Pick<Task, 'requestedOf' | 'status'>>;

const isMember = (uid: string, memberIds: Members): boolean =>
  memberIds === undefined || memberIds.includes(uid);

/** The member a request on `task` is waiting for, or null when nothing waits for an answer. */
export function pendingRequestOf(
  task: RequestFields,
  memberIds: Members = undefined
): string | null {
  const to = task.requestedOf ?? null;
  if (to === null || task.ownerId !== null) return null;
  if (task.status !== undefined && task.status !== 'open') return null;
  if (task.requestedBy === null || task.requestedBy === to) return null;
  return isMember(to, memberIds) ? to : null;
}

/** A request on `task` waits for `me` to answer. Never true while the viewer is unknown. */
export function isPendingRequestFor(
  task: RequestFields,
  me: string | null,
  memberIds: Members = undefined
): boolean {
  return me !== null && pendingRequestOf(task, memberIds) === me;
}

/** How a task's request reads for the viewer `me` (who asked whom, and whether it waits). */
export type RequestView =
  | { kind: 'none' }
  /** Waiting for MY answer; `by` asked. */
  | { kind: 'askedMe'; by: string }
  /** I asked `to`; waiting for their answer. */
  | { kind: 'iAsked'; to: string }
  /** `by` asked `to` (neither is me); waiting for `to`'s answer. */
  | { kind: 'between'; by: string; to: string }
  /** `owner` holds it because `by` asked (accepted, or a request by the previous app version). */
  | { kind: 'accepted'; by: string; owner: string };

export function requestView(
  task: RequestFields,
  me: string | null,
  memberIds: Members = undefined
): RequestView {
  const by = task.requestedBy;
  if (by === null) return { kind: 'none' };
  const to = pendingRequestOf(task, memberIds);
  if (to !== null) {
    if (me !== null && to === me) return { kind: 'askedMe', by };
    if (me !== null && by === me) return { kind: 'iAsked', to };
    return { kind: 'between', by, to };
  }
  const owner = task.ownerId;
  if (owner !== null && owner !== by && isMember(owner, memberIds)) {
    return { kind: 'accepted', by, owner };
  }
  return { kind: 'none' };
}
