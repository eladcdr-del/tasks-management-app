<script lang="ts">
  // owner: step 3.3. Task detail (#/task/:id), live via tasks.watchTask(id).
  // Open task: inline title edit, owner block, the editable fields (plan, due, priority, category,
  // recurrence), notes, history, and the actions בוצע / דחייה / שיתוף בוואטסאפ / מחיקה.
  // Done task: its documentation block, notes, history and "פתיחה מחדש".
  // Writes go through the tasks store; each field commits on its own (no save button).
  import { untrack } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Flag from '@lucide/svelte/icons/flag';
  import Tag from '@lucide/svelte/icons/tag';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Check from '@lucide/svelte/icons/check';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import Share2 from '@lucide/svelte/icons/share-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import type { CategoryId, ISODate, Priority, RecurrenceFreq, TaskPatch } from '$lib/domain/types';
  import { getCategory } from '$lib/domain/categories';
  import { ageLabelText, PRIORITY_LABELS, RECURRENCE_LABELS, formatDate, snoozedLabel, whenChip } from '$lib/i18n/format';
  import { ageStart } from '$lib/domain/age';
  import {
    Badge,
    Button,
    CategoryIcon,
    EmptyState,
    IconButton,
    LockClock,
    Skeleton,
    TextArea,
    Toggle
  } from '$components/ui';
  import WhenPicker from '$components/form/WhenPicker.svelte';
  import DateField from '$components/form/DateField.svelte';
  import PriorityPicker from '$components/form/PriorityPicker.svelte';
  import CategoryPicker from '$components/form/CategoryPicker.svelte';
  import RecurrencePicker from '$components/form/RecurrencePicker.svelte';
  import FieldRow from './FieldRow.svelte';
  import OwnerBlock from './OwnerBlock.svelte';
  import DocumentationBlock from './DocumentationBlock.svelte';
  import HistoryList from './HistoryList.svelte';
  import { buildHistory } from './history';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { tasks } from '$lib/state/tasks.svelte';
  import { household } from '$lib/state/household.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { router } from '$lib/router/router.svelte';
  import { href } from '$lib/router/routes';
  import { shareTask } from '$lib/platform/share';

  interface Props {
    id: string;
  }

  let { id }: Props = $props();
  const t = he.taskDetail;

  const watch = untrack(() => tasks.watchTask(id));
  $effect(() => () => watch.dispose());

  const task = $derived(watch.task);
  const today = $derived(clock.today);
  const isDone = $derived(task?.status === 'done');

  // ── title (commits on blur / Enter) ──────────────────────────────────────────
  let titleDraft = $state('');
  let titleFocused = $state(false);
  $effect(() => {
    const title = task?.title ?? '';
    if (!untrack(() => titleFocused)) titleDraft = title;
  });

  function commitTitle() {
    titleFocused = false;
    if (!task) return;
    const next = titleDraft.replace(/\s+/g, ' ').trim();
    if (next === '' ) {
      titleDraft = task.title;
      return;
    }
    if (next !== task.title) tasks.update(task.id, { title: next });
  }

  // ── notes (commit on blur) ───────────────────────────────────────────────────
  let notesDraft = $state('');
  let notesFocused = $state(false);
  $effect(() => {
    const notes = task?.notes ?? '';
    if (!untrack(() => notesFocused)) notesDraft = notes;
  });

  function commitNotes() {
    notesFocused = false;
    if (task && notesDraft !== task.notes) tasks.update(task.id, { notes: notesDraft.trim() });
  }

  function patch(p: TaskPatch) {
    if (task) tasks.update(task.id, p);
  }

  // ── field values ─────────────────────────────────────────────────────────────
  const planText = $derived(
    task
      ? (whenChip(
          { scheduledFor: task.scheduledFor, weekPlan: task.weekPlan, dueDate: null, dueTime: null },
          today
        )?.text ?? null)
      : null
  );
  const dueText = $derived(
    task?.dueDate
      ? (whenChip(
          { dueDate: task.dueDate, dueTime: task.dueTime, scheduledFor: null },
          today,
          clock.wall
        )?.text ?? null)
      : null
  );
  const chip = $derived(task && !isDone ? whenChip(task, today, clock.wall) : null);
  const category = $derived(task ? getCategory(task.categoryId) : null);
  const creator = $derived(household.memberById(task?.createdBy));
  const age = $derived(task && !isDone ? ageLabelText(ageStart(task), today) : '');
  const history = $derived(
    task ? buildHistory(task, tasks.eventsFor(task.id), (uid) => household.memberById(uid)) : []
  );
  const nextInstance = $derived.by(() => {
    if (!task || !isDone || !task.recurrence) return null;
    const series = task.seriesId ?? task.id;
    return tasks.open.find((o) => o.id !== task.id && (o.seriesId ?? o.id) === series) ?? null;
  });

  // ── actions ──────────────────────────────────────────────────────────────────
  async function share() {
    if (!task) return;
    const url = `${location.origin}${location.pathname}#/task/${encodeURIComponent(task.id)}`;
    const r = await shareTask({ title: task.title, text: t.shareText(task.title, chip?.text ?? null), url });
    if (r === 'copied') ui.show(t.copied);
  }

  function remove() {
    if (!task) return;
    tasks.remove(task.id, t.deleted);
    void router.back('/');
  }

  function reopen() {
    if (!task) return;
    tasks.reopen(task.id);
    ui.show(t.reopened);
  }

  function onDue(d: ISODate | null) {
    patch(d === null ? { dueDate: null, dueTime: null, hardDeadline: false } : { dueDate: d });
  }
