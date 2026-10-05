<script lang="ts">
  // Quick add's list mode (feature bulk-add): many tasks at once, one per line.
  //  - The box takes a typed or pasted list: a WhatsApp message, a notes-app checklist, a numbered
  //    list. listRows → splitList cleans every line (markers, checkboxes, duplicates; at most
  //    LIST_MAX), then each line goes through parseQuickAdd exactly like a single quick add.
  //  - The live preview shows one row per task: its cleaned title and the same chips as the single
  //    quick add (read-only here, so the row's × is the only one), with an × that drops the line
  //    from the box.
  //  - "הוספת 12 משימות" creates them all through tasks.createMany. Nobody is pre-assigned (the app
  //    never suggests who should do a task), so they all wait for someone to take them and none of
  //    them sends a push. Then a "נוספו 12 משימות" snackbar (with undo) and the sheet closes; Home
  //    scrolls them into sight (homeView.addedBatch). Past the cap, the rest stay in the box.
  import { tick } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Clock from '@lucide/svelte/icons/clock';
  import Flag from '@lucide/svelte/icons/flag';
  import Info from '@lucide/svelte/icons/info';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Tag from '@lucide/svelte/icons/tag';
  import X from '@lucide/svelte/icons/x';
  import { DEFAULT_TZ } from '$lib/domain/dates';
  import type { ParseMatch } from '$lib/parser/quickAdd';
  import { LIST_MAX, removeLines } from '$lib/parser/splitList';
  import { Button, ICON_STROKE, IconButton, LockClock, categoryIcon } from '$components/ui';
  import type { IconComponent } from '$components/ui';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { haptic } from '$lib/platform/haptics';
  import { homeView } from '../screens/Home/homeView.svelte';
  import { listRows, type ListRow } from './listRows';

  interface Props {
    /** The list as typed or pasted. Bindable: the sheet keeps it while switching modes. */
    text?: string;
    /** The list came from a multi-line paste into the single input. */
    pasted?: boolean;
    /** Back to the single quick add. */
    onBack: () => void;
    /** Everything was added: close the sheet. */
    onDone: () => void;
  }

  let { text = $bindable(''), pasted = false, onBack, onDone }: Props = $props();

  const t = he.sheetQuickAdd;
  const tl = t.list;
  const uid = $props.id();

  let flash = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let boxEl: HTMLTextAreaElement | undefined = $state();
  let rowsEl: HTMLUListElement | undefined = $state();

  const result = $derived(listRows(text, new Date(clock.nowMs), DEFAULT_TZ));
  const rows = $derived(result.rows);
  const rest = $derived(result.overflow.length);

  // Same icons as the single quick add's chips.
  const KIND_ICON: Record<ParseMatch['kind'], IconComponent> = {
    date: CalendarDays,
    due: CalendarClock,
    time: Clock,
    priority: Flag,
    category: Tag,
    recurrence: Repeat
  };

  function chipIcon(m: ParseMatch): IconComponent {
    if (m.hard) return LockClock;
    if (m.kind === 'category') return categoryIcon(m.value);
    return KIND_ICON[m.kind];
  }

  /** × on a row: its line(s) leave the box; focus moves to the next row's × (or the box). */
  async function drop(row: ListRow) {
    const index = rows.findIndex((r) => r.key === row.key);
    text = removeLines(text, row.item.lines);
    haptic('select');
    await tick();
    const buttons = rowsEl?.querySelectorAll<HTMLButtonElement>('[data-drop]') ?? [];
    const next = buttons[Math.min(index, buttons.length - 1)];
    (next ?? boxEl)?.focus({ preventScroll: true });
  }

  function add() {
    if (rows.length === 0) {
      boxEl?.focus();
      return;
    }
    const ids = tasks.createMany(rows.map((r) => r.draft));
    if (ids.length === 0) return;
    haptic('select');
    homeView.addedBatch = [...homeView.addedBatch, ...ids];
    if (rest > 0) {
      // Past the cap: the rest stay in the box for another round.
      const left = rest;
      text = result.overflow.map((i) => i.text).join('\n');
      showFlash(tl.addedSome(ids.length, left));
      boxEl?.focus({ preventScroll: true });
      return;
    }
    text = '';
    ui.show(tl.added(ids.length), {
      action: he.common.undo,
      onAction: () => {
        for (const id of ids) tasks.remove(id);
      }
    });
    onDone();
  }

  function showFlash(message: string) {
    flash = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = null), 4000);
  }

  $effect(() => {
    const el = boxEl;
    if (el) queueMicrotask(() => el.focus({ preventScroll: true }));
    return () => clearTimeout(flashTimer);
  });
</script>

