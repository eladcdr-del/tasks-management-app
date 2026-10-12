# HomeCare notifier

A small Node script that GitHub Actions runs every 5 minutes (`.github/workflows/notify.yml`),
started by an external scheduler (see [Scheduling](#scheduling)).
It reads Firestore with `firebase-admin`, decides which web-push notifications are due, sends them
through Firebase Cloud Messaging (FCM), and never sends the same one twice. The Firebase project is
on the free Spark plan, which has no Cloud Functions, so this cron job is the app's whole backend.

It is its own npm package (`firebase-admin`, `tsx`) so CI installs it in seconds, without Vite or
Playwright. It never imports from `src/`. `types.ts` mirrors the app's domain types, with the same
field names.

## How a run works

For each household (all of them, listed with admin rights):

1. **Load** the pending events (`events` where `push == 'pending'`). Members, their devices
   (`users/{uid}/devices`) and open tasks (`tasks` where `status == 'open'`) are read only when
   something can actually go out now. That means pending events outside quiet hours, or a window
   that reads tasks (07:30–22:00: "before the time" opens at 07:30, the rest at 08:00 or later).
   Outside those times a run only looks for fresh test requests (`devices` where
   `testPushAt >= now − 2h`, one query per member) and costs about 2 + members reads per
   household; in them about (open tasks + 6). That is 174 of the 288 daily runs, so about 9.7k
   reads a day with 50 open tasks, well inside Spark's 50k reads a day.
2. **Plan** with `planner.ts`, a pure function of `(now, household data)`:
   `plan(...) → { sends, eventMarks }`. It does no I/O and never reads the clock, so it is fully
   tested with a fake clock.
3. **Claim** each send's dedupe keys with `create()` on `households/{hid}/sent/{key}`
   (`{ at, expireAt: now + 45 days }`). If a key gets `ALREADY_EXISTS`, an earlier run already
   sent it.
4. **Push** with `messaging.sendEach`. Messages are data-only: `{type, title, body, url, tag}` plus
   `webpush.headers {Urgency: 'high', TTL: '43200'}`. The app's service worker builds the visible
   notification itself.
5. **Clean up.** If FCM reports a token as `registration-token-not-registered`,
   `invalid-argument` or `invalid-registration-token`, the run deletes that device doc. If a
   transient failure means **no** device got the push, the run deletes the keys it just claimed
   and leaves the events pending, so the next run retries.
6. **Mark** events `sent` or `skipped` (events waiting for a retry stay `pending`).
7. **Prune** once a day: the first run at or after 03:00 local (within 03:00–06:00) deletes `sent`
   docs whose `expireAt` has passed. A `prune:{date}` marker key makes sure this happens once.

**Guarantee: at most once per key.** The run claims a key _before_ the push, so a crash between
the two loses that push instead of doubling it. The run never retries a push that reached at least
one device, because that device would get it twice.

**Coalesced sends.** A send has `keys: string[]`, one key per item it covers. The run claims every
key and pushes **once** if at least one key was new. A summary can grow inside its window: say a
second task becomes due today at 09:00. The run then re-sends the summary with all the items. It
keeps the same `tag`, so the phone replaces the earlier notification instead of showing two.

## Rules (Asia/Jerusalem; windows are `[from, to)`)

The run sends nothing during quiet hours (22:00–07:30). Events stay pending, unmarked, and go out
at 07:30.

The reminder windows run until 22:00 so a reminder goes out on the **first run at or after its
window opens**, however late that run is: every run in the window plans it again, and its keys let
it out only once. GitHub's schedule can leave hours between runs (see [Scheduling](#scheduling)),
so a narrow window could be missed for the whole day. A due-day summary takes in new tasks only
until 12:00. After that it only catches up on tasks that existed by noon, so a task added in the
afternoon (often by the person it is for) does not set off a push.

Two kinds work differently:

- **New tasks** are coalesced in time, per creator. A creator's additions form one burst while each
  comes within 10 minutes of the one before (`NEW_SETTLE_MS`), and the burst goes out once 10
  minutes have passed since its last addition, between 08:00 and 22:00. A bulk add of 21 tasks is
  therefore one push, about 10–15 minutes after the last one. A task added at night (22:00–08:00)
  counts as added at 08:00, so the night's additions become one push at about 08:10. A burst
  never grows after it went out: a later task is more than 10 minutes after its last one and
  starts a new burst. Tasks added more than 18 hours ago (`NEW_MAX_AGE_MS`) or before the kind
  launched (`NEW_TASKS_FROM_MS`, so the first deploy does not announce the backlog) are never
  announced.
- **Before the time** has no catch-up: each task has its own half hour before its time, and only a
  run inside it sends the reminder, never during quiet hours. A task at 07:45 is reminded at
  07:30; one at 07:00 or at 22:30 is not reminded at all.

| Type         | When                                                                                                  | To                                                                                                                                                                                                                                                                                                                                                   | Copy                                                                                                                                                                                                                                               | Key                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requested`  | any time outside quiet hours                                                                          | `targetId` (the asked member), if not the actor and `notify.requests` is on. Skipped unless the task is open and still asked of them (`requestedOf`, or `ownerId` for a request by the previous app version), and when the request is more than 7 days old                                                                                           | "דני ביקש ממך משימה" / "מיכל ביקשה…" / "…ביקש/ה…", body: the task title                                                                                                                                                                            | `ev:{eventId}:{uid}`                                                                                                                                      |
| `accepted`   | like `requested`                                                                                      | `targetId` (the asker), with `notify.requests` on. Skipped if the actor no longer holds the open task, or the answer is more than 7 days old                                                                                                                                                                                                         | "דני לקח: {title}" + "המשימה שביקשת עכשיו אצלו" ("מיכל לקחה…", "אצלה")                                                                                                                                                                             | `ev:{eventId}:{uid}`                                                                                                                                      |
| `declined`   | like `requested`                                                                                      | `targetId` (the asker), with `notify.requests` on. Skipped if the task is done, deleted or already taken by someone, or the answer is more than 7 days old                                                                                                                                                                                           | "דני לא יכול לקחת: {title}" + "המשימה מחכה שמישהו ייקח" (suggests no one)                                                                                                                                                                          | `ev:{eventId}:{uid}`                                                                                                                                      |
| `completed`  | outside quiet hours, event ≤ 24h old                                                                  | every **other** member with `partnerDone` on. The same actor's completions in one run are combined. Skipped if the task is open again (undone)                                                                                                                                                                                                       | "מיכל סיימה: {title}" · "דני סיים 3 משימות" (body lists up to 3 titles)                                                                                                                                                                            | `ev:{eventId}:{uid}` for each event                                                                                                                       |
| `jar_filled` | like `completed`                                                                                      | like `completed`, while the jar is still full in the same round by its goal (`jar.ts`: together `count ≥ target`; each: every current member's `counts[uid] ≥ share`), not undone, not redeemed                                                                                                                                                      | "הצנצנת התמלאה!" + "הגיע הזמן לצ׳ופר: {treat}" (from `household.jar.treat`; each mode prefixes "כל אחד עשה את החלק שלו.")                                                                                                                          | `ev:{eventId}:{uid}`                                                                                                                                      |
| `new_tasks`  | a creator's burst once it has settled (10 minutes since its last addition), 08:00–22:00               | every **other** current member with `newTasks` on. Left out for each recipient: a task they own or that is asked of them (`requestedOf`; the request push covers it), one they have acted on themselves (`updatedBy`: took, released, declined, edited), and one added before they joined. Not for a recurring task's next instance (`seriesId` set) | "אמא הוסיפה משימה חדשה" + the title · "אמא הוסיפה 3 משימות חדשות" (body lists up to 3 titles), in the creator's form; a creator who left is "מישהו מהבית". Tag `new:{creatorUid}:{firstTaskId}`                                                    | `new:{taskId}:{uid}` for each task of the burst                                                                                                           |
| `soon`       | the first run in the half hour before a task's time today, [time − 30 min, time), outside quiet hours | open tasks due today with a time, or timed plans for today. The owner, or every member if unassigned, with `soon` on; not whoever added it themselves after the half hour began                                                                                                                                                                      | "ב-17:30: {title}" + "בעוד 25 דקות" (rounded to 5, at least 5), then " · מועד אחרון" for a hard deadline, " · עוד לא נלקחה" when unassigned. Tag `soon:{taskId}`                                                                                   | `soon:{taskId}:{date}:{HHmm}:{uid}` (a changed time re-arms it)                                                                                           |
| `due`        | 08:00–22:00 (tasks join until 12:00)                                                                  | the owner, or every member if unassigned. One morning summary per recipient: tasks due today (and timed plans for today) under `reminders`, plus overdue tasks under `overdue` (a due date 1–7 days ago; not when `scheduledFor` is after today, i.e. snoozed or re-planned; a soft plan alone is never overdue). Each part only with its switch on  | "להיום: {title}" · "3 משימות להיום" · "באיחור: {title}" + "המועד היה אתמול" / "…לפני יומיים" / "…לפני 3 ימים" · "2 משימות באיחור" · both: "2 משימות להיום ו-3 באיחור", "משימה אחת להיום ואחת באיחור" (body: today's titles, then the overdue ones) | `due:{taskId}:{dueDate}:{uid}` for each task due today, `late:{taskId}:{today}:{uid}` for each overdue one (so at most once a day while it stays overdue) |
| `eve`        | 18:00–22:00                                                                                           | `hardDeadline` tasks due tomorrow. Recipients and summaries as for `due`                                                                                                                                                                                                                                                                             | "מחר המועד האחרון: {title}" · "מחר המועד האחרון ל-2 משימות"                                                                                                                                                                                        | `eve:{taskId}:{dueDate}:{uid}` for each task                                                                                                              |
| `weekly`     | Sunday 10:00–22:00                                                                                    | each member with `weekly` on who has ≥ 1 stuck task they own, or that nobody owns                                                                                                                                                                                                                                                                    | "יש 2 משימות שמחכות כבר זמן מה" (body: up to 3 titles)                                                                                                                                                                                             | `wk:{YYYY-Www}:{uid}`                                                                                                                                     |
| `test`       | any time, quiet hours included, while the request is under 2h old                                     | the one device whose `testPushAt` is fresh ("בדיקת התראות" in Settings), whatever its owner's switches. Current members only                                                                                                                                                                                                                         | "HomeCare: ההתראות מגיעות ✓" + "זו התראת בדיקה מהשרת. מעכשיו כל ההתראות של HomeCare יגיעו לכאן." (`#/settings`, tag `homecare-test`)                                                                                                               | `test:{deviceId}:{testPushAt}`                                                                                                                            |

- **Test pushes** go to one token only (the Send carries a `deviceId`). Each tap writes a new
  `testPushAt`, so it gets its own key and is answered once, on the first run that sees it. The
  per-household log line counts them (`tests N`).
- **Stuck** means open AND actionable (`min(dueDate, scheduledFor)` is empty or ≤ today) AND
  (≥ 21 calendar days since `ageStart`, OR `snoozeCount` ≥ 3). `ageStart` is the creation day for
  a one-off task. For a recurring instance it is the later of the creation day and the instance's
  own date.
- The run never notifies anyone about their own action. A member without device tokens gets
  nothing, but their events are still marked.
- Every kind has its own switch in Settings → התראות (`member.notify`): `requests` (בקשות),
  `newTasks` (משימות חדשות), `reminders` (תזכורות: due today and the evening before), `soon`
  (לפני השעה), `overdue` (משימות באיחור), `partnerDone` (משימות שהושלמו), `weekly` (סיכום שבועי).
  A switch the member doc does not have yet counts as on.
- Links: `https://eladcdr-del.github.io/tasks-management-app/#/task/{id}` for one task, `#/` for a
  summary, `#/jar` for the jar.

## Running locally

```bash
npm install --prefix scripts/notify          # once (own package-lock.json)

npm run notify:test                          # unit + emulator integration tests
#   = firebase emulators:exec --only firestore --project demo-homecare "vitest run --project notifier"

# Print a plan against the emulator, seeded with the demo household (relative to --now):
npx firebase emulators:exec --only firestore --project demo-homecare \
  "npm run notify:dry -- --seed-demo --now=2026-10-04T08:05:00+03:00"
```

- `--dry` plans and prints, and writes and sends nothing. `--now=<ISO>` overrides the clock.
  `--seed-demo` only works when `FIRESTORE_EMULATOR_HOST` is set.
- Against the emulator, a run without `--dry` prints the pushes instead of sending them (FCM has
  no emulator). It still claims keys and marks events.
- Against the real project:
  `FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" npm run notify:dry -- --now=…`. Never commit the
  key file.
- Type-check: `npx tsc -p scripts/notify/tsconfig.json --noEmit`.

## The secret

The only secret is the GitHub Actions repository secret **`FIREBASE_SERVICE_ACCOUNT`**: the whole
service-account JSON from Firebase console → Project settings → Service accounts → Generate new
private key. The run reads the project id from it.

- **No secret:** every run exits green after a `::notice::`. The app works without notifications.
  The workflow's first step checks this in shell, and `guard.ts` (`shouldRun`) applies the same
  rule inside the script.
- **Secret present but not a valid key file:** the run fails red with an `::error::` that says why.

The repo is public, so **Actions logs are public**. A real run logs counts only: no names, task
titles, tokens or household ids.

## Scheduling

GitHub's `schedule` trigger is best effort. On this repo the `*/5` cron actually fires every
2.5–6 hours, so it cannot time notifications. Instead a free external scheduler (cron-job.org; the
click-by-click setup is in [SETUP.md](../../SETUP.md), section 6) starts the workflow every 5
minutes through the `workflow_dispatch` REST API. Dispatched runs start within seconds. The
schedule stays as a fallback.

```http
POST https://api.github.com/repos/eladcdr-del/tasks-management-app/actions/workflows/notify.yml/dispatches
Authorization: Bearer <fine-grained PAT: this repository only, Actions: Read and write>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

{"ref":"ccr-4db4aa05-kbrwag"}
```

A good call answers `204 No Content` and a new run appears under Actions → notify. Extra, late or
overlapping triggers are harmless: `concurrency` runs one at a time and the dedupe keys stop
repeats. Runs are free because the repo is public.

**Without the external trigger** (not set up yet, or its token expired and calls get `401`), only
the sparse schedule runs. Event pushes then arrive hours late. Reminders still go out the same day,
because their windows catch up until 22:00, and completions survive a gap of up to 24h. To recover
from an expired token, create a new one and paste it into the `Authorization` header on
cron-job.org.

## Caveats

- **The 60-day auto-disable.** GitHub disables scheduled workflows in a repo with no activity for
  60 days. The last step, _Keepalive_, runs on every run, scheduled or dispatched. It calls
  `gh api -X PUT repos/$GITHUB_REPOSITORY/actions/workflows/notify.yml/enable` with the job's own
  token (`permissions: actions: write`). This is the keepalive-workflow "API" method and makes no
  commits. The call is idempotent; if it fails, the step only warns and the next run tries again.
  It runs even without the secret. If the workflow does get disabled, GitHub emails a warning
  first: open Actions → notify → **Enable workflow**.
- Optional: to delete expired keys even without the daily prune, add a Firestore TTL policy on the
  `sent` collection group, field `expireAt`.