</script>

<section class="detail" data-testid="task-detail" data-task-id={id}>
  <header class="bar">
    <IconButton label={t.back} icon={ArrowRight} onclick={() => router.back('/')} />
    {#if task}
      <div class="bar-actions">
        <IconButton label={t.share} icon={Share2} onclick={share} />
      </div>
    {/if}
  </header>

  {#if task === undefined}
    <div class="loading" aria-busy="true">
      <Skeleton variant="text" lines={2} />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  {:else if task === null}
    <EmptyState title={t.notFoundTitle} body={t.notFoundBody}>
      {#snippet action()}
        <Button href={href('home')} variant="secondary">{t.backHome}</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="body">
      <div class="head">
        {#if category}
          <p class="eyebrow">
            <CategoryIcon id={category.id} />
            <span>{category.label}</span>
          </p>
        {/if}
        <textarea
          class="title-input"
          rows="1"
          aria-label={t.editTitle}
          dir={textDir(titleDraft)}
          maxlength={200}
          bind:value={titleDraft}
          readonly={isDone}
          onfocus={() => (titleFocused = true)}
          onblur={commitTitle}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              titleDraft = task?.title ?? '';
              e.currentTarget.blur();
            }
          }}
        ></textarea>
        <div class="meta">
          {#if chip}
            <Badge
              label={chip.text}
              kind={chip.tone === 'late' ? 'overdue' : task.hardDeadline ? 'deadline' : 'due'}
            />
          {/if}
          {#if task.priority !== 'normal' && !isDone}
            <Badge
              label={PRIORITY_LABELS[task.priority]}
              kind={task.priority === 'urgent' ? 'urgent' : 'neutral'}
              tone="warn"
            />
          {/if}
          {#if task.recurrence}
            <Badge label={RECURRENCE_LABELS[task.recurrence.freq]} icon={Repeat} />
          {/if}
          {#if age && age !== 'חדשה'}<Badge label={age} kind="age" />{/if}
          {#if task.snoozeCount >= 1 && !isDone}
            <Badge label={snoozedLabel(task.snoozeCount)} kind="snooze" />
          {/if}
        </div>
        <p class="created">
          {t.createdLine(creator?.displayName ?? t.someone, formatDate(task.createdAt, { today }))}
        </p>
      </div>

      {#if isDone}
        <DocumentationBlock {task} {today} />
        {#if nextInstance}
          <a class="next-link" href={href('task', { id: nextInstance.id })} data-testid="next-instance">
            <Repeat aria-hidden="true" />
            <span>{t.nextInstance}</span>
            <ChevronLeft aria-hidden="true" class="chev" />
          </a>
        {/if}
      {:else}
        <OwnerBlock {task} />

        <section class="card fields" aria-label={t.details}>
          <FieldRow label={t.when} value={planText} icon={CalendarDays} name="when">
            <WhenPicker
              value={{ scheduledFor: task.scheduledFor, weekPlan: task.weekPlan }}
              {today}
              onChange={(v) => patch({ scheduledFor: v.scheduledFor, weekPlan: v.weekPlan })}
            />
          </FieldRow>
          <FieldRow label={t.due} value={dueText} icon={CalendarClock} name="due">
            {#snippet badge()}
              {#if task.hardDeadline && task.dueDate}<LockClock size={16} aria-label={t.hardDeadline} />{/if}
            {/snippet}
            <div class="due">
              <DateField value={task.dueDate} min={today} onChange={onDue} />
              {#if task.dueDate}
                <Toggle
                  label={t.hardDeadline}
                  description={t.hardDeadlineHint}
                  checked={task.hardDeadline}
                  onchange={(c) => patch({ hardDeadline: c })}
                />
              {/if}
            </div>
          </FieldRow>
          <FieldRow
            label={t.priority}
            value={PRIORITY_LABELS[task.priority]}
            icon={Flag}
            name="priority"
          >
            <PriorityPicker value={task.priority} onChange={(p: Priority) => patch({ priority: p })} />
          </FieldRow>
          <FieldRow label={t.category} value={category?.label ?? null} icon={Tag} name="category">
            <CategoryPicker
              value={task.categoryId}
              onChange={(c: CategoryId | null) => patch({ categoryId: c })}
            />
          </FieldRow>
          <FieldRow
            label={t.recurrence}
            value={task.recurrence ? RECURRENCE_LABELS[task.recurrence.freq] : null}
            icon={Repeat}
            name="recurrence"
          >
            <RecurrencePicker
              value={task.recurrence?.freq ?? null}
              onChange={(f: RecurrenceFreq | null) => patch({ recurrence: f ? { freq: f } : null })}
            />
          </FieldRow>
        </section>
      {/if}

      <div class="notes">
        <TextArea
          label={t.notes}
          placeholder={t.notesPlaceholder}
          bind:value={notesDraft}
          rows={2}
          maxlength={4000}
          onfocus={() => (notesFocused = true)}
          onblur={commitNotes}
        />
      </div>

      <section class="card history" aria-labelledby="history-title">
        <h2 id="history-title" class="section-title">{t.history}</h2>
        <HistoryList items={history} {today} memberById={(uid) => household.memberById(uid)} />
      </section>

      <div class="quiet-actions">
        <Button variant="ghost" icon={Share2} onclick={share}>{t.share}</Button>
        <Button variant="ghost" icon={Trash2} class="danger-ghost" onclick={remove}>{t.delete}</Button>
      </div>
    </div>

    <footer class="action-bar">
      {#if isDone}
        <Button size="lg" block variant="secondary" icon={RotateCcw} onclick={reopen}>{t.reopen}</Button>
      {:else}
        <Button
          size="lg"
          variant="secondary"
          class="snooze-btn"
          icon={AlarmClock}
          onclick={() => router.openSheet({ name: 'snooze', taskId: task.id })}>{t.snooze}</Button
        >
        <Button
          size="lg"
          block
          icon={Check}
          onclick={() => router.openSheet({ name: 'complete', taskId: task.id })}>{t.complete}</Button
        >
      {/if}
    </footer>
  {/if}
</section>

<style>
  .detail {
    display: grid;
    align-content: start;
    min-block-size: 100dvh;
    padding-block-start: calc(var(--safe-top) + var(--s2));
  }

  .bar {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: calc(var(--screen-pad) - var(--s2));
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
  }

  .bar-actions {
    display: flex;
  }

  .loading {
    display: grid;
    gap: var(--s4);
    padding: var(--s4) var(--screen-pad);
  }

  .body {
    display: grid;
    gap: var(--s5);
    padding: var(--s2) var(--screen-pad) calc(var(--s10) + var(--s8) + var(--safe-bottom));
  }

  .head {
    display: grid;
    gap: var(--s2);
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: var(--s1-5);
    font: var(--font-caption);
    color: var(--accent-ink);
  }

  .title-input {
    inline-size: 100%;
    margin-inline: calc(var(--s2) * -1);
    padding: var(--s1) var(--s2);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--ink);
    font: var(--font-title);
    resize: none;
    field-sizing: content;
    overflow-wrap: anywhere;
    box-sizing: content-box;
    max-inline-size: 100%;
    transition: background-color var(--d-base) var(--ease-out);
  }

  .title-input:not([readonly]):hover {
    background: color-mix(in srgb, var(--surface-2) 60%, transparent);
  }

  .title-input:focus-visible {
    outline: none;
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--focus-ring);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s2) var(--s3);
  }

  .created {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .card {
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--sh-1);
    border: var(--edge);
  }

  .fields {
    padding-block: var(--s1);
  }

  .due {
    display: grid;
    gap: var(--s2);
  }

  .history {
    display: grid;
    gap: var(--s2);
    padding: var(--s4);
  }

  .section-title {
    font: var(--font-headline);
    color: var(--ink);
  }

  .next-link {
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 56px;
    padding-inline: var(--s4);
    border-radius: var(--r-lg);
    background: var(--accent-soft);
    color: var(--accent-ink);
    font: var(--font-callout);
    font-weight: 500;
    text-decoration: none;
  }

  .next-link :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .next-link span {
    flex: 1;
  }

  .quiet-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--s2);
  }

  .action-bar :global(.snooze-btn) {
    flex: none;
    white-space: nowrap;
  }

  .quiet-actions :global(.danger-ghost) {
    color: var(--danger);
  }

  .action-bar {
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 3;
    display: flex;
    gap: var(--s3);
    max-inline-size: var(--content-max);
    margin-inline: auto;
    padding: var(--s3) var(--screen-pad) calc(var(--s3) + var(--safe-bottom));
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px);
    border-block-start: 1px solid var(--line);
  }
</style>
