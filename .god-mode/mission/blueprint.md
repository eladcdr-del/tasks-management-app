# HomeCare: Technical Blueprint

## 1. Stack (decisive)
| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Svelte 5 (runes)** ^5.57 | Smallest runtime, built-in transitions/springs for polished motion, plain-HTML-like files easy for a future maintainer. |
| Language | TypeScript, strict. JS-based TS (latest 5.x/6.x that svelte-check supports), not TS 7 native | svelte-check needs the JS language-service API. |
| Build | Vite ^8.3 + @sveltejs/vite-plugin-svelte (version compatible with Vite 8) | Fast, first-class Svelte. |
| PWA | vite-plugin-pwa ^1.3, **`strategies: 'injectManifest'`**, ONE service worker `src/sw.ts` → `/tasks-management-app/sw.js`, scope `/tasks-management-app/` | Workbox precache and Firebase background messaging live in the same SW, so there are no scope fights and no root-level `firebase-messaging-sw.js`. `getToken({serviceWorkerRegistration})` receives this registration. |
| Routing | Tiny custom **hash router** (`#/task/abc`) | Immune to Pages 404s and the base path. History entries for sheets make the Android back button close sheets. |
| State | Svelte 5 rune classes in `src/lib/state/*.svelte.ts`, fed by repository subscriptions | No library; reactive and simple. |
| Styling | Plain CSS: custom-property tokens (`tokens.css`) + Svelte scoped styles, **logical properties only** (`margin-inline-start`, `inset-inline-end`) | Bespoke look, zero runtime, correct RTL. No Tailwind. |
| Icons | `@lucide/svelte` (tree-shaken), stroke 1.75 | Clean, warm-neutral line icons. Directional icons get `.flip-rtl`. |
| Font | **Rubik Variable** via `@fontsource-variable/rubik` (hebrew + latin subsets), precached, `font-display: swap`, `font-variant-numeric: tabular-nums` for counts | Friendly, rounded, excellent Hebrew. |
| Persistence (demo) | `idb-keyval` | Under 1 KB; IndexedDB has room for photos. |
| Dates | No library: `Intl.DateTimeFormat('he-IL', {timeZone:'Asia/Jerusalem'})` + own date-only helpers | Bundle size. |
| Firebase | firebase ^12.19 (modular), lazy `import()` only in firebase mode. Messaging is lazy too. | Demo and setup never download Firebase. |
| Tests | vitest ^5, @playwright/test **1.56.x pinned** (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, never `playwright install`), firebase-tools ^15.32 (emulators), @firebase/rules-unit-testing, @axe-core/playwright | |
| Notifier | Node 22 + tsx + firebase-admin ^14.5, separate `scripts/notify/package.json` | Fast `npm ci` every 5 minutes, without vite or playwright. |

## 2. Folder structure & ownership
`STUB(1.1→X)` = created as a placeholder in 1.1; afterwards only step X edits it.
```
firebase-config.ts              # THE ONE config file (public web config) [1.1]
index.html vite.config.ts svelte.config.js tsconfig.json package.json   [1.1; vite.config PWA block → 5.1]
vitest.config.ts playwright.config.ts .prettierrc .gitignore            [1.1]
firebase.json .firebaserc firestore.rules firestore.indexes.json         [2.3]
pwa-assets.config.ts public/icons/* public/favicon.svg                   [5.1]
src/main.ts src/App.svelte                                                [1.1 → 2.4]
src/sw.ts                                                                 [STUB(1.1→5.1)]
src/styles/{tokens,base,fonts}.css                                        [1.1; 7.2 may adjust]
src/lib/domain/types.ts                                                   [1.1 CONTRACT]
src/lib/domain/{dates,buckets,age,recurrence,jar,categories,ids,search}.ts [1.2]
src/lib/parser/{quickAdd,lexicon}.ts                                      [1.3]
src/lib/i18n/he.ts (all UI strings)                                       [1.1 CONTRACT; steps append keys only in their own namespace block]
src/lib/i18n/format.ts                                                    [1.2]
src/lib/router/{router.svelte.ts,routes.ts}                               [1.1 CONTRACT]
src/lib/data/repository.ts                                                [1.1 CONTRACT]
src/lib/data/demo/{demoRepository,seed,store}.ts                          [2.1]
src/lib/data/firebase/{init,auth,converters,firebaseRepository,errors}.ts [2.2]
src/lib/data/firebase/messaging.ts                                        [5.1]
src/lib/data/select.ts                                                    [2.4]
src/lib/state/{session,household,tasks,sync,ui,prefs}.svelte.ts           [2.4]
src/lib/platform/{haptics,motion}.ts [1.4]  {install,share}.ts [3.1]  image.ts [3.3]  push.ts [5.1]
src/components/ui/* [1.4]   illustrations/* [1.4]   shell/* [3.1]   task/* [3.2]   form/* [3.3]
src/components/jar/{ProgressJar,JarMini,CelebrationOverlay}.svelte        [STUB(1.1→4.2)]
src/components/memory/* [4.1]
src/components/settings/NotificationSettings.svelte                       [STUB(1.1→5.1)]
src/components/shell/UpdatePrompt.svelte                                  [STUB(1.1→5.1)]
src/screens/Home/HomeScreen.svelte [STUB→3.2]  TaskDetail/TaskDetailScreen.svelte [STUB→3.3]
src/screens/Memory/MemoryScreen.svelte [STUB→4.1]  Jar/JarScreen.svelte [STUB→4.2]
src/screens/Household/HouseholdScreen.svelte [STUB→4.3]  Settings/SettingsScreen.svelte [STUB→4.3]
src/screens/Onboarding/{WelcomeStep,HouseholdStep,ProfileStep,InstallStep}.svelte [STUB→3.1]
src/screens/Onboarding/NotificationsStep.svelte [STUB→5.1]
src/screens/Join/JoinScreen.svelte [STUB→3.1]  Setup/SetupScreen.svelte [STUB→3.1]  DevGallery/* [1.4]
src/sheets/{QuickAddSheet,CompleteSheet}.svelte [STUB→3.3]  {RequestSheet,SnoozeSheet}.svelte [STUB→3.2]
src/sheets/JarSetupSheet.svelte [STUB→4.2]
scripts/notify/{index,planner,sender,load,copy,time,guard}.ts + package.json + tests [5.2]
scripts/{postbuild,check-budget}.mjs [6.1 / 7.3]
tests/e2e/*.spec.ts (demo)  tests/e2e-emulator/*.spec.ts  tests/rules/*  tests/contract/*  tests/integration/*  (each step owns the files it names)
.github/workflows/deploy.yml ci.yml [6.1]   notify.yml [5.2]
SETUP.md README.md [6.2]
```
npm scripts (1.1):
- `dev`, `build`, `preview`, `check`
- `test:unit`
- `test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`)
- `test:integration` (auth + firestore emulators)
- `test:e2e` (demo project), `test:e2e:emu` (emulator project)
- `notify:test`, `notify:dry`

