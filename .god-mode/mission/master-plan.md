# HomeCare: Master Plan

Principle: contracts first, then fan out. Phase 1 freezes types, the repository interface, tokens, routes and stub files for every screen and sheet. From then on each engineer owns whole files and never edits another step's files. If a step needs a change to a contract file (`types.ts`, `repository.ts`, `tokens.css`, `routes.ts`, `he.ts` keys), it reports the need to the orchestrator and does not make the edit itself. Every step follows verification-before-completion. Logic steps follow test-driven-development. Bugs go through systematic-debugging.

Global "green" gate, required before any phase closes: `npm run check` (svelte-check + tsc), `npm run test:unit`, `npm run build` (with base `/tasks-management-app/`), and that phase's E2E specs (`npm run test:e2e`, demo adapter, 390×844, RTL).

---
## Phase 1: Foundation & Contracts (complex)
**Objective:** A runnable, empty-but-styled app shell under the correct base path. All shared contracts are frozen.
**Depends on:** nothing.
**Step 1.1 Scaffold + contracts (sequential, must finish first).**
- Files: `package.json`, `vite.config.ts` (base path, svelte, a minimal vite-plugin-pwa block in injectManifest mode, a placeholder `src/sw.ts`), `tsconfig.json`, `svelte.config.js`, `vitest.config.ts` (projects: unit, rules, notifier), `playwright.config.ts`, `index.html` (lang=he dir=rtl), `firebase-config.ts` (empty values plus Hebrew comments).
- Contracts: `src/lib/domain/types.ts` and `src/lib/data/repository.ts`, both verbatim from Blueprint §3/§5. `src/lib/router/{router.svelte.ts,routes.ts}`. `src/styles/{tokens.css,base.css,fonts.css}` (self-hosted Rubik). `src/lib/i18n/he.ts` with a key skeleton.
- Stubs: one stub component for EVERY screen, sheet and shared slot listed in Blueprint §2 ("STUB" marks). `src/App.svelte` with route outlet and sheet/snackbar hosts.
- Also: `.gitignore`, `.prettierrc`.
- Spike: run `npx firebase emulators:exec --only firestore "echo ok"` and record in REPORT whether the emulator jar downloads.
- Verify: `npm run build`, `npm run check`, and `tests/e2e/smoke.spec.ts`, which opens `vite preview` at `/tasks-management-app/` and asserts `dir=rtl`, the Rubik font loaded and a Hebrew title.

**Parallel after 1.1 (zero shared files):**
- **1.2 Domain logic (TDD).** `src/lib/domain/{dates,buckets,age,recurrence,jar,categories,ids,search}.ts` and their `*.test.ts`, plus `src/lib/i18n/format.ts` and its test. Covers Asia/Jerusalem date-only math with weeks running Sun–Sat, bucket assignment, Hebrew age strings, monthly clamping, jar math, and Hebrew-normalised search.
- **1.3 Quick-add parser (TDD).** `src/lib/parser/{quickAdd.ts,lexicon.ts,quickAdd.test.ts}`. All Blueprint §6 cases must pass.
- **1.4 Design system.** `src/components/ui/*`, `src/components/illustrations/*`, `src/lib/platform/{haptics,motion}.ts`, `src/screens/DevGallery/*` (dev-only route `#/dev/gallery`). Verify with `tests/e2e/gallery.spec.ts`, which takes gallery screenshots at 390×844 in light and dark. Contrast check: tokens hold AA, as listed in Blueprint §8.

**Phase verification:** unit coverage of `domain/` and `parser/` ≥ 90% of lines; gallery screenshots reviewed; smoke E2E green.

---
## Phase 2: Data Layer & Security (complex)
**Objective:** Both adapters satisfy one contract. Rules are locked down and proven. Reactive app state and adapter selection are in place.
**Depends on:** Phase 1.
**Parallel:**
- **2.1 Demo adapter + seed.** `src/lib/data/demo/*` and `tests/contract/repositoryContract.ts`, a reusable suite taking a factory, run here against demo.
  - Seed: realistic Hebrew data per Blueprint §5, with two members, an "act as" switch and idb-keyval persistence.
- **2.2 Firebase adapter.** `src/lib/data/firebase/{init,auth,converters,firebaseRepository,errors}.ts` and `tests/integration/firebaseAdapter.test.ts` (emulator).
  - Persistent offline cache, popup→redirect sign-in, transactions when online with a batch fallback when offline, and a fire-and-forget write channel.