<section class="list-add" data-testid="quick-add-list" aria-labelledby="{uid}-title">
  <div class="head">
    <h2 class="title" id="{uid}-title">{tl.title}</h2>
    <Button variant="ghost" size="sm" icon={ArrowLeft} flipIcon onclick={onBack} data-list-back>
      {tl.back}
    </Button>
  </div>

  <div class="well">
    <label class="sr-only" for="{uid}-box">{tl.inputLabel}</label>
    <textarea
      bind:this={boxEl}
      bind:value={text}
      id="{uid}-box"
      class="box"
      dir={textDir(text || tl.placeholder)}
      placeholder={tl.placeholder}
      rows={4}
      autocomplete="off"
      data-autofocus></textarea>
  </div>

  {#if pasted && text.trim() !== ''}
    <p class="hint pasted" data-pasted>
      <ClipboardCheck aria-hidden="true" />
      <span>{tl.pasted}</span>
    </p>
  {:else}
    <p class="hint">{tl.hint}</p>
  {/if}

  {#if rows.length > 0}
    <div class="preview">
      <p class="caption" aria-hidden="true">
        <span>{tl.previewLabel}</span>
        <span class="count num">{rows.length}</span>
      </p>
      <ul class="rows" aria-label={tl.previewLabel} bind:this={rowsEl}>
        {#each rows as row (row.key)}
          <li class="row" data-row={row.key}>
            <span class="ring" aria-hidden="true"></span>
            <div class="row-main">
              <span class="row-title" dir={textDir(row.title)}>{row.title}</span>
              {#if row.matches.length > 0}
                <ul class="tokens" aria-label={t.parsedLabel}>
                  {#each row.matches as m (m.key)}
                    {@const Icon = chipIcon(m)}
                    <li class="token" data-key={m.key} data-hard={m.hard ? 'true' : undefined}>
                      <Icon strokeWidth={ICON_STROKE} aria-hidden="true" />
                      <span dir={textDir(m.label)}>{m.label}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <IconButton
              icon={X}
              size="sm"
              label={tl.drop(row.title)}
              class="drop"
              onclick={() => drop(row)}
              data-drop
            />
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if rest > 0}
    <p class="note" data-too-many>
      <Info aria-hidden="true" />
      <span>{tl.tooMany(LIST_MAX, rest)}</span>
    </p>
  {/if}

  <div class="footer">
    <p class="flash" role="status" aria-live="polite">
      {#if flash}<span class="flash-in">{flash}</span>{/if}
    </p>
    <Button size="lg" block disabled={rows.length === 0} onclick={add} data-list-add>
      {tl.add(rows.length)}
    </Button>
  </div>
</section>

<style>
  .list-add {
    display: grid;
    gap: var(--s4);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s1) var(--s3);
  }

  .head :global(.btn) {
    margin-inline-end: calc(var(--s3-5) * -1);
  }

  .title {
    font: var(--font-headline);
    color: var(--ink);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .well {
    border-radius: var(--r-lg);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: box-shadow var(--d-base) var(--ease-out);
  }

  .well:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--accent),
      0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .box {
    display: block;
    inline-size: 100%;
    field-sizing: content;
    min-block-size: calc(4 * var(--lh-body) + 2 * var(--s3-5));
    max-block-size: calc(5.5 * var(--lh-body) + 2 * var(--s3-5));
    padding: var(--s3-5) var(--s4);
    border: 0;
    background: transparent;
    color: var(--ink);
    font: var(--font-body);
    resize: none;
    outline: none;
  }

  .box::placeholder {
    color: var(--placeholder);
  }

  .hint,
  .note {
    margin-block-start: calc(var(--s2) * -1);
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .pasted,
  .note {
    display: flex;
    align-items: flex-start;
    gap: var(--s1-5);
  }

  .pasted {
    color: var(--accent-ink);
    font-weight: 500;
  }

  .note {
    margin-block-start: calc(var(--s1) * -1);
  }

  .pasted :global(svg),
  .note :global(svg) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    margin-block-start: 1px;
  }

  .preview {
    display: grid;
    gap: var(--s2);
  }

  .caption {
    display: flex;
    align-items: center;
    gap: var(--s2);
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink-2);
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 1.85em;
    min-block-size: 1.7em;
    padding-inline: 0.55em;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--fs-caption);
    font-weight: 600;
    line-height: 1;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: var(--r-lg);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 56px;
    padding-block: var(--s2);
    padding-inline: var(--s4) var(--s1);
  }

  .row + .row {
    border-block-start: 1px solid var(--line);
  }

  /* An empty task circle: what each row becomes. */
  .ring {
    flex: none;
    inline-size: 18px;
    block-size: 18px;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1.5px var(--hairline-strong);
  }

  .row-main {
    display: grid;
    gap: var(--s1-5);
    flex: 1;
    min-inline-size: 0;
    padding-block: var(--s1);
  }

  .row-title {
    font: var(--font-body);
    font-weight: 500;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A parsed token, read-only: the single quick add's chip without its ×. */
  .token {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    min-block-size: 26px;
    max-inline-size: 100%;
    padding-block: 0.2em;
    padding-inline: var(--s2) var(--s2-5);
    border-radius: var(--r-md);
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-size: var(--fs-caption);
    font-weight: 500;
    line-height: 1.2;
  }

  .token :global(svg) {
    flex: none;
    inline-size: 14px;
    block-size: 14px;
  }

  .token span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .footer {
    position: sticky;
    inset-block-end: 0;
    z-index: 1;
    display: grid;
    gap: var(--s2);
    padding-block: var(--s1) var(--s3);
    background: var(--surface);
  }

  /* The list scrolls under the button: a soft fade instead of a hard edge. */
  .footer::before {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block-end: 100%;
    block-size: var(--s4);
    background: linear-gradient(to top, var(--surface), transparent);
    pointer-events: none;
  }

  .flash {
    min-block-size: 1.5rem;
    font: var(--font-callout);
    color: var(--sage-ink);
    text-align: center;
  }

  .flash-in {
    display: inline-block;
    animation: flash-in var(--d-base) var(--ease-out);
  }

  @keyframes flash-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flash-in {
      animation-duration: 1ms;
    }
  }
</style>
