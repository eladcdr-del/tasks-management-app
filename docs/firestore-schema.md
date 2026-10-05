# Firestore schema (HomeCare)

The stored shape of every document, and the writes that must be batched. `firestore.rules` enforces
all of it; `tests/rules/*.test.ts` proves it (`flock /tmp/homecare-emu.lock npm run test:rules`).
The Firebase adapter (step 2.2) must write exactly these shapes. Anything else is `permission-denied`.

## 1. Conventions (apply to every collection)

- **Exact key sets.** Every listed field is present on every write of a full document (use `null`,
  never omit) and no other field exists. The optional keys are inside `tasks.recurrence` (`anchor`,
  `interval` and `weekdays`: omit them when absent; they are never `null` or `undefined`),
  `tasks.requestedOf` (a uid or `null`; missing on every document written before requests could
  wait for an answer, and read as `null`), the jar's goal keys `mode`, `share`, `counts` (in
  `households.jar` and `treats`; missing on jars set up before goal modes, see "Jar goal modes"),
  and `households.nextJarRound` (missing until a jar is deleted, see "Deleting the jar").
- **Ids are not stored.** `Task.id`, `ActivityEvent.id`, `Photo.id`, `EarnedTreat.id` are the doc id;
  `Member.uid` is the members doc id; `Invite.code` is the invites doc id; `DeviceToken.deviceId` is
  the devices doc id. Converters strip them on write and inject them from `snap.id` on read.
- **`pending` is never stored.** Derive it from `snap.metadata.hasPendingWrites`.
- **Timestamps.** Every `Millis` field is stored as a Firestore `Timestamp`. A field that means
  "now" is written with `serverTimestamp()`; rules compare it with `request.time`, so a client-clock
  value is rejected. On update, a timestamp may stay unchanged, become `null` (if nullable) or be
  set to `serverTimestamp()`. The only client-computed times are `invites.expiresAt`,
  `households.invite.expiresAt` (future, ≤ 7 days) and `treats.filledAt` (past, within the round).
  Offline-queued writes are fine: the server resolves `serverTimestamp()` at commit.
- **Attribution.** `createdBy`, `updatedBy`, `actorId`, `completedBy`, `requestedBy` can only be
  set to the caller's uid.
- **Lengths** are rules `string.size()` (characters). JS `.length` is never smaller, so checking
  `.length` client-side is safe.
- **Enums:** color `terracotta|sage|slate|plum|ochre|teal`; addressAs `f|m|n`; priority
  `normal|high|urgent`; categoryId `car|shopping|home|health|finance|returns|family|other`; status
  `open|done`; freq `daily|weekly|monthly|yearly` (`daily` since the recurrence feature); event
  types are listed under `events` below.

## 2. Documents

Access: **M** = members of the household (a `members/{uid}` doc exists). **Self** = `auth.uid` equals
the path uid. Nothing is readable or writable by anyone else. No collection-group access exists.

### `households/{hid}`: get M · list never · create (founder batch) · update (see below) · delete never

`hid` is an auto id.

| field         | type                        | constraints                                                        |
| ------------- | --------------------------- | ------------------------------------------------------------------ |
| name          | string                      | 1..60                                                              |
| memberIds     | string[]                    | create `[me]`; changed only by join / leave / removal batches (§3) |
| memberCount   | int                         | always `== memberIds.length`                                       |
| maxMembers    | int                         | `6`, immutable                                                     |
| createdBy     | string                      | create `me`, immutable                                             |
| createdAt     | Timestamp                   | create now, immutable                                              |
| jar           | TreatJar \| null            | create `null` or a fresh jar; back to `null` only by the delete    |
| invite        | `{code, expiresAt}` \| null | create `null`; `code` 24 base62; `expiresAt` > now, ≤ now + 7 d    |
| nextJarRound? | int ≥ 2                     | never on create; written only by the jar delete (its round + 1)    |

`TreatJar = {treat: string 1..60, target: int 3..50, count: int ≥ 0, round: int ≥ 1, startedAt: Timestamp,
mode?: 'together' | 'each', share?: int 1..20, counts?: {[uid]: int ≥ 0}}` (`share` is required when
`mode == 'each'`). A fresh jar is `{treat, target, mode, share?, count: 0, counts: {}, round: 1,
startedAt: now}`; a fresh jar without the goal keys (the previous app version) is still valid.