## 3. Domain model (`src/lib/domain/types.ts`, verbatim contract)
```ts
export type ISODate = string;            // 'YYYY-MM-DD', calendar date in Asia/Jerusalem
export type Millis = number;             // epoch ms; adapters convert Firestore Timestamps
export type Unsubscribe = () => void;
export type MemberColor = 'terracotta'|'sage'|'slate'|'plum'|'ochre'|'teal';
export type AddressAs = 'f'|'m'|'n';     // Hebrew verb forms: לוקחת / לוקח / לוקח/ת
export type Priority = 'normal'|'high'|'urgent';
export type CategoryId = 'car'|'shopping'|'home'|'health'|'finance'|'returns'|'family'|'other';
export type RecurrenceFreq = 'weekly'|'monthly'|'yearly';
export type Bucket = 'overdue'|'today'|'week'|'later';

export interface NotifyPrefs { requests: boolean; reminders: boolean; partnerDone: boolean; weekly: boolean }
export interface TreatJar { treat: string; target: number; count: number; round: number; startedAt: Millis }
export interface Household {
  id: string; name: string; memberIds: string[]; memberCount: number; maxMembers: number; // 6
  createdBy: string; createdAt: Millis; jar: TreatJar | null;
  invite: { code: string; expiresAt: Millis } | null;   // current active invite (members only see it)
}
export interface Member {
  uid: string; displayName: string; photoURL: string | null; color: MemberColor; addressAs: AddressAs;
  role: 'owner'|'member'; joinedAt: Millis; notify: NotifyPrefs; inviteCode: string | null;
}
export interface Completion { note: string; cost: number | null /* ₪ */; place: string; contact: string; photoIds: string[] /* ≤3 */ }
export interface Task {
  id: string; title: string; notes: string;
  categoryId: CategoryId | null; priority: Priority;
  ownerId: string | null;                 // null = "waiting for someone to take"
  requestedBy: string | null; requestedAt: Millis | null;   // set when someone asked the owner
  createdBy: string; createdAt: Millis; updatedBy: string; updatedAt: Millis;
  scheduledFor: ISODate | null;           // soft plan (היום / השבוע / date)
  dueDate: ISODate | null; dueTime: string | null /* 'HH:mm' */; hardDeadline: boolean;
  recurrence: { freq: RecurrenceFreq } | null; seriesId: string | null;
  status: 'open'|'done';
  snoozeCount: number; lastSnoozedAt: Millis | null;
  completedAt: Millis | null; completedBy: string | null; completion: Completion | null;
  pending?: boolean;                       // client-only: has unsynced local writes
}
export type TaskDraft = Pick<Task,'title'> & Partial<Pick<Task,'notes'|'categoryId'|'priority'|'ownerId'|'scheduledFor'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type TaskPatch = Partial<Pick<Task,'title'|'notes'|'categoryId'|'priority'|'scheduledFor'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type EventType = 'created'|'taken'|'requested'|'released'|'completed'|'reopened'|'snoozed'|'edited'|'deleted'|'jar_filled'|'jar_redeemed'|'member_joined';
export interface ActivityEvent {
  id: string; type: EventType; actorId: string; taskId: string | null; taskTitle: string | null;
  targetId: string | null; createdAt: Millis;
  push: 'pending'|'none'|'sent'|'skipped';  // client writes 'pending' for requested|completed|jar_filled, else 'none'
}
export interface EarnedTreat { id: string /* String(round) */; treat: string; target: number; filledAt: Millis; redeemedAt: Millis | null }
export interface Invite { code: string; householdId: string; householdName: string; inviterName: string; createdBy: string; createdAt: Millis; expiresAt: Millis; revoked: boolean }
export interface InvitePreview { householdName: string; inviterName: string; memberCount: number }
export interface DeviceToken { deviceId: string; householdId: string; token: string; userAgent: string; createdAt: Millis; updatedAt: Millis }
export interface Photo { id: string; taskId: string; dataUrl: string /* jpeg ≤ ~270k chars */; thumbDataUrl: string /* ≤ 20k */; width: number; height: number; createdBy: string; createdAt: Millis }
export interface Category { id: CategoryId; label: string; icon: string /* lucide name */; keywords: string[] }
export interface AuthUser { uid: string; displayName: string; email: string; photoURL: string | null }
export type SyncState = { status: 'synced'|'saving'|'offline'; pendingWrites: number };
```
Default categories (`categories.ts`):

| id | label | icon |
|---|---|---|
| car | רכב | `car` |
| shopping | קניות | `shopping-bag` |
| home | בית ותיקונים | `wrench` |
| health | בריאות | `heart-pulse` |
| finance | כספים וניירת | `receipt` |
| returns | החזרות והחלפות | `repeat-2` |
| family | משפחה ואירועים | `gift` |
| other | אחר | `circle-dot` |

Domain rules (1.2):
- Buckets: `eff = min(dueDate, scheduledFor)`. `dueDate < today` → overdue. `eff ≤ today` → today. A missed soft plan stays in today with the hint "מתוכנן מאתמול". `eff ≤ Saturday of this week` → week. Otherwise later, including tasks with no dates.
- Urgent tasks always appear in the attention block.
- Week = Sunday–Saturday.
- Age (from createdAt): <2 days "חדשה"; then "פתוחה N ימים", "פתוחה שבוע", "פתוחה 3 שבועות", "פתוחה חודשיים".
- Stuck = open ≥ 21 days OR snoozeCount ≥ 3.
- Recurrence: `next = add(dueDate ?? scheduledFor ?? completionDate, freq)`. Monthly clamps the day (31 Jan → 28/29 Feb). Next id is deterministic: `${seriesId}__${nextDate}`. Copies title, notes, category, priority, owner and hardDeadline; resets snooze.
- Jar: `isFull = count ≥ target`. On redeem, `count = max(0, count − target)` and `round + 1`.
- Search: strip niqqud and geresh, map final letters to regular (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ), lower-case Latin, match tokens with optional prefix letters ו/ה/ב/ל/מ/ש/כ.

