# HomeCare notifier

A small Node script that GitHub Actions runs every 5 minutes (`.github/workflows/notify.yml`).
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
   something can actually go out now. That means pending events outside quiet hours, or an open
   reminder window (08:00–22:00). Outside those times a run costs about 2 reads per household; in
   them about (open tasks + 6), so 288 runs a day stay well inside Spark's 50k reads a day.
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
it out only once. GitHub's schedule can leave hours between runs (see Caveats), so a narrow window
could be missed for the whole day. A due-day summary takes in new tasks only until 12:00. After
that it only catches up on tasks that existed by noon, so a task added in the afternoon (often by
the person it is for) does not set off a push.

| Type         | When                                 | To                                                                                                                                                           | Copy                                                                    | Key                                          |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------- |
| `requested`  | any time outside quiet hours         | `targetId`, if not the actor and `notify.requests` is on. Skipped if the task is no longer open and assigned to them, or the request is more than 7 days old | "דני ביקש ממך משימה" / "מיכל ביקשה…" / "…ביקש/ה…", body: the task title | `ev:{eventId}:{uid}`                         |
| `completed`  | outside quiet hours, event ≤ 24h old | every **other** member with `partnerDone` on. The same actor's completions in one run are combined. Skipped if the task is open again (undone)               | "מיכל סיימה: {title}" · "דני סיים 3 משימות" (body lists up to 3 titles) | `ev:{eventId}:{uid}` for each event          |
| `jar_filled` | like `completed`                     | like `completed`                                                                                                                                             | "הצנצנת התמלאה!" + "הגיע הזמן ל: {treat}" (from `household.jar.treat`)  | `ev:{eventId}:{uid}`                         |
| `due`        | 08:00–22:00 (tasks join until 12:00) | the owner, or every member if unassigned, with `reminders` on. One summary per recipient                                                                     | "להיום: {title}" · "3 משימות להיום"                                     | `due:{taskId}:{dueDate}:{uid}` for each task |
| `eve`        | 18:00–22:00                          | `hardDeadline` tasks due tomorrow. Recipients and summaries as for `due`                                                                                     | "מחר אחרון: {title}" · "מחר אחרון: 2 משימות"                            | `eve:{taskId}:{dueDate}:{uid}` for each task |
| `weekly`     | Sunday 10:00–22:00                   | each member with `weekly` on who has ≥ 1 stuck task they own, or that nobody owns                                                                            | "יש 2 משימות שמחכות כבר זמן מה" (body: up to 3 titles)                  | `wk:{YYYY-Www}:{uid}`                        |

- **Stuck** means open AND actionable (`min(dueDate, scheduledFor)` is empty or ≤ today) AND
  (≥ 21 calendar days since `ageStart`, OR `snoozeCount` ≥ 3). `ageStart` is the creation day for
  a one-off task. For a recurring instance it is the later of the creation day and the instance's
  own date.
- The run never notifies anyone about their own action. A member without device tokens gets
  nothing, but their events are still marked.
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

## Caveats

- **Cron delay.** GitHub starts scheduled runs late, often 5–15 minutes late, and under heavy load
  it skips some. A reminder can therefore arrive a little after its window opens. The windows are
  hours long, so a skipped run is caught by the next one.
- **The 60-day auto-disable.** GitHub disables scheduled workflows in a repo with no activity for
  60 days. The last step, _Keepalive_, runs on Sundays in the first run after 06:00 UTC and on
  every manual run. It calls
  `gh api -X PUT repos/$GITHUB_REPOSITORY/actions/workflows/notify.yml/enable` with the job's own
  token (`permissions: actions: write`). This is the keepalive-workflow "API" method and makes no
  commits. It runs even without the secret. If the workflow does get disabled, GitHub emails a
  warning first: open Actions → notify → **Enable workflow**.
- Optional: to delete expired keys even without the daily prune, add a Firestore TTL policy on the
  `sent` collection group, field `expireAt`.
