<script lang="ts">
  /*
   * JarSetupSheet: the treat (with a few ideas to tap), how the jar fills, and how much.
   *   כל אחד תורם  every member closes their share (1–20); the default for a new jar, and for the
   *                next round of a jar set up before goal modes
   *   ביחד         the classic total (3–50), by anyone
   * Opens with the current jar when there is one. `next`: right after a redeem ("הצ׳ופר הבא").
   * Switching an existing jar to "כל אחד תורם" mid-round attributes what is already in it to whoever
   * closed it (domain backfillCounts), so nobody's part starts from zero. → household.setJar.
   * Rendered by SheetHost; `onClose` pops its entry.
   */
  import { untrack } from 'svelte';
  import Puzzle from '@lucide/svelte/icons/puzzle';
  import Users from '@lucide/svelte/icons/users';
  import { Button, Chip, Stepper, TextField } from '$components/ui';
  import {
    backfillCounts,
    DEFAULT_MODE,
    DEFAULT_SHARE,
    DEFAULT_TARGET,
    modeOf,
    SHARE_MAX,
    SHARE_MIN,
    TARGET_MAX,
    TARGET_MIN
  } from '$lib/domain/jar';
  import type { JarMode } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';

  interface Props {
    onClose: () => void;
    /** Right after a redeem: choose the next treat. */
    next?: boolean;
  }

  let { onClose, next = false }: Props = $props();
  const t = he.jar.setup;
  const tm = he.jar.modes;

  const current = household.jar;
  const memberIds = household.memberIds ?? household.members.map((m) => m.uid);
  const members = Math.max(1, memberIds.length);
  /** A jar set up before goal modes never chose one: its next round starts with the new default. */
  const legacy = current !== null && current.mode === undefined;

  const startMode: JarMode = current
    ? untrack(() => next) && legacy
      ? DEFAULT_MODE
      : modeOf(current)
    : DEFAULT_MODE;
  let mode = $state<JarMode>(startMode);
  let treat = $state(current?.treat ?? '');
  // An 'each' jar's target is already share × members: switching to together keeps the size.
  let target = $state(current?.target ?? DEFAULT_TARGET);
  let share = $state(
    current?.share ??
      (current
        ? Math.min(SHARE_MAX, Math.max(SHARE_MIN, Math.round(current.target / members)))
        : DEFAULT_SHARE)
  );
  let tried = $state(false);
  const error = $derived(tried && treat.trim() === '' ? t.treatError : undefined);

  /** An existing round with progress switches to "each": what is in the jar stays (hint). */
  const switching = $derived(
    current !== null && !next && modeOf(current) !== 'each' && mode === 'each' && current.count > 0
  );

  const MODES = [
    { id: 'each', icon: Puzzle, ...tm.each },
    { id: 'together', icon: Users, ...tm.together }
  ] as const;

  function pick(m: JarMode) {
    if (m === mode) return;
    mode = m;
    haptic('select');
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    const name = treat.trim();
    if (!name) return;
    if (mode === 'each') {
      const backfill =
        current && !next && modeOf(current) !== 'each'
          ? backfillCounts(current, memberIds, tasks.done)
          : null;
      household.setJar({ treat: name, mode: 'each', share }, backfill);
    } else {
      household.setJar({ treat: name, mode: 'together', target });
    }
    onClose();
  }
</script>