## 4. Firestore schema & Security Rules
```
users/{uid}                         { householdId|null, createdAt }                 owner-only r/w
users/{uid}/devices/{deviceId}      DeviceToken                                      owner-only r/w
invites/{code}                      Invite   (code = 24-char base62 from crypto.getRandomValues, ≈143 bits)
households/{hid}                    Household (hid = auto id)
households/{hid}/members/{uid}      Member
households/{hid}/tasks/{taskId}     Task  (Timestamps for *At; recurrence ids deterministic)
households/{hid}/events/{eventId}   ActivityEvent
households/{hid}/photos/{photoId}   Photo
households/{hid}/treats/{round}     EarnedTreat
households/{hid}/sent/{key}         notifier dedupe log { at, expireAt }             NO client access
```
**Indexes** (`firestore.indexes.json`):
- `tasks(status ASC, completedAt DESC)` serves the memory query.
- Open tasks are queried by `status=='open'` (single-field) and sorted on the client.
- `events(createdAt DESC)` is single-field.
- The notifier uses only single-field equality queries.

**Rules design** (`firestore.rules`, helpers `signedIn()`, `isMember(hid) = exists(.../households/$(hid)/members/$(request.auth.uid))`, `hh(hid) = get(...)`):
- `households/{hid}`:
  - `get` only if isMember. `list: false` (households are not listable).
  - `create` if `memberIds == [uid]`, `memberCount == 1`, `maxMembers == 6`, `createdBy == uid`, and `existsAfter(members/uid)`.
  - Member `update`: affects only `name`, `jar`, `invite`. Jar is validated (`target` is an int in 3..50, `treat` 1..60 chars, `count ≥ 0`).
  - Join `update`: changed keys exactly `{memberIds, memberCount}`; the new set equals old ∪ {uid}; `size+1`; `memberCount == memberIds.size() ≤ maxMembers`; and `existsAfter(members/uid)`.
  - Leave `update`: removes self only, mirror image of join.
  - No delete.
- `members/{uid}`:
  - read if isMember.
  - `create` if `auth.uid == uid` AND one of:
    - founder: `getAfter(hh).createdBy == uid` and the household didn't exist before;
    - joiner: `inv = get(invites/$(request.resource.data.inviteCode))`, `inv.householdId == hid`, `!inv.revoked`, `inv.expiresAt > request.time`, `get(hh).memberCount < get(hh).maxMembers`, and `uid in getAfter(hh).memberIds`.
  - `role` is forced to `'member'` for joiners.
  - `update`: self only, limited to fields displayName/photoURL/color/addressAs/notify.
  - `delete`: self (leave) or a household owner (remove).
- `invites/{code}`:
  - `get` if signedIn and `code.size() == 24`. `list: false`.
  - `create` if isMember(householdId), `createdBy == uid`, `expiresAt ≤ request.time + 7d`, `revoked == false`.
  - `update` by a member: only `revoked: true`. No delete.
- `tasks`:
  - read/write if isMember.
  - create: `createdBy == uid`, `status == 'open'`, allowed keys only, `title` string 1..200, `notes` ≤ 4000, priority/category/status enums, `ownerId == null || ownerId in hh.memberIds`, `updatedAt == request.time`.
  - update: same validation; `createdBy` and `createdAt` immutable; `updatedBy == uid`.
  - delete: allowed for members.
- `events`: read for members. `create` with `actorId == uid`, an enum type, `push in ['pending','none']`. No update/delete.
- `photos`: read for members. Create with `dataUrl.size() ≤ 300000`, `thumbDataUrl.size() ≤ 20000`, `createdBy == uid`. Delete allowed for members.
- `treats`: read/create/update for members, with field validation.
- `sent`: deny all (admin bypasses rules).
- `users/{uid}`: r/w iff `auth.uid == uid`.

Limits: keep each write's dependent reads ≤ 10, and ≤ 20 in batches. The complete-batch (task + event + household jar + next recurrence) must be tested to stay under the limit.

**Rules tests** (2.3, `tests/rules/*.test.ts`, `initializeTestEnvironment({projectId:'demo-homecare', firestore:{rules}})`). Each item below gets an allow test and a deny test:
- a non-member cannot get or list households/tasks;
- a household can be created only with self as the sole member;
- join works with a valid code;
- join is denied with an expired, revoked or other-household code, when the household is full (6), or when the joiner adds someone else's uid;
- a member cannot alter `memberIds` arbitrarily;
- invites cannot be listed;
- task validation: missing title, title of 201 characters, a bad enum, a foreign `ownerId`, changing `createdBy`;
- an event with a spoofed `actorId`;
- an oversized photo;
- `sent` access;
- `users` cross-access.

