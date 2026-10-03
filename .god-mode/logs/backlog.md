# Backlog (Minor findings + ceiling leftovers)
- [1.1] Dark palette duplicated 3× by hand in tokens.css → use `light-dark()`, or add a test asserting the blocks are identical.
- [1.1] `tsBuildInfoFile` points into shared node_modules/.tmp (harmless now).
- [1.1] Screens and sheets are imported by relative paths. Add `$screens`/`$sheets` aliases.
- [1.1] Every screen is imported eagerly in App.svelte. Lazy-load non-tab routes (2.4/7.x budget).
- [1.1] `globPatterns` precaches all JS chunks, including Firebase. 5.1 should exclude Firebase chunks from the precache, or use runtime caching.
- [1.1] Canvas mock decision for `image.ts` tests (3.3).
- [1.1→1.3] The parser has its own `dateMath.ts`, duplicating `domain/dates.ts`. Consolidate after the 1.2/1.3 merge.