- **2.3 Firestore rules + indexes.** `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc` (`demo-homecare`), `tests/rules/*.test.ts` using @firebase/rules-unit-testing.
  - Covers the full matrix in Blueprint §4.
  - Must finish with the security-review skill.

**Sequential after 2.1 + 2.2:**
- **2.4 State & boot.** `src/lib/state/*.svelte.ts`, `src/lib/data/select.ts`, `src/main.ts`, `src/App.svelte` (boot gating only).
  - Runs `tests/contract/` against the firebase adapter on the emulator via `tests/integration/contract.firebase.test.ts`.
  - Wires the `?demo=1`, `?emulator=1` and setup-missing routing.

**Phase verification:**
- `npm run test:rules` green (emulator).
- The contract suite is green against both adapters.
- E2E `tests/e2e/boot.spec.ts`: no config leads to the setup screen, "נסו את הדמו" leads to Home with seeded data, and `?demo=1` boots demo.

---
## Phase 3: Core Experience (complex)
**Objective:** Add, plan, take, request, snooze, complete with documentation, and undo. Everything works offline in demo, with a "one-second" Home.
**Depends on:** Phase 2.
**Parallel:**
- **3.1 Shell & onboarding.**
  - Files: `src/components/shell/*` (Header with SyncIndicator, BottomNav, Fab, SheetHost, SnackbarHost), `src/screens/{Setup,Onboarding,Join}/*` excluding `Onboarding/NotificationsStep.svelte`, `src/lib/platform/{install,share}.ts`.
  - E2E: `tests/e2e/onboarding.spec.ts`.
- **3.2 Home + task cards.**
  - Files: `src/screens/Home/*`, `src/components/task/*`, `src/sheets/{RequestSheet,SnoozeSheet}.svelte`.
  - E2E: `tests/e2e/home.spec.ts` (buckets, take, request, release, snooze counter, filters, balance counts, waiting section).
- **3.3 Add, detail, complete.**
  - Files: `src/sheets/{QuickAddSheet,CompleteSheet}.svelte`, `src/screens/TaskDetail/*`, `src/components/form/*` (DateField, CategoryPicker, PriorityPicker, RecurrencePicker, PhotoPicker), `src/lib/platform/image.ts` (+test).
  - E2E: `tests/e2e/task-lifecycle.spec.ts`:
    - quick add ≤ 1 screen with parsed chips
    - complete with note, cost and photo, then undo
    - recurring task completed → next instance created
    - delete → undo

**Phase verification:**
- All three specs green.
- Screenshots of Home (full, empty, offline), QuickAdd and Detail at 390×844 attached to REPORTs.
- Emulator E2E `tests/e2e-emulator/realtime.spec.ts`, owned by 3.2: two contexts, one takes, the other sees it in ≤ 2s, and the second take shows "X כבר לקח/ה".

---
## Phase 4: House Memory, Treat Jar, Household (moderate)
**Objective:** The "value-add" features that make the app worth opening.
**Depends on:** Phase 3.
**Parallel:**
- **4.1 House memory.** `src/screens/Memory/*`, `src/components/memory/*`. Search over completed tasks covers titles, notes and documentation, with Hebrew normalisation using `domain/search.ts`, filters by category and member, and a photo viewer. E2E `tests/e2e/memory.spec.ts` searches "מצבר" and finds the seeded battery replacement with garage and cost.
- **4.2 Treat jar.** `src/screens/Jar/*`, `src/components/jar/*` (ProgressJar, JarMini, CelebrationOverlay), `src/sheets/JarSetupSheet.svelte`. E2E `tests/e2e/jar.spec.ts` checks: fill by completing, celebration once per round, redeem, history, and that reduced motion gives a static celebration.
- **4.3 Household & settings.** `src/screens/{Household,Settings}/*` excluding `src/components/settings/NotificationSettings.svelte`. Covers invite create/share/revoke, member colour and address-as, leave household, theme (system/light/dark), demo exit, and an about/version section. E2E `tests/e2e/household.spec.ts`.

**Phase verification:**
- Specs green.
- Emulator E2E `tests/e2e-emulator/invite.spec.ts`, owned by 4.3: invite → second user joins → member cap enforced → revoked/expired code shows a Hebrew error.
- security-review on the invite flow diff.