## 5. Data access (`src/lib/data/repository.ts`, verbatim contract)
```ts
export class RepoError extends Error { constructor(public code: 'not-found'|'expired'|'revoked'|'full'|'already-member'|'permission'|'popup-blocked'|'network'|'conflict'|'unknown', msg?: string) { super(msg ?? code); } }
export type TakeResult = { ok: true } | { ok: false; takenBy: string };
export interface CompleteResult { nextTaskId: string | null; jarFilled: boolean }
export interface NewMemberProfile { displayName: string; photoURL: string | null; color: MemberColor; addressAs: AddressAs }
export interface Repository {
  readonly kind: 'demo'|'firebase';
  onAuthChange(cb: (u: AuthUser | null) => void): Unsubscribe;
  signInWithGoogle(): Promise<void>;           // popup → redirect fallback; throws RepoError('popup-blocked'|'network')
  signOut(): Promise<void>;
  getMyHouseholdId(): Promise<string | null>;
  createHousehold(name: string, me: NewMemberProfile): Promise<string>;
  previewInvite(code: string): Promise<InvitePreview>;
  joinHousehold(code: string, me: NewMemberProfile): Promise<string>;
  createInvite(hid: string): Promise<Invite>;  // revokes the previous active invite
  revokeInvite(hid: string, code: string): Promise<void>;
  leaveHousehold(hid: string): Promise<void>;
  watchHousehold(hid: string, cb: (h: Household) => void): Unsubscribe;
  watchMembers(hid: string, cb: (m: Member[]) => void): Unsubscribe;
  updateHousehold(hid: string, patch: { name?: string }): Promise<void>;
  updateMember(hid: string, patch: Partial<Pick<Member,'displayName'|'color'|'addressAs'|'notify'>>): Promise<void>;
  watchOpenTasks(hid: string, cb: (t: Task[]) => void): Unsubscribe;
  watchDoneTasks(hid: string, limit: number, cb: (t: Task[], hasMore: boolean) => void): Unsubscribe;
  watchTask(hid: string, id: string, cb: (t: Task | null) => void): Unsubscribe;
  createTask(hid: string, d: TaskDraft): string;                 // sync id; write queued
  updateTask(hid: string, id: string, p: TaskPatch): void;
  takeTask(hid: string, id: string): Promise<TakeResult>;        // tx online; batch offline
  requestTask(hid: string, id: string, toUid: string): void;     // ownerId=to, requestedBy=me
  releaseTask(hid: string, id: string): void;                    // ownerId=null
  snoozeTask(hid: string, id: string, until: ISODate): void;     // scheduledFor=until, snoozeCount+1
  completeTask(hid: string, id: string, c: Omit<Completion,'photoIds'>, photos: Blob[]): Promise<CompleteResult>;
  reopenTask(hid: string, id: string): void;                     // undo: status open, jar −1, delete auto-created next instance if untouched
  deleteTask(hid: string, id: string): void;                     // UI delays call 5s for Undo
  getPhoto(hid: string, photoId: string): Promise<Photo | null>;
  setJar(hid: string, j: { treat: string; target: number }): void;
  redeemJar(hid: string): void;                                  // writes treats/{round}, resets jar
  watchTreats(hid: string, cb: (t: EarnedTreat[]) => void): Unsubscribe;
  watchRecentEvents(hid: string, limit: number, cb: (e: ActivityEvent[]) => void): Unsubscribe;
  registerDevice(d: Omit<DeviceToken,'createdAt'|'updatedAt'>): Promise<void>;
  unregisterDevice(deviceId: string): Promise<void>;
  watchSync(cb: (s: SyncState) => void): Unsubscribe;
  onWriteError(cb: (e: RepoError) => void): Unsubscribe;          // async failures of queued writes
}
```
Write semantics:
- Methods returning `void` or `string` queue the write and return immediately. The firebase adapter calls the SDK promise with `.catch → onWriteError`, which keeps everything offline-safe.
- `takeTask` and `completeTask` use `runTransaction` when online. The transaction guards against a double take and double complete; a conflict yields `{ok:false, takenBy}`. When offline they fall back to a `writeBatch` (last write wins, documented).
- Every mutation writes its ActivityEvent in the same batch.
- Completion increments `household.jar.count` (`increment(1)`) and creates the next recurring instance in the same batch.
- Photos are compressed by `platform/image.ts`, not the adapter: longest edge 1600px, JPEG quality stepping 0.82→0.5 until ≤ 200 KB; thumbnail 240px ≤ 15 KB.
- Firestore init: `initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})})`. Snapshots are read with `{serverTimestamps:'estimate'}`. `pending` comes from `metadata.hasPendingWrites`. `watchSync` combines `onSnapshotsInSync`, pending writes and the `online`/`offline` events.

**Demo adapter (2.1):**
- Implementation: an in-memory store, persisted to IndexedDB through idb-keyval, emitting events synchronously plus on a microtask.
- Fake auth: "signed in" as Michal.
- Seed (`seed.ts`), relative to "today":
  - household "הבית שלנו"
  - members **מיכל** (terracotta, f, owner) and **דני** (slate, m)
  - ~16 open tasks covering: 1 overdue, 2 urgent, 3 waiting for someone, "להחליף את החולצה בקניון" with a hard deadline 3 days out, "לברר על מזגן חדש" (open 7 weeks, snoozed 4 times), "לשלם ארנונה" (monthly recurring), a request "דני ביקש ממיכל", and a mixed Hebrew/English title
  - ~14 completed tasks with documentation, e.g. "החלפת מצבר", note "מוסך השרון, כפר סבא", cost 650, contact "יוסי 050-…", plus one with a small generated SVG→JPEG photo
  - jar "ארוחה במסעדה" at 7/10
  - 2 earned treats
- Dev affordances: an "act as" switch (Settings → מצב דמו, and `?as=dani`) to simulate the partner, plus a simulated invite flow.

**Adapter selection (`select.ts`, 2.4):**
1. `?demo=1` → demo with a fresh seed when `&reset=1`. Sets `localStorage['homecare.mode']='demo'`.
2. `?emulator=1`, honoured only when `import.meta.env.DEV || VITE_E2E` → firebase against the emulators (Auth 9099, Firestore 8080, project `demo-homecare`). Exposes `window.__homecareTest.signIn(uid, name)` through `signInWithCredential(GoogleAuthProvider.credential(fakeIdToken))`; this is tree-shaken out of production builds.
3. Stored mode `demo` → demo, with a "מצב תצוגה" banner and an "exit" control.
4. `firebase-config.ts` complete (apiKey, authDomain, projectId, appId, messagingSenderId) → firebase.
5. Otherwise → `#/setup`.

## 6. Hebrew quick-add parser (`src/lib/parser/quickAdd.ts`, 1.3)
```ts
export interface ParseResult {
  title: string;                      // input minus consumed phrases, whitespace/punctuation tidied; never empty (falls back to raw)
  scheduledFor?: ISODate; dueDate?: ISODate; dueTime?: string; hardDeadline?: boolean;
  priority?: Priority; categoryId?: CategoryId; recurrence?: { freq: RecurrenceFreq };
  matches: { kind: 'date'|'due'|'time'|'priority'|'category'|'recurrence'; start: number; end: number; text: string }[];
}
export function parseQuickAdd(input: string, now: Date, tz = 'Asia/Jerusalem'): ParseResult;
```
Rules:
- Words may carry Hebrew prefixes `[והבלמשכ]{0,2}`.
- Matching runs on NFC-normalised text, removes niqqud, and treats `־`/`-` as spaces.
- The UI shows each match as a removable chip. Removing a chip re-adds its text to the title and drops the field.
- **No owner/member parsing** (the app never infers who does a task).

