# Step 1.4 REPORT: design system (summary of the worker hand-back)

**Status:** DONE. Merged from worktree-agent-a438919866ccedfc7 (42d544a).

## Components
Barrel import: `$components/ui`. Lucide icons are deep-imported.

| Component | Key props |
|---|---|
| Button | variant primary/secondary/ghost/danger; size sm (36px visual, 44px hit) / md / lg (52px); loading; block; icon; href |
| IconButton | label (required) |
| Chip | kind filter / selectable / removable / token |
| Avatar | photo or initial; member ring; unassigned dashed "?" |
| AvatarStack, MemberChip | |
| Badge | kind age / snooze / due / deadline / danger / neutral |
| LockClock | custom icon |
| Card, ListRow, SectionHeader | |
| SegmentedControl | bind:value |
| BottomSheet | native `showModal`; inert background; focus trap; `[data-autofocus]`; spring; drag-dismiss (velocity > 0.8 px/ms or past half height); snapPoints; `data-no-drag`; props `open` / `onClose` / `onClosed` |
| Snackbar | 5s timer; pauses on touch, hover or focus. The host owns the queue and `aria-live` |
| Dialog | |
| TextField, TextArea | `dir=auto`; TextArea has counter and auto-grow |
| NumberField | ₪ prefix |
| Stepper, Toggle, EmptyState, Skeleton, ProgressBar, Spinner, SyncIndicator, Fab | |
| CompletionCircle | bind:checked; fires `haptic('complete')`; wait about 300ms before collapsing the card |

## Illustrations
- EmptyHome, EmptyMemory, EmptyJar and Setup are built on the shared `Illo` frame.
- **AppMark** is a house with a cut-out check. Props: size / tile / mono. Its tile version is maskable-safe from 16px to 512px.

## Platform helpers
- **haptics:** `haptic('take' | 'complete' | 'jarFull' | 'select' | 'warn')`, `setHapticsEnabled`, `hapticsSupported`. Persisted in `localStorage['homecare.haptics']`.
- **motion:** `reducedMotion.current`, `dur(ms)`, `easeOut`, `SHEET_SPRING`.

## Contrast
- 51 of 51 colour pairs pass AA.
- The FAB and primary buttons use `--accent-strong`, because white on `--accent` is only 3.14:1.

## Token requests
Some components currently use local `light-dark()` fallbacks. The worker asked for these tokens instead (logged to backlog):
- `--surface-raised`
- `--inverse-surface` / `--inverse-ink` / `--inverse-accent`
- `--success-soft`
- `--progress-track`

## Tests
- check: 0 errors, 0 warnings
- gallery E2E: 9/9, with axe reporting 0 serious or critical issues

## Orchestrator merge
- `he.dev.ui` was re-homed to `he/ui.ts` (`he.ui.*`), and gallery copy to `he/dev.ts`.
- `he.task.take` was renamed to `he.taskCard.take`.
- Screenshots were untracked (gitignored).
- Post-merge: check 0/0, unit 348, demo E2E 9/9.