---
## Phase 5: PWA & Notifications (complex)
**Objective:** Installable offline PWA with real web push driven by the cron notifier.
**Depends on:** Phase 2. It may run concurrently with Phase 4 because the file sets are disjoint, but it closes after Phase 4.
**Parallel:**
- **5.1 PWA + push client.**
  - Files: `src/sw.ts`, the `VitePWA` block in `vite.config.ts` (5.1 owns this file during Phase 5), `public/icons/*` + `pwa-assets.config.ts`, `src/lib/platform/push.ts`, `src/lib/data/firebase/messaging.ts`, `src/components/settings/NotificationSettings.svelte`, `src/screens/Onboarding/NotificationsStep.svelte`, `src/components/shell/UpdatePrompt.svelte` (STUB from 1.1).
  - E2E `tests/e2e/pwa.spec.ts`:
    - manifest fields and icons resolve under the base path
    - the SW controls the page
    - reload offline still renders Home
    - CDP `Page.getInstallabilityErrors` returns an empty list
- **5.2 Notifier.**
  - Files: `scripts/notify/**` (own `package.json`: firebase-admin, tsx), `.github/workflows/notify.yml`.
  - Unit tests `scripts/notify/planner.test.ts` with a fake clock. They cover every type, quiet hours, coalescing, staleness and dedupe keys.
  - Integration test `scripts/notify/integration.test.ts` runs against the emulator with a fake Sender. It checks a second run sends nothing, invalid tokens are deleted, and events are marked.

**Phase verification:**
- Both suites green.
- `npm run notify:dry` against a seeded emulator prints the expected plan.
- Workflow YAML passes `actionlint` (run via npx, if reachable).
- The secret-absent path is shown to exit 0, using `act`-free reasoning plus a guard-script unit test.

---
## Phase 6: Deployment & Setup Docs (simple)
**Objective:** One push leads to a live site. Elad can set everything up from SETUP.md alone.
**Depends on:** Phase 5.
**Parallel:**
- **6.1 CI/CD.** `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `scripts/postbuild.mjs` (404.html, .nojekyll, size report).
  - Verify: `npm run build && npm run preview` serves at `/tasks-management-app/`.
  - Verify: the deep link `#/task/x` and the `/tasks-management-app/unknown` → 404.html fallback both boot.
  - Verify: workflow YAML lint.
- **6.2 Docs.** `SETUP.md` (Hebrew, every click, per Blueprint §10) and `README.md` (Hebrew/English: what it is, dev commands, demo mode, architecture map).

**Phase verification:** a doc walkthrough review by a fresh agent ("can a non-expert follow every step?"). All file paths and names referenced in SETUP.md exist.

---
## Phase 7: Polish & Hardening (complex)
**Objective:** Commercial-grade finish, verified.
**Depends on:** Phases 1–6.
- **7.1 Visual audit (read-only + screenshots).** `tests/e2e/visual.spec.ts` captures every screen and sheet in the following states:
  - viewports 390×844 and 360×800
  - light and dark
  - empty, typical and stress data (long Hebrew/English mixed titles, 6 members, 60 tasks)

  The output is a ranked defect list in REPORT. It covers spacing rhythm, hierarchy, truncation, bidi, alignment, motion and empty states.
- **7.2 Fixes (single engineer, sequential).** Applies the 7.1 list. May touch any UI file. The screenshot spec is re-run.
- **7.3 Hardening (parallel with 7.2 only for the files listed; uses new test files only).**
  - `tests/e2e/a11y.spec.ts` (@axe-core/playwright: 0 serious/critical; tap targets ≥ 44px; Hebrew aria-labels; 200% font scale has no clipping).
  - `scripts/check-budget.mjs`: initial JS ≤ 90 KB gz in demo/setup paths and ≤ 260 KB gz including the Firebase chunks; fonts ≤ 120 KB; LCP-proxy timing via Playwright on 4G throttling is < 2.5s.
  - `tests/e2e/offline.spec.ts`: full offline session in demo plus emulator offline write → reconnect → synced.
  - A secrets grep (no private keys, no SA JSON).
- **7.4 Final review.** requesting-code-review on the whole repo plus security-review on rules, invite and notifier. Full suite green, both E2E projects.

**Mission done when:**
- Every gate is green.
- The screenshots pass review.
- SETUP.md is complete.
- The app runs fully in demo with no Firebase.
- Nothing secret is in the repo.