| Phrase | Result |
|---|---|
| היום / מחר / מחרתיים | scheduledFor = today / +1 / +2 |
| (ב)יום ראשון…שבת, בראשון…בשבת, "יום ה'" | scheduledFor = next occurrence strictly after today |
| השבוע | scheduledFor = Saturday of this week (bucket "week") |
| סוף השבוע / בסופ"ש | scheduledFor = coming Friday |
| בשבוע הבא | scheduledFor = next Sunday |
| בחודש הבא | 1st of next month |
| סוף החודש | last day of the month |
| בעוד N ימים / בעוד שבוע / שבועיים / חודש | today + N days / 7 / 14 / 1 month |
| dd/mm, dd.mm, dd/mm/yy(yy), "ב-15/10", "15 באוקטובר" (all 12 Hebrew month names) | date. A past date with no year → next year. Invalid dates (31/02) are ignored. |
| **עד** + any date phrase above | the date goes to **dueDate** instead of scheduledFor |
| ב-17:00 / בשעה 17:30 / בשעה 5 | dueTime (5 → 17:00 when the hour is under 8) |
| דחוף / !! | priority urgent |
| חשוב / ! | priority high |
| כל שבוע / פעם בשבוע / שבועי | recurrence weekly |
| חודשי / כל חודש / פעם בחודש | monthly |
| שנתי / כל שנה / פעם בשנה | yearly |
| מועד אחרון, or a returns keyword together with `עד <date>` | hardDeadline = true |

Category keywords are kept in the title; the first match wins in table order:
- **returns:** להחזיר, להחליף, החזרה, החלפה, זיכוי
- **car:** רכב, מוסך, טסט, צמיג(ים), מצבר, שמן, פנצ'ר, ביטוח רכב
- **health:** רופא, רופאת, תור, בדיקה, מרפאה, שיניים, תרופה, מרשם, קופת חולים
- **finance:** ארנונה, חשבון, חשבונית, בנק, מס, ביטוח, טופס, לשלם, תשלום, ביטוח לאומי, משכנתא
- **home:** לתקן, תיקון, נזילה, אינסטלטור, חשמלאי, מזגן, נורה, דוד, צבע, הדברה
- **shopping:** לקנות, לרכוש, להזמין, סופר, קניות
- **family:** יום הולדת, מתנה, אירוע, חתונה, ברית

Required tests, with `now` = Sunday 2026-10-04 09:00 Asia/Jerusalem:

| Input | Expected |
|---|---|
| "לקחת את האוטו למוסך מחר" | title "לקחת את האוטו למוסך", scheduledFor 10-05, car |
| "להחזיר מכנסיים עד יום חמישי" | dueDate 10-08, hardDeadline, returns, title "להחזיר מכנסיים" |
| "דחוף לשלם ארנונה" | urgent, finance, title "לשלם ארנונה" |
| "תור לרופא שיניים בשבוע הבא" | scheduledFor 10-11, health |
| "לקנות מתנה לדנה עד 15/10" | dueDate 10-15, shopping |
| "לברר על מזגן" | no dates, home |
| "השבוע לתקן את הברז" | scheduledFor 10-10 |
| "להשקות עציצים כל שבוע" | weekly, title "להשקות עציצים" |
| "חשמלאי ביום ראשון בשעה 17:30" | scheduledFor 10-11, dueTime 17:30 |
| "פגישה בבנק 3/1" | 2027-01-03 |
| "31/02 משהו" | no date |
| "מחר" | title "מחר" (fallback), scheduledFor 10-05 |
| "Netflix לבטל מנוי עד סוף החודש" | dueDate 10-31, mixed bidi title kept |
| "ביום שבת לנקות את המחסן" | 10-10 |
| "בעוד שבועיים טסט לרכב" | 10-18, car |

Also required: the "!!" case, and every month name.

## 7. Screens & IA
Bottom nav, 4 tabs (RTL order from the right): **בית** `#/` · **זיכרון הבית** `#/memory` · **הצנצנת** `#/jar` · **הבית שלנו** `#/household`. Settings opens from the gear in the household header (`#/settings`). The FAB (+) sits at inline-end bottom, above the nav, on Home and Memory. Sheets push a history entry (`history.pushState({sheet})`) so Android back closes them. Sheets are not routes, except that `#/new` (the manifest shortcut) opens QuickAdd over Home.

**Home ("clear picture in one second"), top to bottom:**
1. **Header:** "בוקר טוב, מיכל" with today's date ("יום ראשון, 4 באוקטובר"), SyncIndicator pill, and member AvatarStack.
2. **Pulse card:** three large tappable numerals (tabular, 34px), each scrolling or filtering:
   - **באיחור/דחוף** (danger ink), e.g. 2
   - **להיום**, e.g. 4
   - **מחכות שמישהו ייקח**, e.g. 3

   Below them a quiet balance row with one coloured chip per member: "מיכל 5 · דני 4". Counts only, never advice.
3. **JarMini strip:** "ארוחה במסעדה · 7 מתוך 10" with a slim progress bar. When the jar is full it becomes a celebration card.
4. **"דורש תשומת לב"** (only if non-empty): overdue and urgent tasks.
5. **"מחכות שמישהו ייקח"** (only if non-empty): cards with a one-tap primary "אני לוקחת" and secondary "לבקש מ…".
6. **SegmentedControl** היום | השבוע | בהמשך, with filter chips הכל | שלי | של דני (one per member). Below them, the TaskCard list for that bucket.
7. **Empty states:** illustration plus warm copy ("הכל סגור להיום. אפשר לנשום."), with a quick-add CTA.

**TaskCard:**
- Leading: a completion circle (44px hit target).
- Body: title (2 lines max) and a meta row: category icon, due chip ("עד יום ה'", hard deadline gets a lock-clock icon), age badge when ≥ 7 days, snooze badge when ≥ 2.
- Trailing: owner Avatar in the member's colour ring, or a dashed "?" for unassigned. A "ביקש/ה ממך" label shows when `requestedBy` is set.
- Pending-sync micro-dot.
- Swipe: inline-start = done, inline-end = snooze, both with haptics. Tap opens detail.

**Other screens & sheets:**
- **QuickAddSheet:** autofocused title field with live parsed chips under it. One row of optional chips: מי (אני / member / ללא), מתי (היום / מחר / השבוע / תאריך), עדיפות, קטגוריה, חוזרת. Primary "הוספה". Enter submits. The sheet stays open with "נוסף ✓" for rapid entry. Target: ≤ 5 seconds.
- **TaskDetail `#/task/:id`:**
  - title (inline edit), owner block (take / request / release), plan and due, priority, category, recurrence, notes
  - "היסטוריה" timeline from events (who created, requested, took, snoozed)
  - actions: בוצע (primary), דחייה, שיתוף לוואטסאפ (Web Share → `https://wa.me/?text=` fallback), מחיקה
  - done tasks show their documentation block
