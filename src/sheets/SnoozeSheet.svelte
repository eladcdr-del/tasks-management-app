<script lang="ts">
  // SnoozeSheet (step 3.2): מחר / סוף השבוע / שבוע הבא / בעוד חודש, each with its date, plus a
  // custom date capped at a hard deadline (snoozeMaxDate). A hard deadline TODAY cannot move
  // (snoozeBlockedReason 'deadline-today'): the sheet says so and offers doing it or asking for help.
  // The snooze history shows gently ("נדחתה פעמיים עד עכשיו"). One tap on an option snoozes.
  // Rendered by SheetHost; `onClose` pops the sheet's history entry.
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Check from '@lucide/svelte/icons/check';
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import { Button, LockClock } from '$components/ui';
  import DateField from '$components/form/DateField.svelte';
  import { addDays } from '$lib/domain/dates';
  import { snoozeBlockedReason, snoozeMaxDate } from '$lib/domain/snooze';
  import type { ISODate } from '$lib/domain/types';
  import {
    formatLongDate,
    labeledSnoozeOptions,
    relativeDayLabel,
    snoozedLabel
  } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { router } from '$lib/router/router.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { ui } from '$lib/state/ui.svelte';

  interface Props {
    taskId: string;
    onClose: () => void;
  }

  let { taskId, onClose }: Props = $props();
  const t = he.sheetSnooze;

  const task = $derived(tasks.byId(taskId));
  const today = $derived(tasks.today);
  const options = $derived(task ? labeledSnoozeOptions(task, today) : []);
  const max = $derived(task ? snoozeMaxDate(task, today) : null);
  const blocked = $derived(task ? snoozeBlockedReason(task, today) : null);
  const tomorrow = $derived(addDays(today, 1));

  let custom = $state(false);
  let date = $state<ISODate | null>(null);
  const dateError = $derived(
    date === null ? '' : date < tomorrow ? t.tooEarly : max !== null && date > max ? t.tooLate : ''
  );

  function snooze(until: ISODate) {
    if (!task) return;
    haptic('take');
    tasks.snooze(task.id, until);
    ui.show(t.snoozed(relativeDayLabel(until, today)));
    onClose();
  }
</script>

<div class="sheet" data-sheet-content="snooze" data-task-id={taskId}>
  {#if !task || task.status !== 'open'}
    <h2>{t.title}</h2>
    <p class="note">{t.missing}</p>
    <Button variant="secondary" onclick={onClose}>{he.common.close}</Button>
  {:else if blocked === 'deadline-today'}
    <div class="blocked" data-blocked={blocked}>
      <span class="blocked-icon" aria-hidden="true"><LockClock size={26} /></span>
      <h2>{t.blocked.title}</h2>
      <p class="context" dir={textDir(task.title)}>{task.title}</p>
      <p class="note">{t.blocked.body}</p>
      <div class="blocked-actions">
        <Button
          block
          size="lg"
          icon={Check}
          onclick={() => router.openSheet({ name: 'complete', taskId: task.id })}
          >{t.blocked.doIt}</Button
        >
        <Button
          block
          variant="secondary"
          icon={HandHelping}
          onclick={() => router.openSheet({ name: 'request', taskId: task.id })}
          >{t.blocked.askHelp}</Button
        >
      </div>
    </div>
  {:else}
    <header>
      <h2>{t.title}</h2>
      <p class="context" dir={textDir(task.title)}>{task.title}</p>
      {#if task.snoozeCount > 0}
        <p class="history" data-snooze-history>
          <AlarmClock size={14} aria-hidden="true" />{t.history(snoozedLabel(task.snoozeCount))}
        </p>
      {/if}
    </header>

    <ul class="options" aria-label={t.group}>
      {#each options as o (o.key)}
        <li>
          <button type="button" class="option" data-snooze={o.key} onclick={() => snooze(o.date)}>
            <span class="label">{o.label}</span>
            <span class="when">{formatLongDate(o.date)}</span>
            <ChevronLeft size={18} aria-hidden="true" class="chev" />
          </button>
        </li>
      {/each}
      <li>
        <button
          type="button"
          class="option"
          data-snooze="custom"
          aria-expanded={custom}
          onclick={() => (custom = !custom)}
        >
          <span class="label"><CalendarDays size={18} aria-hidden="true" />{t.custom}</span>
        </button>
      </li>
    </ul>

    {#if max}
      <p class="cap"><LockClock size={14} />{t.maxHint(relativeDayLabel(max, today))}</p>
    {/if}

    {#if custom}
      <div class="custom">
        <DateField value={date} min={tomorrow} label={t.customLabel} onChange={(v) => (date = v)} />
        {#if dateError}<p class="error" role="alert">{dateError}</p>{/if}
        <Button
          block
          disabled={date === null || dateError !== ''}
          onclick={() => date && snooze(date)}>{t.confirm}</Button
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .sheet {
    display: grid;
    gap: var(--s4);
  }

  header {
    display: grid;
    gap: var(--s1);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .context {
    font: var(--font-callout);
    color: var(--ink-2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .history {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    margin-block-start: var(--s1);
    padding: 2px var(--s3);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .options {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: var(--r-md);
    background: var(--surface-2);
    overflow: hidden;
  }

  .options li + li {
    border-block-start: 1px solid var(--line);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: 56px;
    padding-inline: var(--s4);
    text-align: start;
    color: var(--ink);
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .option:active {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  .option:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .label {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    flex: 1;
    font: var(--font-body);
    font-weight: 500;
  }

  .when {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .option :global(.chev) {
    color: var(--ink-3);
    flex: none;
  }

  .cap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .custom {
    display: grid;
    gap: var(--s3);
  }

  .error {
    font: var(--font-caption);
    color: var(--danger);
  }

  .note {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .blocked {
    display: grid;
    justify-items: center;
    gap: var(--s2);
    text-align: center;
  }

  .blocked-icon {
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 56px;
    margin-block-end: var(--s2);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink);
  }

  .blocked-actions {
    display: grid;
    gap: var(--s2);
    inline-size: 100%;
    margin-block-start: var(--s3);
  }
</style>
