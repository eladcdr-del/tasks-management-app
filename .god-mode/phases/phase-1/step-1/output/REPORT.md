# Step 1.1 REPORT: Scaffold + contracts (condensed by orchestrator from the worker's hand-back)

**Status: DONE.** All gates are green on a fresh run:
- `npm run check`: 0 errors, 0 warnings, `--fail-on-warnings`
- `npm run build`: SW generated, 6 precache entries, JS 19.6 kB gz
- `npm run test:unit`: 26/26
- smoke E2E: 1/1

## Key facts
- **Versions:**
  - TypeScript ~6.0.3: svelte-check 4.7.6 supports TS 5–6, and TS 7 is native.
  - vite 8.3 (Rolldown), @sveltejs/vite-plugin-svelte 7.3.1, svelte 5.57.
  - vite-plugin-pwa 1.3 with @vite-pwa/assets-generator 1.0.4.
  - vitest 5 + @vitest/coverage-v8, jsdom 29 (jsdom 30 needs Node 22.22.2).
  - @testing-library/svelte 5.4 + jest-dom, fake-indexeddb.
  - @playwright/test and playwright-core pinned ~1.56.1, so they use chromium-1194.
  - @axe-core/playwright, firebase 12.19, firebase-tools 15.32, @firebase/rules-unit-testing 5, idb-keyval, @lucide/svelte, @fontsource-variable/rubik, workbox-* 7.4, tsx, prettier + svelte plugin.
  - No --force.
- **Emulator spike:** SUCCESS. The Firestore jar downloads via the proxy. Rules and integration suites run locally; both were proven with throwaway tests.
- **TS split:** `tsconfig.app.json` (svelte-check), `tsconfig.node.json` (configs, tests, scripts minus notify), `tsconfig.sw.json` (WebWorker).
- **Aliases:** `$lib` → `src/lib`, `$components` → `src/components`.
- Runes are forced for all project .svelte files.
- **Contracts:** `types.ts` and `repository.ts` are byte-identical to the Blueprint (plus a header and the import).
- **Router:** `src/lib/router/{routes.ts,router.svelte.ts}`.
  - Route names: home, memory, jar, household, settings, task, new, welcome, onboardingProfile, onboardingHousehold, onboardingInstall, onboardingNotifications, join, setup, devGallery.
  - API: `href(name, params)`, `router.navigate(href, {replace})`, `router.back(fallback)`, `router.openSheet({name:'quickAdd'|'complete'|'request'|'snooze'|'jarSetup', taskId?})`, `router.closeSheet()`, `router.meta.tab`.
  - `?demo=1` is preserved in `location.search`.
- **Extra stubs** (owned by 3.1): `components/shell/{BottomNav,SheetHost,SnackbarHost}`. SheetHost maps sheet → component, so 3.1 never edits App.svelte.
- **Dev gallery:** `#/dev/gallery` is enabled when `import.meta.env.DEV || VITE_E2E==='1'`. The Playwright webServer sets VITE_E2E=1. The gallery is absent from prod builds. 2.4 must gate `?emulator=1` and `__homecareTest` on the same condition.
- **SW:** built but NOT registered (`injectRegister:false`) until 5.1 wires UpdatePrompt.
- **Tokens:** everything in §8, plus:
  - `--ink-on-accent`
  - a dark member palette
  - `--edge`, `--scrim`
  - `--font-*` shorthands, `--safe-*`, `--nav-h` 64px, `--content-max` 560px, `--z-*`
  - the `[data-member-color]` hook exposing `--m-base/--m-soft/--m-ink`
  - a CSS `--ease-spring`, and reduced-motion overrides
- **Orchestrator change after report:** `--accent-ink` and `--member-terracotta-ink` → #A04822, for AA contrast on accent-soft.
- **Theme contract:** `localStorage['homecare.theme']` ∈ system|light|dark, applied pre-paint by an inline script in index.html, via `document.documentElement.dataset.theme`.
- **he.ts:** namespace blocks per owning step. Helpers `gendered(f,m,n)` and `form(who,f,m,n)`.
- **Versioning:** `__APP_VERSION__`, `__APP_COMMIT__`.
- **Worktree hardening:** `cacheDir: '.vite'`, and `server.fs.allow` includes realpath(node_modules) for symlinked node_modules.
- **Prettier:** `types.ts`, `repository.ts` and `.god-mode/` are in .prettierignore.
- **npm audit:** 4 high findings, transitive firebase → @grpc/grpc-js, with no non-breaking fix. Noted for 7.4.

## Gotchas for every later step
- **E2E:** `flock /tmp/homecare-e2e.lock npm run test:e2e -- <spec>`.
  - The webServer always rebuilds; port 4173 is strict.
  - **Use relative URLs:** `page.goto('./?demo=1&reset=1#/')`, never `'/'`.
  - Context: Pixel 7, 390×844, DPR 2, he-IL, Asia/Jerusalem. For dark, use `page.emulateMedia({colorScheme:'dark'})`.
  - After an E2E run, `dist/` holds the VITE_E2E build.
- **Emulators:** use the `flock /tmp/homecare-emu.lock` prefix. Connect to 127.0.0.1 (Firestore 8080, Auth 9099), project `demo-homecare`.
- **Vitest:**
  - The unit project runs `src/**/*.{test,spec}.ts` + `tests/contract/**/*.test.ts`, with Node as the default environment.
  - Component/runes tests need `// @vitest-environment jsdom` as their first line.
  - For IndexedDB, use `import 'fake-indexeddb/auto'`.
  - The rules/integration projects exist only when `FIRESTORE_EMULATOR_HOST` is set (i.e., under `emulators:exec`).
- `check` fails on ANY svelte warning, including a11y. Keep it at 0.
- Known harmless warnings: vite-plugin-pwa prints "inlineDynamicImports deprecated"; firebase-tools prints "Unable to fetch CLI MOTD".
- **Harness note:** subagents could not write REPORT files under `.god-mode/`. Workers return their report in the final message, and the orchestrator saves it.