- **CompleteSheet:** "כל הכבוד, עוד משימה ירדה מהרשימה". The documentation block is collapsed by default ("להוסיף תיעוד?"): note, cost ₪, place, contact, up to 3 photos. Primary "סיום". Then a check animation, a +1 jar tick and a Snackbar "בוצע · ביטול".
- **SnoozeSheet:** מחר / סוף השבוע / שבוע הבא / בעוד חודש / תאריך. Shows "נדחתה N פעמים" gently.
- **RequestSheet:** member list (no ordering by load, no suggestion) and an optional short message.
- **Memory `#/memory`:** search field ("מתי החלפנו מצבר?"), category and member chips, results grouped by month. Each card shows who did it, date, cost and place. Opens TaskDetail. Empty state when there are no matches.
- **Jar `#/jar`:** large ProgressJar (SVG with marbles in member colours, non-competitive, no per-person tallies), treat name, "עוד 3 משימות". Edit via JarSetupSheet (treat + target stepper 3–50). History list of earned treats. Full state shows a celebration and "מימשנו! צנצנת חדשה".
- **Household `#/household`:**
  - members with colour and address-as edit (self), open counts
  - invite card: "הזמנה בוואטסאפ" creates a code and shares `https://eladcdr-del.github.io/tasks-management-app/#/join/<code>`; shows expiry ("בתוקף עוד 6 ימים"), "ביטול קישור", and remaining member capacity
- **Settings `#/settings`:** notifications (status, enable, per-type toggles, help when the browser blocked them), theme (מערכת/בהיר/כהה), install hint, demo mode, sign out, leave household, version/sync info.
- **Onboarding:**
  - `#/welcome`: hero plus "כניסה עם Google", with a Hebrew error banner.
  - `#/onboarding/profile`: name, address-as (את/אתה), colour.
  - `#/onboarding/household`: create ("איך נקרא לבית?") or "יש לי קישור הזמנה".
  - `#/onboarding/install`: Android Chrome prompt via `beforeinstallprompt`, or a manual tip.
  - `#/onboarding/notifications`.
  - All steps are skippable after household.
- **Join `#/join/:code`:**
  - Shows the preview "מיכל הזמינה אותך להצטרף ל'הבית שלנו'" and Join.
  - If signed out, it routes through sign-in and back, with the code kept in sessionStorage.
  - Errors expired / revoked / full / not-found each have a Hebrew explanation.
- **Setup `#/setup`:** friendly explanation ("האפליקציה עוד לא חוברה ל-Firebase"), a link to SETUP.md, and a primary "נסו את הדמו".

## 8. Design system
Tokens in `tokens.css` on `:root`, with dark values under `[data-theme=dark]` and `@media (prefers-color-scheme: dark)` when theme = system.

| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #FBF6EF | #1C1714 | page |
| --surface | #FFFFFF | #26201C | cards/sheets |
| --surface-2 | #F4ECE1 | #302823 | wells, chips |
| --line | #EADFD2 | #3D332D | hairlines |
| --ink | #2B2420 | #F4ECE3 | primary text |
| --ink-2 | #6B5F57 | #C4B6A9 | secondary text (AA on bg) |
| --ink-3 | #998B80 | #8E8177 | icons/placeholder only (≥ 3:1) |
| --accent | #D9774B | #E58A5F | fills, FAB, jar, focus ring |
| --accent-strong | #B85A2C | #EE9A70 | primary button bg (white text 4.6:1); dark mode uses --ink-on-accent #1C1714 |
| --accent-ink | #A04822 | #F0A27C | accent text/links |
| --accent-soft | #F6E2D6 | #4A2E21 | selected chip bg |
| --sage | #8BA888 | #9DB89A | secondary fills, success |
| --sage-ink | #4F6B4D | #B5CCB2 | success text |
| --danger | #B23B2A | #F08A78 | overdue/urgent text |
| --danger-soft | #F8E1DC | #4A2420 | |

Member palette, each with `-base`, `-soft` (bg tint) and `-ink` (AA text):

| colour | base | soft | ink |
|---|---|---|---|
| terracotta | #D9774B | #F6E2D6 | #A04822 |
| sage | #7E9E7B | #E3ECE1 | #4A6648 |
| slate | #6F8FAF | #E1E9F1 | #44617F |
| plum | #9C6B8E | #EFE2EC | #74476A |
| ochre | #C99A3E | #F5EBD3 | #85621A |
| teal | #4E9A96 | #DCEEED | #2F6E6A |

- **Spacing:** 4-pt scale `--s1..--s10` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Screen padding 20, card padding 16.
- **Radii:** `--r-sm 10`, `--r-md 16` (chips/inputs), `--r-lg 22` (cards), `--r-xl 28` (sheet top), `--r-pill 999`.
- **Shadows** (warm): `--sh-1: 0 1px 2px rgba(74,44,24,.06), 0 2px 8px rgba(74,44,24,.05)`; `--sh-2: 0 6px 24px rgba(74,44,24,.10)`; `--sh-sheet: 0 -8px 32px rgba(74,44,24,.14)`. Dark mode uses shadows at 0.4 alpha black plus 1px `--line` borders.
- **Type** (Rubik, rem-based, honours system font scale):

| style | size/line-height | weight | extra |
|---|---|---|---|
| display | 30/36 | 600 | |
| title | 22/28 | 600 | |
| headline | 18/24 | 600 | |
| body | 16/24 | 400 | |
| callout | 15/22 | 400 | |
| caption | 13/18 | 500 | |
| numeral | 34/38 | 600 | tabular |

- **Touch & motion tokens:** min target 44px, primary buttons 52px.
- **Motion tokens:** `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--ease-spring` (Svelte `spring({stiffness:.18, damping:.75})` for sheets), `--d-fast 120ms`, `--d-base 200ms`, `--d-slow 320ms`.

**Core components (`src/components/ui`, 1.4):** Button (primary/secondary/ghost/danger; sm/md/lg; loading), IconButton, Chip (filter/selectable/removable/parsed-token), Avatar (Google photo or initial on member colour, ring), AvatarStack, MemberChip, Badge (age/snooze/due/hard-deadline), Card, ListRow, SectionHeader, SegmentedControl (animated thumb), BottomSheet (drag-to-dismiss, snap points, focus trap, inert background, back-button aware, safe-area padding), Snackbar (with action/undo, 5s), Dialog (confirm), TextField/TextArea/NumberField (₪ prefix, `inputmode=decimal`), Stepper, Toggle, EmptyState, Skeleton, ProgressBar, Spinner, SyncIndicator (dot plus label), Fab, Toast-free design (Snackbar only). Illustrations: 4 warm line-art SVGs (empty home, empty memory, empty jar, setup), using tokens only.

