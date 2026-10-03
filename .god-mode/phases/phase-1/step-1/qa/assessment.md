# Step 1.1 Assessment, round 1. Verdict: IMPROVE

**Gates (run by the assessor):** check 0/0, unit 26/26, build OK, smoke E2E 1/1, contracts byte-identical, base path correct everywhere, dark mode verified.

## CRITICAL
**C1 `.gitignore`.** `node_modules/` (trailing slash) does not ignore the symlinked node_modules in worktrees. Merging a committed symlink would delete the main repo's real node_modules.
- Mitigated immediately: `node_modules` added to `.git/info/exclude`.
- Fix: change the pattern to `node_modules`.

## MAJOR
**M1 Router history bugs, all reproduced:**
- `closeSheet()` + `navigate()` loses the navigation.
- An `<a href>` clicked while a sheet is open resurrects the sheet on Back.
- Cold start on `#/new`: Back exits the app, and navigate from an implied sheet pushes instead of replacing.

**M2 `he.ts` ownership gaps and guaranteed conflicts:**
- no ui, domain or demo blocks
- `task` and `sheets` interleave parallel owners

Fix: split into per-owner files.

**M3 Missing cross-step stubs:**
- Header and Fab mount
- `share.ts` and `DateField` signatures
- postbuild and budget scripts not wired in package.json
- parser duplicates `dates.ts`

**M4 No shared E2E fixtures.** Missing: fixed clock, demo boot helper, screenshot helper, emulator signIn.

**M5 `theme-color`** stays cream in dark mode. Needs media metas, a pre-paint collapse, and an `applyTheme` helper.

**M6 Viewport.** Missing `interactive-widget=resizes-content`, so the Android keyboard covers sheets.

**M7 AA gaps:**
- the focus ring (`--accent`) is 2.92:1, which fails 3:1
- no AA-safe text pairing for member avatars
- the `--ink-3` comment is wrong

## MINOR (→ backlog)
See `logs/backlog.md`, items prefixed `[1.1]`.