#### Jar goal modes

`src/lib/domain/jar.ts` is the reference; the rules (`jarFull`, `jarTransitionOk`) mirror it.

- **`together`** (also: no `mode`, every jar set up before goal modes): `target` completions in
  total, by anyone. Full when `count ≥ target`; the surplus carries into the next round.
- **`each`** ("כל אחד תורם", the default for new jars in the app): every **current** member (the
  household's `memberIds`) closes their `share`. Full when `counts[uid] ≥ share` for every
  current member; a newcomer's part counts from the moment they join, a departed member's no
  longer does. `count` is kept as `Σ min(counts[uid], share)` and `target` as
  `clamp(share × memberCount, 3, 50)`, only so that the previous app version (which shows "count
  of target") reads something sensible. Completions past one's share are recorded in `counts`
  (shown as a shared bonus) and never carry over.
- `counts` (completions per member this round) is kept in both modes; the redeem batch copies it
  into `treats/{round}` (who took part) and clears it.

Member update may change only `name`, `jar`, `invite` (and `nextJarRound`, by the delete only).
**Jar transitions (one per write):**

| transition | write (this version)                                                                                                                                       | rule                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| setup      | `{jar: fresh jar}`                                                                                                                                         | only from `null`; `round == nextJarRound` (missing = 1); `counts` empty                                                                                                                                        |
| edit       | `{'jar.treat', 'jar.target', 'jar.mode', 'jar.share'?}` (+ `'jar.counts'` backfill)                                                                        | count, round, startedAt unchanged; `counts` unchanged, or a **backfill** (switching to each mid-round): only current members' entries change, none goes down, and their sum is `≤ count`                       |
| complete   | `{'jar.counts.<me>': increment(1)}` + `{'jar.count': increment(1)}` when it fills (together: always; each: while `counts[me] < share`)                     | my entry exactly +1, nothing else; `count` +1 or unchanged. **Previous version:** `{'jar.count': increment(1)}` alone                                                                                          |
| reopen     | `{'jar.counts.<completer>': increment(-1)}` (a current member with an entry) + `{'jar.count': increment(-1)}` when that completion counted (and count > 0) | one current member's entry exactly −1 (never below 0); `count` −1 or unchanged. **Previous version:** `{'jar.count': increment(-1)}` alone. Only a completion of the current round (`completedAt ≥ startedAt`) |
| redeem     | `{'jar.count': together ? increment(-target) : 0, 'jar.counts': {}, 'jar.round': increment(1), 'jar.startedAt': serverTimestamp()}`                        | only when full (by mode); settings unchanged; `treats/{round}` created in the same batch. **Previous version** (`count −target`, `counts` untouched): accepted for a together jar only                         |
| delete     | `{jar: null, nextJarRound: jar.round + 1}`                                                                                                                 | exactly these two keys; from a jar (not `null`); `nextJarRound` is the deleted jar's round + 1. Earned treats stay                                                                                             |

Writes of the previous app version stay valid; they only move `count`, so in `each` mode `count`
may drift a little from `Σ min(counts, share)` during the transition. Nothing relies on it: an
`each` jar's fullness reads `counts` only. The jar bookkeeping never blocks a completion or a
reopen: `count` may move or stay with a tally step (an offline view may misjudge a share).

#### Deleting the jar

Any member may delete the jar (`deleteJar`, `domain/jar.ts` `jarDeletion`): it becomes `null`
and the household remembers the round a new jar starts at, `nextJarRound` = the deleted round + 1.
A new jar must start at exactly `nextJarRound` (`freshJarRound`), so round numbers only go up and
none is ever used twice: a redeem can never collide with (or overwrite) an earned treat, and a
round names one jar for good (what a device remembers per round, such as "this round was already
celebrated" or "these marbles were already seen", stays right on every app version). Without a
delete, nothing changes: `nextJarRound` is missing and a new jar starts at 1, as before. The
history may show a gap in the jar numbers ("צנצנת 4" after "צנצנת 2"), as it does after deleting a
treat.

- **The previous app version** never deletes. It already reads a `null` jar as "no jar yet" and
  shows the setup invitation. Its setup always writes round 1, which is refused once a jar was
  deleted, so it can never start a round that collides with the history (the app reports the
  write as not saved; once updated it sets the jar up in the right round). Its other writes are
  unchanged.
- **A completion queued offline before the delete** carries a jar step (field increments). On a
  `null` jar that would build a jar without treat or target, so the rules refuse the whole
  completion batch (the app reports it; complete the task again). A completion made after the app
  has seen the delete has no jar step and lands normally. Clients read a stored map without a
  `treat` as no jar.
- **A reopen** after a delete has no jar to step back (a new jar started after the completion),
  so it writes no jar step.
- The app delays the delete for its 5-second undo window (like deleting a task); a new jar set up
  meanwhile commits the delete first.

`household.invite` is the **only** code that admits joiners. Replacing it or setting it to `null`
invalidates every other code at once.

### `households/{hid}/members/{uid}`: read M · create Self (founder or joiner batch) · update Self · delete Self or owner

| field       | type                                         | constraints                                                            |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| displayName | string                                       | 1..40                                                                  |
| photoURL    | string \| null                               | Google account photo: `https://<host>.googleusercontent.com/…`, ≤ 2048 |
| color       | MemberColor                                  | enum                                                                   |
| addressAs   | AddressAs                                    | enum                                                                   |
| role        | `'owner'` \| `'member'`                      | founder `'owner'`, joiner `'member'`; immutable                        |
| joinedAt    | Timestamp                                    | create now; immutable                                                  |
| notify      | `{requests, reminders, partnerDone, weekly}` | exactly these 4 keys, all bool                                         |
| inviteCode  | string \| null                               | founder `null`; joiner the code used; immutable                        |

Self-update may change only `displayName`, `photoURL`, `color`, `addressAs`, `notify`. Delete only
in a leave/removal batch (§3). The owner is the member with `role == 'owner'`. If the owner leaves,
nobody can remove others.

### `households/{hid}/tasks/{taskId}`: read M · create/update/delete M

| field         | type                      | create                          | update                                 |
| ------------- | ------------------------- | ------------------------------- | -------------------------------------- |
| title         | string 1..200             |                                 |                                        |
| notes         | string 0..4000            |                                 |                                        |
| categoryId    | CategoryId \| null        |                                 |                                        |
| priority      | Priority                  |                                 |                                        |
| ownerId       | string \| null            | null or a current member        | unchanged, null, or a current member   |
| requestedBy   | string \| null            | null or me                      | unchanged, null, or me                 |
| requestedAt   | Timestamp \| null         | null or now                     | unchanged, null, or now                |
| requestedOf?  | string \| null (optional) | absent, null, or a request      | see "Requests" below                   |
| createdBy     | string                    | me                              | immutable                              |
| createdAt     | Timestamp                 | now                             | immutable                              |
| updatedBy     | string                    | me                              | me (every update)                      |
| updatedAt     | Timestamp                 | now                             | now (every update)                     |
| scheduledFor  | `'YYYY-MM-DD'` \| null    |                                 |                                        |
| weekPlan      | bool                      |                                 | `true` requires `scheduledFor != null` |
| dueDate       | `'YYYY-MM-DD'` \| null    |                                 |                                        |
| dueTime       | `'HH:mm'` \| null         | 00:00..23:59                    |                                        |
| hardDeadline  | bool                      |                                 |                                        |
| recurrence    | Recurrence, below \| null | rules: see **Recurrence** below |                                        |
| seriesId      | string 1..60 \| null      |                                 |                                        |
| status        | `'open'` \| `'done'`      | `'open'`                        |                                        |
| snoozeCount   | int ≥ 0                   |                                 | use `increment(1)`                     |
| lastSnoozedAt | Timestamp \| null         | null                            | unchanged, null, or now                |
| completedAt   | Timestamp \| null         | null                            | unchanged, null, or now                |
| completedBy   | string \| null            | null                            | unchanged, null, or me                 |
| completion    | Completion \| null        | null                            |                                        |

Invariants: `(requestedBy == null) == (requestedAt == null)`; `open` ⇒ `completedAt`,
`completedBy`, `completion` all null; `done` ⇒ `completedAt` and `completedBy` non-null;
`weekPlan` ⇒ `scheduledFor != null`.

**Requests** (`src/lib/domain/requests.ts`). Asking a member to take a task is a proposal until
they answer: `requestedOf` names the asked member while the request **waits**, and nobody holds the
task meanwhile (`ownerId == null`), so for everyone else it is "waiting for someone to take".

| state    | stored                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| waiting  | `ownerId: null, requestedOf: to, requestedBy: asker, requestedAt` (to ≠ asker)           |
| accepted | `ownerId: to, requestedOf: null`, `requestedBy`/`requestedAt` kept as history            |
| legacy   | `ownerId: to, requestedBy: asker`, no `requestedOf` (the previous app version): accepted |

A `requestedOf` with an owner, or with `requestedBy == null` (the previous version took, released or
re-asked without touching it), or naming a former member, is stale and means nothing.

Rules (`requestCreateOk` / `requestUpdateOk`): `requestedOf` only ever becomes `null` or a **new
request**: another current member, `ownerId: null`, `requestedBy: me`, `requestedAt: now` (also on
create). While a request waits, the asked member may write anything (accept, decline, leave);
anyone else may only leave it untouched (edit, snooze, complete, reopen), take the task (`ownerId:
me`, `requestedBy: null`; the previous version leaves `requestedOf` as it was), ask again (a new
request, or the previous version's `ownerId: to, requestedBy: me` with `requestedOf` unchanged), or
withdraw it if they asked (`requestedOf`, `requestedBy`, `requestedAt` all `null`, still unowned).
A request to a former member binds nobody. Writes that leave `requestedOf` unchanged (every write
of the previous version) are otherwise checked exactly as before.

**`weekPlan`** (always present, bool): `true` means `scheduledFor` is the Saturday that ends a
planned week ("השבוע" / "בשבוע הבא"), so the UI shows a week, not a day. `false` means
`scheduledFor` (if any) is a plain day. Rules only check that it is a bool and that `true` comes
with a date. Anything that changes `scheduledFor` to a day sets `weekPlan: false` in the same write
(**snooze always does**, via `snoozePatch`), and clearing `scheduledFor` (`null`) requires
`weekPlan: false` too, otherwise the write is denied.
`Completion = {note: 0..2000, cost: null | number 0..10,000,000, place: 0..120, contact: 0..120,
photoIds: string[] ≤ 3 (each 1..128)}`. Date regex: `YYYY-(01..12)-(01..31)`.

**Recurrence** = `{freq, interval?, weekdays?, anchor?}` (semantics in `src/lib/domain/recurrence.ts`):

| key      | type           | constraints                                                                                             |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| freq     | string         | `daily` \| `weekly` \| `monthly` \| `yearly` (required)                                                 |
| interval | int            | 1..99, optional: every N periods; missing = 1                                                           |
| weekdays | int[]          | `weekly` only, optional: 1..7 strictly ascending days 0..6 (0 = Sunday); missing = the anchor's weekday |
| anchor   | `'YYYY-MM-DD'` | optional: the series base date (set on create or at the first completion; a snooze never moves it)      |

Clients write it canonically (`recurrenceDoc`): `interval` only when it is not 1, `weekdays` only on
a weekly rule that lists days, so a plain rule is still exactly `{freq}` / `{freq, anchor}`, the shape
the pre-feature client writes and the rules keep accepting. Reads are defensive: a malformed
`interval` / `weekdays` reads as missing. With `weekdays`, the series runs on the listed days of every
`interval`-th week counted from the anchor's (Sunday-based) week. The next instance is the first
series date strictly after max(own date, completion date) and after the anchor.

Compatibility with a client still on the pre-feature version (until it updates): it reads only
`freq` and `anchor`, so it shows no label for `daily` and treats `interval` / `weekdays` series as
plain weekly/monthly/yearly; completing such a task there writes the next instance as
`{freq, anchor}` (accepted by the rules) and the series continues without its interval/days.
Editing or completing a `daily` task on that version fails on the device (its validation and its
next-date code do not know `daily`), with nothing written; taking, requesting, snoozing and
reading still work. That version applies the update itself the next time the app goes to the
background, so the window is short. Documents written before the feature need no migration.

### `households/{hid}/events/{eventId}`: read M · create M · update/delete never

| field     | type                    | constraints                                                                                                                                                    |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| type      | EventType               | `created` `taken` `requested` `released` `completed` `reopened` `snoozed` `edited` `deleted` `jar_filled` `jar_redeemed` `member_joined` `accepted` `declined` |
| actorId   | string                  | me                                                                                                                                                             |
| taskId    | string \| null          | 1..128                                                                                                                                                         |
| taskTitle | string \| null          | 1..200                                                                                                                                                         |
| targetId  | string \| null          | 1..128: the asked member for `requested` and for a withdrawn request (`released`); the asker for `accepted` / `declined`                                       |
| createdAt | Timestamp               | now                                                                                                                                                            |
| push      | `'pending'` \| `'none'` | `'pending'` iff type ∈ {requested, accepted, declined, completed, jar_filled}, else `'none'`                                                                   |

`sent`/`skipped` are set by the notifier (Admin SDK) only. The check is `existsAfter`, so a joiner's
`member_joined` event may be part of the join batch.

`accepted` and `declined` (the asked member's answer, `answerEventOk`) need a `taskId` that is a
document id and a `targetId` that is another current member, and must ride with the answer:
`accepted` only when I hold the task after the batch (like a take, offline last write wins);
`declined` only when the request waited for me before the batch and no longer does after it.

### `households/{hid}/photos/{photoId}`: read M · create M · delete M · update never

| field         | type      | constraints                                            |
| ------------- | --------- | ------------------------------------------------------ |
| taskId        | string    | 1..128                                                 |
| dataUrl       | string    | starts with `data:image/jpeg;base64,`, ≤ 300,000 chars |
| thumbDataUrl  | string    | same prefix, ≤ 20,000 chars                            |
| width, height | int       | 1..4096                                                |
| createdBy     | string    | me                                                     |
| createdAt     | Timestamp | now                                                    |

### `households/{hid}/treats/{round}`: read M · create M (redeem batch only) · update M · delete M

`round` is the doc id `String(jar.round)` of the round being redeemed.

| field      | type              | constraints                                                    |
| ---------- | ----------------- | -------------------------------------------------------------- |
| treat      | string            | `== jar.treat`                                                 |
| target     | int               | `== jar.target`                                                |
| filledAt   | Timestamp         | `jar.startedAt ≤ filledAt ≤ now` (`serverTimestamp()` is fine) |
| redeemedAt | Timestamp \| null | create null or now; update only `null → now`, once             |
| mode?      | string            | `== jar.mode` (missing = together)                             |
| share?     | int               | `== jar.share`                                                 |
| counts?    | map               | `== jar.counts`: who took part (missing on older treats)       |

Create also requires: the jar is full (by its mode, for the household's current members), and
the same batch advances `jar.round` to `round + 1`. The optional keys may be left out (the
previous app version writes the four required keys only).

Delete (`deleteTreat`): any member removes an earned treat from the history; nothing else changes.
Its round is behind the jar's for good, so it can never be created again.

### `households/{hid}/sent/{key}`: no client access

Notifier dedupe log `{at, expireAt}`, written by the Admin SDK only.

### `invites/{code}`: get by any signed-in user (code length 24) · list never · create M · update M · delete never

`code` is `inviteCode()` from `src/lib/domain/ids.ts` (24 base62 chars).

| field         | type      | constraints                                                                                |
| ------------- | --------- | ------------------------------------------------------------------------------------------ |
| householdId   | string    | the caller must be a member of it                                                          |
| householdName | string    | 1..60                                                                                      |
| inviterName   | string    | 1..40                                                                                      |
| memberCount   | int       | 1..6, a snapshot for `InvitePreview` (not in the `Invite` TS type; the converter drops it) |
| createdBy     | string    | me                                                                                         |
| createdAt     | Timestamp | now                                                                                        |
| expiresAt     | Timestamp | > now, ≤ now + 7 d (write `Date.now() + 7 d − 10 min` for client-clock skew)               |
| revoked       | bool      | create `false`; update may only set `true`                                                 |

### `users/{uid}`: Self only (no list)

`{householdId: string | null, createdAt: Timestamp}`. `householdId`, when set, must name a household
the caller is a member of after this write. `createdAt`: create now; update unchanged or now. So
`set(userDoc)` with `serverTimestamp()` is always acceptable.

### `users/{uid}/devices/{deviceId}`: Self only

`deviceId` is ≤ 64 chars (UUID). Fields: `{householdId: string (caller must be a member),
token: 1..4096, userAgent: 0..512, createdAt: create now / update unchanged or now,
updatedAt: now on every write}`. A full `set()` on refresh is fine.

## 3. Writes that must be atomic (one `writeBatch` or `runTransaction`)

"now" means `serverTimestamp()`. "+event" means `set(events/{autoId})` with the type shown.
Read counts are the uncached worst case (limits: 10 per document, 20 per batch). The emulator
enforces both limits, and every batch below is tested.

| operation                                            | writes (all in one batch)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | reads |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **createHousehold**                                  | `set households/{autoId}` (founder shape) · `set members/{me}` (role `owner`, inviteCode `null`) · `set users/{me}` `{householdId, createdAt: now}`                                                                                                                                                                                                                                                                                                                                                                                                                                    | 4     |
| **joinHousehold**                                    | `update households/{hid}` `{memberIds: arrayUnion(me), memberCount: increment(1)}` (nothing else) · `set members/{me}` (role `member`, inviteCode = code) · `set users/{me}` · +event `member_joined`                                                                                                                                                                                                                                                                                                                                                                                  | 6     |
| **createInvite**                                     | `set invites/{newCode}` · `update invites/{oldCode}` `{revoked: true}` (if any) · `update households/{hid}` `{invite: {code, expiresAt}}`                                                                                                                                                                                                                                                                                                                                                                                                                                              | 3     |
| **revokeInvite**                                     | `update invites/{code}` `{revoked: true}` · `update households/{hid}` `{invite: null}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 2     |
| **leaveHousehold**                                   | `delete members/{me}` · `update households/{hid}` `{memberIds: arrayRemove(me), memberCount: increment(-1)}`, plus `invite: null` (**required** if you are the last member, optional otherwise) · `set users/{me}` `{householdId: null, createdAt: now}` · for every **open** task with `ownerId == me`: `update tasks/{id}` `{ownerId: null, requestedBy: null, requestedAt: null, …touch}`, and for every open request waiting for me the same with `requestedOf: null` (no events: the events rule needs the caller to still be a member after the batch). Then `unregisterDevice`. | 2     |
| owner removes `x` (no repo method yet)               | `delete members/{x}` · `update households/{hid}` `{memberIds: arrayRemove(x), memberCount: increment(-1), invite: null}` · `update invites/{code}` `{revoked: true}`                                                                                                                                                                                                                                                                                                                                                                                                                   | 5     |
| **completeTask** (transaction online, batch offline) | ≤ 3 × `set photos/{autoId}` · `update tasks/{id}` `{status: 'done', completedAt: now, completedBy: me, completion: {…, photoIds}, updatedBy, updatedAt}` (optionally `ownerId: me`) · +event `completed` · `update households/{hid}` with the jar's complete step (see Jar transitions) **only if jar ≠ null** · if recurring: `set tasks/{seriesId}__{nextDate}` · +event `jar_filled` if this completion makes the jar full (by its mode)                                                                                                                                            | 10    |
| **reopenTask**                                       | `update tasks/{id}` `{status: 'open', completedAt: null, completedBy: null, completion: null, updatedBy, updatedAt}` · the jar's reopen step (see Jar transitions) only if jar ≠ null, the task was completed in the current round and the step is not empty · +event `reopened` · `delete` the untouched next instance (and its photos if wanted)                                                                                                                                                                                                                                     | 5     |
| **redeemJar** (jar full)                             | `set treats/{String(round)}` `{treat, target, filledAt: now, redeemedAt: now, mode, share?, counts}` · `update households/{hid}` (redeem transition above) · +event `jar_redeemed`                                                                                                                                                                                                                                                                                                                                                                                                     | 6     |
| deleteJar (a single write, no event)                 | `update households/{hid}` `{jar: null, nextJarRound: jar.round + 1}` (delete transition above). No jar: nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1     |
| deleteTreat (a single write, no event)               | `delete treats/{round}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 1     |
| createTask                                           | `set tasks/{autoId}` (create shape) · +event `created`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 3     |
| takeTask (transaction online)                        | `update tasks/{id}` `{ownerId: me, requestedBy: null, requestedAt: null, requestedOf: null (if set), …touch}` · +event `taken`. By the asked member of a waiting request it is **acceptRequest**                                                                                                                                                                                                                                                                                                                                                                                       | 3     |
| requestTask                                          | `update tasks/{id}` `{ownerId: null, requestedOf: to, requestedBy: me, requestedAt: now, …touch}` · +event `requested` (`targetId: to`)                                                                                                                                                                                                                                                                                                                                                                                                                                                | 3     |
| acceptRequest (transaction online)                   | `update tasks/{id}` `{ownerId: me, requestedOf: null, …touch}` · +event `accepted` (`targetId`: the asker)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 4     |
| declineRequest                                       | `update tasks/{id}` `{requestedOf: null, requestedBy: null, requestedAt: null, …touch}` · +event `declined` (`targetId`: the asker)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 5     |
| cancelRequest                                        | `update tasks/{id}` `{requestedOf: null, requestedBy: null, requestedAt: null, …touch}` · +event `released` (`targetId`: the asked member)                                                                                                                                                                                                                                                                                                                                                                                                                                             | 3     |
| releaseTask                                          | `update tasks/{id}` `{ownerId: null, requestedBy: null, requestedAt: null, requestedOf: null (if set), …touch}` · +event `released`. On a request that still waits it is **cancelRequest**                                                                                                                                                                                                                                                                                                                                                                                             | 2     |
| snoozeTask                                           | `update tasks/{id}` `{…snoozePatch (scheduledFor, weekPlan: false, dueDate?, hardDeadline?), snoozeCount: increment(1), lastSnoozedAt: now, …touch}` · +event `snoozed`                                                                                                                                                                                                                                                                                                                                                                                                                | 2     |
| updateTask / deleteTask                              | update (+`…touch`) or delete · +event `edited` / `deleted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2–3   |

`…touch` = `updatedBy: me, updatedAt: now`, required on **every** task update.

**The next recurring instance** is `buildNextInstance()` with: `createdAt`/`updatedAt` set to now,
`createdBy`/`updatedBy` set to me, `status: 'open'`, `snoozeCount: 0`, `lastSnoozedAt: null`, the
request and completion fields `null`, and no `id` key. If its `ownerId` is no longer in
`memberIds`, write `null`. Its id is deterministic, so if the doc already exists, **skip it**
(read it in the transaction). Re-`set()`-ing it is an update that rewrites `createdAt`, which is
denied and fails the whole batch.

**Join error mapping** (rules return only `permission-denied`): read `invites/{code}` first. Missing
→ `not-found`; `revoked` → `revoked`; `expiresAt ≤ now` → `expired`; `getDoc(household)` succeeds →
`already-member`; otherwise → `full`. `createInvite`/`revokeInvite` always revoke the old doc, so a
rotated code reads as revoked.

**previewInvite** = `getDoc(invites/{code})` → `{householdName, inviterName, memberCount}`. The
household doc itself is unreadable to non-members.

## 4. Indexes (`firestore.indexes.json`)

| index                                                              | serves                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `tasks (status ASC, completedAt DESC)`, collection scope           | `watchDoneTasks`: `where('status','==','done').orderBy('completedAt','desc').limit(n + 1)` |
| fieldOverride: `photos.dataUrl`, `photos.thumbDataUrl`, no indexes | never queried; avoids index entries for 300 KB strings                                     |

Automatic single-field indexes cover the rest: `watchOpenTasks` (`status == 'open'`, sorted on the
client), `watchRecentEvents` (`orderBy('createdAt','desc').limit(n)`), `watchTreats`,
`watchMembers` and the notifier (`events.push == 'pending'`, `sent.expireAt < now`). Combining a
`where` with an `orderBy` on a different field anywhere else needs a new composite index.

## 5. Notes for the notifier (5.2, Admin SDK bypasses rules)

Re-check current membership before every send: device owner ∈ `memberIds`, and `targetId` ∈
`memberIds`. Device docs of departed members can linger. Treat `taskTitle` as user text.
`requested` goes to `targetId` (the asked member) while the task is still asked of them
(`requestedOf == targetId`, or the previous version's `ownerId == targetId`); `accepted` /
`declined` go to `targetId` (the asker) under their `requests` preference.
`jar_filled` goes out only while the jar is still full by its goal (`scripts/notify/jar.ts`, the
same test as `isFull` in `src/lib/domain/jar.ts`) and in the same round. A deleted jar (`null`)
sends nothing, and neither does a new jar set up after the fill (its `startedAt` is later).