**Motion principles:**
- Motion explains state; it is never decorative noise.
- Completion: the circle fills with accent, the check stroke draws (240ms), the card collapses (320ms), and a marble drops into JarMini with a slight bounce.
- Sheets spring up and fade out on dismiss.
- List reorders use `animate:flip`.
- `prefers-reduced-motion` → crossfades ≤ 120ms, no bounce or parallax, and a static celebration.
- Haptics (`navigator.vibrate`, no-op if unsupported, user-toggleable): take 12ms, complete [10,40,18], jar full [20,60,20,60,40].

**Copy:**
- All strings live in `he.ts`, gendered via `addressAs` (`t.take(me)` → "אני לוקחת"/"אני לוקח"). Actor phrases use the actor's form ("דני לקח", "מיכל ביקשה").
- Gentle tone and no exclamation spam.
- Numbers use `Intl.NumberFormat('he-IL')`; ₪ via the currency format.
- User text gets `dir="auto"`.

## 9. Notification system
**Client (5.1):**
1. In Settings or onboarding, the user taps "הפעלת התראות".
2. `Notification.requestPermission()`.
3. The Firebase messaging module loads lazily.
4. `getToken(messaging, {serviceWorkerRegistration: await navigator.serviceWorker.ready})` runs with the default VAPID key (if Elad adds one in config, use it).
5. `registerDevice({deviceId, householdId, token, userAgent})`, where `deviceId` is a UUID persisted in localStorage.

On every app start with permission granted, the token is refreshed and the device doc updated if it changed. Sign-out or leaving the household → `unregisterDevice`. Settings shows the states granted / denied (with steps: Chrome ⋮ → הגדרות אתר → התראות) / unsupported / not-configured.
- Foreground: `onMessage` shows an in-app Snackbar.
- Background: in `src/sw.ts`, `onBackgroundMessage` → `showNotification(title, {body, dir:'rtl', lang:'he', icon, badge:'icons/badge-96.png', tag, data:{url}})`.
- `notificationclick` focuses an existing client or opens `data.url` (under the base path).

**Notifier (5.2) — `scripts/notify/index.ts`, run by `.github/workflows/notify.yml`:**
- Triggers: `schedule: '*/5 * * * *'` + `workflow_dispatch`. `concurrency: {group: notify, cancel-in-progress: false}`. `permissions: {contents: read, actions: write}`.
- Guard step: `if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then echo "::notice::secret missing — skipping"; exit 0`. It sets an output, and later steps run only when the secret is present.
- **Secret name: `FIREBASE_SERVICE_ACCOUNT`** (full JSON). The project ID is read from the JSON.
- Steps: checkout → setup-node 22 (cache npm, path `scripts/notify/package-lock.json`) → `npm ci --prefix scripts/notify` → `npx --prefix scripts/notify tsx scripts/notify/index.ts`.
- Per run, for each household (admin list):
  1. Load members, `users/{uid}/devices`, open tasks, and events where `push=='pending'`.
  2. Call the pure `planner.plan({now, household, members, tasks, events})` → `{sends[], eventMarks[]}`.
  3. For each send, `sent/{key}.create({at, expireAt: now+45d})`. ALREADY_EXISTS → skip, which makes it idempotent and at-most-once.
  4. `messaging.sendEach` with data-only messages: `{type,title,body,url,tag}`, `webpush.headers {Urgency:'high', TTL:'43200'}`.
  5. On `messaging/registration-token-not-registered` or `invalid-argument`, delete the device doc. On transient failure, delete the `sent` key so the next run retries.
  6. Mark events `sent` or `skipped`.
  7. Once a day (first run after 03:00 local), prune `sent` docs whose `expireAt` is in the past.
- **Planner rules** (Asia/Jerusalem; quiet hours 22:00–07:30, no sends; event-driven items stay pending and go out at 07:30):
  - **requested** → target member (if ≠ actor and `notify.requests`): "דני ביקש ממך משימה" / body = task title. Key `ev:{eventId}:{uid}`.
  - **completed** → all other members with `partnerDone`. One run's completions by the same actor are coalesced ("מיכל סיימה 3 משימות"). Events older than 12h are skipped as stale. **jar_filled** follows the same path, with body "הצנצנת התמלאה — הגיע הזמן ל: {treat}".
  - **Due-day morning** (window 08:00–12:00): open tasks with `dueDate == today` → owner, or all members if unassigned, with `reminders` on. Coalesced per recipient. Key `due:{taskId}:{dueDate}:{uid}`.
  - **Day-before hard deadline** (window 18:00–21:30): `hardDeadline && dueDate == tomorrow`. Key `eve:{taskId}:{dueDate}:{uid}`.
  - **Weekly nudge** (Sunday 10:00–13:00): stuck tasks owned by the recipient or unassigned, ≥ 1, `weekly` on. Body: "יש 2 משימות שמחכות כבר זמן מה: …". Key `wk:{YYYY-Www}:{uid}`.
  - URLs: `…/tasks-management-app/#/task/{id}` or `#/`.
- **Keepalive:** on Sundays, during the first run after 06:00 UTC (a 5-minute window check), call `gh api -X PUT repos/$GITHUB_REPOSITORY/actions/workflows/notify.yml/enable` with `GH_TOKEN: ${{ github.token }}`. This is the API method used by keepalive-workflow and makes no commits. SETUP.md documents the fallback: GitHub emails before disabling; click "Enable workflow". It also documents that cron delays of 5–15 minutes are normal.
- **Local testing:**
  - `planner.test.ts` (pure, fake `now`): every type, windows, quiet-hour deferral, coalescing, staleness, unassigned fan-out, prefs off, actor never notified.
  - `integration.test.ts` under `firebase emulators:exec` (`FIRESTORE_EMULATOR_HOST`) with an injected fake `Sender`. Seeds data, runs twice, and asserts the second run has 0 sends, an invalid token is removed, and events are marked.
  - `npm run notify:dry -- --now=2026-10-04T08:05+03:00` prints the plan without sending.

## 10. Deployment
- **Single config file:** `/firebase-config.ts` at the repo root:
  ```ts
  export const firebaseConfig = { apiKey:'', authDomain:'', projectId:'', storageBucket:'', messagingSenderId:'', appId:'' };
  export const vapidKey = '';
  ```
  It carries Hebrew comments ("הדביקו כאן את הערכים מ-Firebase. זה בטוח — הערכים האלה ציבוריים"). Editing it on github.com (pencil icon) and committing triggers a redeploy.
