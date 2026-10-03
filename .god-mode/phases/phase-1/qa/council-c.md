# Phase 1 Council: judge C (design + a11y). Verdict: IMPROVE (0 Critical, 5 Major)

**Verified:**
- All 109 tap targets are ≥44px.
- Reduced motion is honoured.
- Forced theme works.
- 15 contrast pairs match the table.
- Tabular numerals work.
- Dark mode is warm.
- `flip-rtl` works.
- BottomSheet is high quality.

## MAJOR
- **M1. Focus-ring regression.** 14 components override the focus ring with `--accent`, which is 2.92:1 and fails. Use `var(--focus-ring)` and add an E2E assertion.
- **M2. Colour semantics collapse into one peach.** urgent ≈ today ≈ selected ≈ Mom: accent-soft vs danger-soft ΔE 3.7, and member-terracotta equals accent. Distinguish by treatment:
  - overdue/urgent: solid danger fill
  - due/deadline: a neutral badge plus an icon
  - selection: ink-based
- **M3. Large system text (130–200%) breaks the primitives.**
  - Fixed-height pills overflow.
  - `nowrap` rows push the page sideways (446px at 200%), which clips sheets and dialogs.
  - Icons are sized in px.
  - Fix: min-block-size, wrapping, em icons, and a 200% scrollWidth test.
- **M4. Primitives missing for §7:** Banner, Disclosure, ChoiceRow, ColorSwatchPicker, PickerChip. Chip, MemberChip and Button's `href` branch drop `...rest`.
- **M5. Brand-first titles flip to LTR.** A `textDir()` helper should return rtl when there is any Hebrew, otherwise auto.

## MINOR
- **m1.** Promote the `light-dark()` fallbacks to tokens. Add control/field/due tones, control radii and em icon sizes.
- **m2.** Toggle-off, progress-track, field-edge and placeholder colours are below 3:1. The dark snackbar is not inverse.
- **m3.** Button has no trailing icon.
- **m4.** TaskCardMock skips Card.
- **m5.** Toggle and Segmented use physical `translateX` with `:global([dir])`.
- **m6.** Off-scale radii and spacing.
- **m7.** Icon stroke is inconsistent.
- **m8.** `haptic('select')` is overused.
- **m9.** Every SyncIndicator has `role="status"`, so it chatters.
- **m10.** AppMark:
  - fills only 52% of its tile; needs a full-bleed maskable variant
  - the concept is generic
- **m11.** Badge, Snackbar and Dialog have no `userText`.
- **m12.** The Setup illustration's face is childish. Use `text-wrap: pretty`. BottomNav and Header are not reviewed yet.
