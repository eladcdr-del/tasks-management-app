// owner: step 1.4 — only that step edits this file
//
// Dev gallery (#/dev/gallery) copy only: page title, section headings, sample text. Never shown in
// production. Strings that UI primitives (src/components/ui/*) render in the real app belong in
// ui.ts (he.ui.*), not here — e.g. Stepper / Chip-remove / SyncIndicator labels.
// Note for the merge of step 1.4: keys 1.4 added to the old `dev` block of he.ts are re-homed by
// the orchestrator (gallery copy → here, primitive strings → ui.ts).

export const dev = {
  galleryTitle: 'גלריית רכיבים'
} as const;