- **`deploy.yml`:**
  - Triggers: `push` on `ccr-4db4aa05-kbrwag` and `main`, plus `workflow_dispatch`. `permissions: {contents: read, pages: write, id-token: write}`. `concurrency: {group: pages, cancel-in-progress: true}`.
  - Steps: checkout → setup-node 22 (cache npm) → `npm ci` → `npm run check` → `npm run test:unit` → `npm run build` (`BASE_PATH=/tasks-management-app/`) → `actions/configure-pages` → `actions/upload-pages-artifact` (dist) → `actions/deploy-pages` (current major versions).
  - `postbuild.mjs` copies `index.html` → `404.html`, adds `.nojekyll`, and prints gzip sizes.
- **Caching caveats:** Pages serves everything with `max-age=600` and offers no custom headers. Hashed asset names and SW precache revisions handle this. The SW script is re-checked by the browser regardless of HTTP cache.
- **SW update UX:** `registerType: 'prompt'`. UpdatePrompt shows "גרסה חדשה מוכנה · עדכון", and the update auto-applies when the document becomes hidden with no sheet open.
- **Manifest:**
  - Identity: `name: 'HomeCare'`, `short_name: 'HomeCare'`, `lang: 'he'`, `dir: 'rtl'`.
  - URLs: `id: '/tasks-management-app/'`, `start_url: '/tasks-management-app/#/'`, `scope: '/tasks-management-app/'`.
  - Display and colours: `display: 'standalone'`, `background_color: '#FBF6EF'`, `theme_color: '#FBF6EF'`.
  - Icons: 192, 512 and 512 maskable, generated from `public/icons/source.svg` via @vite-pwa/assets-generator.
  - `shortcuts: [{name: 'משימה חדשה', url: '/tasks-management-app/#/new'}]`.
  - Navigation fallback is `index.html`. The precache covers fonts.
- **Auth caveat:** popup is primary. On Android Chrome, standalone mode opens a Custom Tab. Redirect is the fallback but is unreliable when the authDomain (`*.firebaseapp.com`) differs from github.io under storage partitioning, so the error copy guides "נסו שוב / פתחו בכרום". The authorized domain `eladcdr-del.github.io` is required.
- **CI (`ci.yml`, PR + push):** check, unit, build, `test:rules` (setup-java 21), and E2E against the demo adapter with a Playwright container or `npx playwright install chromium` in CI only.
- **SETUP.md outline (Hebrew, numbered, every click, with screenshot-free exact labels):**
  0. What you get, time ≈ 30 minutes, cost ₪0, no credit card.
  1. GitHub:
     - Settings → General → Change visibility → Public (and optionally delete `.god-mode/`).
     - Settings → Pages → Source = GitHub Actions.
     - Default branch note.
  2. Firebase project: console.firebase.google.com → Add project "homecare" → disable Analytics → Spark.
  3. Firestore: Build → Firestore Database → Create → location `eur3` (or me-west1) → production mode. Paste the rules from `firestore.rules` into the Rules tab → Publish. Create the composite index via the link, or paste from `firestore.indexes.json`.
  4. Auth: Build → Authentication → Get started → Google → Enable → support email. Settings → Authorized domains → Add `eladcdr-del.github.io`.
  5. Web app: Project settings → General → Your apps → `</>` → register "HomeCare" (no Hosting). Copy the config → edit `firebase-config.ts` on GitHub → Commit → watch Actions deploy.
  6. Cloud Messaging: confirm the API is enabled. Optional: Web Push certificates → Generate key pair → paste into `vapidKey`.
  7. Service account: Project settings → Service accounts → Generate new private key. GitHub Settings → Secrets and variables → Actions → New repository secret `FIREBASE_SERVICE_ACCOUNT` → paste the whole JSON. Delete the local file. Warn: never commit it.
  8. Verify: open the site, sign in, create a household. Actions → "notify" → Run workflow → green.
  9. Installing on mom's and dad's phones: open the link in Chrome → "התקנת אפליקציה" / ⋮ → "הוספה למסך הבית" → open from the icon → sign in → (dad) open the WhatsApp invite link → allow notifications.
  10. Troubleshooting: auth/unauthorized-domain, popup blocked, notifications denied, cron delayed or disabled after 60 days, redeploy, demo mode (`?demo=1`).

## 11. Testing strategy
| Layer | Tool / location | Must cover |
|---|---|---|
| Unit | vitest `src/**/*.test.ts` (jsdom only where needed) | domain (dates/DST, buckets, recurrence clamp, age, jar, search), parser table §6, format/plurals, image compressor (mock canvas), state stores against the demo adapter |
| Contract | `tests/contract/repositoryContract.ts`, run vs demo (unit) and vs firebase emulator (integration) | every Repository method; take-conflict; complete → jar +1 → next recurrence once; reopen reverts; offline queue (firebase: `disableNetwork`/`enableNetwork`) |
| Rules | `tests/rules/*.test.ts` + emulator | §4 matrix, allow and deny |
| Notifier | `scripts/notify/*.test.ts` (+ emulator) | §9 |
| E2E demo | Playwright project `demo`: `baseURL http://localhost:4173/tasks-management-app/`, `webServer: npm run build && npm run preview`, Pixel-7-like 390×844, `locale he-IL`, `timezoneId Asia/Jerusalem`, `page.clock.setFixedTime('2026-10-04T09:00:00+03:00')`, URL `?demo=1&reset=1` | all user flows per phase; screenshots `tests/e2e/__screens__/` |
| E2E emulator | project `emulator`, `firebase emulators:exec --only auth,firestore`, URL `?emulator=1` (VITE_E2E build) | two-context realtime, invite/join/cap, offline→reconnect sync |
| Visual / a11y / perf (Phase 7) | visual.spec (390×844 + 360×800, light/dark), @axe-core/playwright, check-budget.mjs, CDP installability | §Master Plan Phase 7 |

Gate per phase: check + unit + build, plus that phase's named specs. Rules, contract and notifier suites are green from the phase that introduces them onward. Selectors use `getByRole` with Hebrew names. Tests never depend on real dates (fixed clock) or the network (demo/emulator only).

Risks to watch:
1. The emulator jar download through the proxy is spiked in 1.1. If blocked, rules and integration suites run in CI only, and the REPORT says so.
2. Signing in with the Auth emulator popup: use the `__homecareTest.signIn` credential hook.
3. Firebase chunk size: lazy-load Firebase and keep within the budget.
4. Dependent-read limits in rules for the complete-batch: keep the contract test for it.
