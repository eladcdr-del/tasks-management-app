# Step 2.4 REPORT: state and boot (summary of the worker hand-back)

**Status.** Branch worktree-agent-ae03bed3c91e1ec0b, commit f46d844. Not merged yet; it waits for S4 to finish in main.

**Results.**
- check: 0/0
- unit tests: 692 (74 of them new)
- E2E: boot 8/8, 17/17 in total
- production build: OK

## Mode selection
`resolveMode` picks the first match:

| Order | Signal | Mode |
|---|---|---|
| 1 | `?exit-demo` | forget the stored mode |
| 2 | `?demo=1` (with `&reset`, `&as`) | demo, and store the mode |
| 3 | `?emulator=1` | emulator (dev or E2E builds only) |
| 4 | stored mode is demo | demo |
| 5 | firebase-config is complete | firebase |
| 6 | none of the above | setup |

`createRepository` loads both adapters lazily, and strips `reset` and `as` from the URL.

## Boot phases
| Phase | Route |
|---|---|
| booting | splash (AppMark), or retry on error |
| setup | `#/setup` |
| signed-out | `#/welcome` (a join code is saved to `sessionStorage['homecare.pendingInvite']`) |
| no-household | `#/onboarding/household`, or `#/join/<code>` |
| ready | app routes; `setup`, `welcome`, `onboarding/household` and `join` redirect to `#/` |

- Routing is pure: `routeAllowed` and `gateTarget`. These are **hard-coded lists.** Follow-up: switch them to `RouteMeta.access` (amended in 37ff46f).
- Subscriptions are created once per repo and household, and torn down on sign-out and on leaving.

## Stores
**session**
- State: `phase`, `mode`, `user`, `householdId`, `error`, `profileDraft`
- Actions: `signIn`, `signOut`, `createHousehold`, `joinHousehold`, `leaveHousehold`. These reject with a RepoError.

**household**
- State: `household`, `members`, `me`, `partner`, `memberById`, `memberIds`, `jar`, `treats`, `invite`, `loaded`
- Actions: `createInvite`, `revokeInvite`, `updateMember`, `updateHousehold`, `setJar`, `redeemJar`

**tasks**
- State: `open`, `today` (from the clock), `groups`, `pulse`, `countsByMember`, `byId`, `done`, `hasMoreDone`, `recentEvents`, `openLoaded`
- Methods: `loadMoreDone`, `eventsFor`, `watchTask(id)` → `{task, dispose}`
- Actions: `create`, `update`, `take`, `request`, `release`, `snooze`, `complete`, `reopen`, `remove(id, msg?)` (deferred 5 s), `undoRemove`. These never reject; errors go to the snackbar.

**Other stores**
- **ui:** `current`, `queue`, `show`, `dismiss`, `pushError`
- **sync:** `status`, `pendingWrites`, `online`
- **prefs:** `setTheme`, `setHaptics`, `markVersionSeen`
- **clock:** `nowMs`, `today`, `wall`; one timer that fires at the minute boundary or at midnight

## Test hooks and UI
- `window.__homecareTest = { state, clock, signIn, actAs, resetDemo, flush }`, available in dev and E2E builds only.
- DemoBanner: "מצב תצוגה · הנתונים לדוגמה" / "יציאה מהדמו".
- Entry bundle is 31.5 kB gz. The demo chunk (14 kB) and the firebase chunk load lazily.

## Mismatches
- `select.ts` has its own `configLooksComplete`. Step 2.2's version must agree with it.
- `he.errors` has only `generic`. Step 2.2 adds one key per code.
- The emulator `openApp` has no emulator option.
- `contract.firebase.test.ts` is left to 2.2.

## Still needed in 3.1
- **Setup:** `enterDemo()` / `DEMO_ENTRY_HREF`
- **Welcome:** `session.signIn()`
- **Profile:** `session.profileDraft`
- **Household:** `session.createHousehold`
- **Join:** `session.joinHousehold`, plus error messages
- **SnackbarHost:** renders `ui.current`