<form class="sheet" data-sheet-content="jarSetup" onsubmit={save} novalidate>
  <header>
    <h2>{next || !current ? t.title : t.editTitle}</h2>
    <p class="hint">{next ? t.nextHint : t.hint}</p>
  </header>

  <div class="treat">
    <TextField
      label={t.treat}
      bind:value={treat}
      placeholder={t.treatPlaceholder}
      maxlength={60}
      enterkeyhint="done"
      {error}
    />
    <div class="ideas" role="group" aria-label={t.suggestionsLabel}>
      {#each t.suggestions as idea (idea)}
        <Chip
          label={idea}
          selected={treat.trim() === idea}
          onclick={() => {
            treat = idea;
            haptic('select');
          }}
          data-idea={idea}
        />
      {/each}
    </div>
  </div>

  <div class="block">
    <p class="label" id="jar-mode-label">{t.mode}</p>
    <div class="modes" role="radiogroup" aria-labelledby="jar-mode-label">
      {#each MODES as m (m.id)}
        <label class={['mode', { checked: mode === m.id }]} data-mode={m.id}>
          <input
            type="radio"
            class="visually-hidden"
            name="jar-mode"
            value={m.id}
            checked={mode === m.id}
            onchange={(e) => e.currentTarget.checked && pick(m.id)}
          />
          <span class="mode-icon" aria-hidden="true"><m.icon size={20} strokeWidth={1.75} /></span>
          <span class="mode-title">{m.title}</span>
          <span class="mode-body">{m.body}</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="block">
    {#if mode === 'each'}
      <p class="label">{t.share}</p>
      <Stepper
        bind:value={share}
        min={SHARE_MIN}
        max={SHARE_MAX}
        label={t.share}
        suffix={t.targetSuffix}
        haptics
      />
      <p class="sum" data-share-total>{t.shareTotal(share * members, members)}</p>
    {:else}
      <p class="label">{t.target}</p>
      <Stepper
        bind:value={target}
        min={TARGET_MIN}
        max={TARGET_MAX}
        label={t.target}
        suffix={t.targetSuffix}
        haptics
      />
    {/if}
  </div>

  {#if switching}
    <p class="note" data-switch-note>{t.switchHint}</p>
  {/if}

  <Button type="submit" block size="lg">{current && !next ? t.save : t.start}</Button>
</form>

<style>
  .sheet {
    display: grid;
    gap: var(--s5);
  }

  header {
    display: grid;
    gap: var(--s1);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .hint,
  .sum,
  .note {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .treat {
    display: grid;
    gap: var(--s3);
  }

  /* One row that scrolls sideways, bleeding to the sheet's edges (fades hint at more). */
  .ideas {
    display: flex;
    gap: var(--s2);
    margin-inline: calc(var(--sheet-pad, var(--s5)) * -1);
    padding-inline: var(--sheet-pad, var(--s5));
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    mask-image: linear-gradient(
      to left,
      transparent 0,
      #000 var(--s4),
      #000 calc(100% - var(--s6)),
      transparent 100%
    );
  }

  .ideas::-webkit-scrollbar {
    display: none;
  }

  .ideas :global(*) {
    flex: none;
  }

  .block {
    display: grid;
    gap: var(--s2);
  }

  .label {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2-5);
  }

  .mode {
    position: relative;
    display: grid;
    align-content: start;
    gap: var(--s1);
    min-block-size: 44px;
    padding: var(--s3) var(--s3) var(--s3-5);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      box-shadow var(--d-fast) var(--ease-out),
      background-color var(--d-fast) var(--ease-out);
  }

  .mode.checked {
    background: var(--select-soft);
    box-shadow: inset 0 0 0 2px var(--select-ring);
  }

  .mode:has(input:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .mode-icon {
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    margin-block-end: var(--s1);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--ink-2);
    transition:
      background-color var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }

  .checked .mode-icon {
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .checked .mode-icon :global(svg) {
    animation: nudge 420ms var(--ease-spring);
  }

  @keyframes nudge {
    40% {
      scale: 1.18;
      rotate: -6deg;
    }
  }

  .mode-title {
    font: var(--font-body);
    font-weight: 600;
    color: var(--ink);
  }

  .mode-body {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
    text-wrap: pretty;
  }

  .note {
    padding: var(--s3) var(--s4);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--ink);
  }

  @media (prefers-reduced-motion: reduce) {
    .checked .mode-icon :global(svg) {
      animation: none;
    }
  }
</style>
