# Surgeon round 1, step 1.1: all items done, none partial

**Gates (verified by the orchestrator):**
- check: 0 errors, 0 warnings
- unit: 348 tests
- build: 404.html, .nojekyll and the font preload are present
- smoke E2E: green on dist-e2e

## Changes
**Router**
- Calls are queued while the router's own `back()` is in flight.
- `closeSheet()`, `back()` and `navigateTab()` return promises.
- A single capture-phase link handler.
- `#/new` is canonicalized to `#/` with a QuickAdd entry on top.
- Tab policy: leaving Home pushes; switching tab to tab replaces; the Home tab goes back to Home. On a cold start in a tab, Home is inserted underneath.
- `data-tab` links; `stripQueryParam`.

**i18n**
- `he.ts` aggregates `src/lib/i18n/he/*.ts`, one owner per file. A test enforces the owner headers.
- Key moves:
  - `he.sheets.X` → `he.sheetX`
  - `he.task.take` → `he.taskCard.take`
  - `he.task.detailTitle` → `he.taskDetail.title`
  - `he.sheets.jarSetup` → `he.jar.setup`
  - `he.onboarding.notifications` → `he.onboardingNotifications`
  - `he.shell.update` → `he.update` (owner 5.1)

**Stubs**
- Header (owner 3.1)
- FabHost (owner 3.1), plus `ROUTE_META.fab`
- `share.ts` (owner 3.1)
- DateField (owner 3.3)
- `postbuild.mjs` (honours `BUILD_OUT_DIR`)
- `check-budget` stub; `test:coverage` script

**Fixtures**
- `tests/e2e/fixtures.ts`: auto fixed clock (`FIXED_NOW` = Sun 2026-10-04 09:00 +03, override via `test.use({now})`), `openApp(page, hash, {demo, reset, as})`, `shot(page, name)`.
- `tests/e2e-emulator/fixtures.ts`: `clearEmulators()`, `signIn(page, uid, name)` (requires `__homecareTest` from 2.4).

**Theme and viewport**
- Two theme-color metas, collapsed pre-paint.
- `applyTheme` / `currentTheme`.
- Viewport `interactive-widget=resizes-content`.

**Tokens**
- `--focus-ring`
- `--member-*-on` / `--m-on`
- `flip-rtl` uses `:dir(rtl)`

**Other**
- TZ pinned to UTC in vitest.
- Coverage gate at 90%.
- `tests/e2e/__screens__/` is gitignored (orchestrator decision: screenshots are generated artifacts).
