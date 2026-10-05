<script lang="ts">
  // owner: step 3.3. QuickAdd ("≤ 5 seconds"): only the title is required.
  //  - The title field is autofocused; every keystroke re-parses (parser/quickAdd.ts) with the set
  //    of dismissed chip keys, so recognised phrases become removable chips under the field.
  //  - One row of optional picker chips: מי · מתי · עדיפות · קטגוריה · חוזרת. An explicit pick
  //    overrides the parsed value of that field (the parsed chip is then shown as replaced).
  //    "מי" is never pre-filled: the app does not suggest who should do a task.
  //  - Enter (or "הוספה") adds the task; the sheet stays open with "נוסף ✓" for rapid entry.
  import { tick } from 'svelte';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Clock from '@lucide/svelte/icons/clock';
  import Flag from '@lucide/svelte/icons/flag';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Users from '@lucide/svelte/icons/users';
  import Tag from '@lucide/svelte/icons/tag';
  import type { CategoryId, Priority, RecurrenceFreq, TaskDraft } from '$lib/domain/types';
  import { DEFAULT_TZ } from '$lib/domain/dates';
  import { categoryShort } from '$lib/domain/categories';
  import { parseQuickAdd, type MatchField, type ParseMatch } from '$lib/parser/quickAdd';
  import { Button, Chip, LockClock, PickerChip, categoryIcon } from '$components/ui';
  import type { IconComponent } from '$components/ui';
  import OwnerPicker from '$components/form/OwnerPicker.svelte';
  import WhenPicker from '$components/form/WhenPicker.svelte';
  import PriorityPicker from '$components/form/PriorityPicker.svelte';
  import CategoryPicker from '$components/form/CategoryPicker.svelte';
  import RecurrencePicker from '$components/form/RecurrencePicker.svelte';
  import type { PlanValue } from '$components/form/when';
  import { PRIORITY_LABELS, RECURRENCE_LABELS, whenChip } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { tasks } from '$lib/state/tasks.svelte';
  import { household } from '$lib/state/household.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { haptic } from '$lib/platform/haptics';
  import { homeView } from '../screens/Home/homeView.svelte';

  interface Props {
    onClose: () => void;
  }

  // The host's scrim / Back / Escape close the sheet; adding keeps it open on purpose (rapid entry).
  let { onClose: _onClose }: Props = $props();

  const t = he.sheetQuickAdd;
  const td = he.taskDetail;

  type PickerName = 'owner' | 'when' | 'priority' | 'category' | 'recurrence';
  interface Picks {
    /** undefined = not picked (ללא); a uid or null = picked. */
    owner?: string | null;
    plan?: PlanValue;
    priority?: Priority;
    categoryId?: CategoryId | null;
    recurrence?: RecurrenceFreq | null;
  }

  let text = $state('');
  let dismissed = $state<string[]>([]);
  let picks = $state<Picks>({});
  let openPicker = $state<PickerName | null>(null);
  let flash = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let inputEl: HTMLInputElement | undefined = $state();

  const today = $derived(clock.today);
  const parsed = $derived(parseQuickAdd(text, new Date(clock.nowMs), DEFAULT_TZ, { dismissed }));

  // ── the effective draft: parsed values, overridden by explicit picks ──────────
  const plan = $derived<PlanValue>(
    picks.plan ?? {
      scheduledFor: parsed.scheduledFor ?? null,
      weekPlan: parsed.weekPlan ?? false
    }
  );
  const priority = $derived<Priority>(picks.priority ?? parsed.priority ?? 'normal');
  const categoryId = $derived<CategoryId | null>(
    picks.categoryId !== undefined ? picks.categoryId : (parsed.categoryId ?? null)
  );
  const recurrence = $derived<RecurrenceFreq | null>(
    picks.recurrence !== undefined ? picks.recurrence : (parsed.recurrence?.freq ?? null)
  );
  const ownerId = $derived(picks.owner ?? null);
  const title = $derived(text.trim() === '' ? '' : parsed.title.trim());

  const draft = $derived<TaskDraft>({
    title,
    scheduledFor: plan.scheduledFor,
    weekPlan: plan.scheduledFor !== null && plan.weekPlan,
    dueDate: parsed.dueDate ?? null,
    dueTime: parsed.dueTime ?? null,
    hardDeadline: parsed.dueDate ? (parsed.hardDeadline ?? false) : false,
    priority,
    categoryId,
    recurrence: recurrence ? { freq: recurrence } : null,
    ownerId
  });

  /** A parsed chip whose field was then picked explicitly. */
  function overridden(m: ParseMatch): boolean {
    switch (m.field) {
      case 'scheduledFor':
        return picks.plan !== undefined;
      case 'priority':
        return picks.priority !== undefined;
      case 'categoryId':
        return picks.categoryId !== undefined;
      case 'recurrence':
        return picks.recurrence !== undefined;
      default:
        return false;
    }
  }

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

  function dismiss(m: ParseMatch) {
    dismissed = [...dismissed, m.key];
  }

  // ── picker chip values ───────────────────────────────────────────────────────
  const ownerText = $derived.by(() => {
    if (picks.owner === undefined) return null;
    if (picks.owner === null) return td.pick.nobody;
    if (picks.owner === household.uid) return td.pick.me;
    return household.memberById(picks.owner)?.displayName ?? null;
  });
  // "מתי" is the plan, as in the task screen; a parsed due date keeps its own "עד …" chip above.
  // Without a due date the time is the plan's.
  const whenText = $derived(
    whenChip(
      {
        scheduledFor: draft.scheduledFor ?? null,
        weekPlan: draft.weekPlan ?? false,
        dueDate: null,
        dueTime: draft.dueDate ? null : (draft.dueTime ?? null)
      },
      today,
      clock.wall
    )?.text ?? null
  );

  /** × on a picker chip: back to "nothing", including the parsed phrases for that field. */
  function clearField(name: PickerName) {
    const fields: Record<PickerName, MatchField[]> = {
      owner: [],
      when: draft.dueDate ? ['scheduledFor'] : ['scheduledFor', 'dueTime'],
      priority: ['priority'],
      category: ['categoryId'],
      recurrence: ['recurrence']
    };
    const drop = parsed.matches.filter((m) => fields[name].includes(m.field)).map((m) => m.key);
    if (drop.length) dismissed = [...dismissed, ...drop];
    const next = { ...picks };
    if (name === 'owner') delete next.owner;
    if (name === 'when') delete next.plan;
    if (name === 'priority') delete next.priority;
    if (name === 'category') delete next.categoryId;
    if (name === 'recurrence') delete next.recurrence;
    picks = next;
    if (openPicker === name) openPicker = null;
  }

  function toggle(name: PickerName) {
    openPicker = openPicker === name ? null : name;
  }

  function choose(patch: Picks, close = true) {
    picks = { ...picks, ...patch };
    if (close) openPicker = null;
  }

  // ── submit ───────────────────────────────────────────────────────────────────
  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (!title) {
      inputEl?.focus();
      return;
    }
    const id = tasks.create($state.snapshot(draft) as TaskDraft);
    if (id === null) return;
    homeView.lastAdded = id;
    haptic('select');
    flash = title;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = null), 2600);
    text = '';
    dismissed = [];
    picks = {};
    openPicker = null;
    await tick();
    inputEl?.focus();
  }

  $effect(() => {
    // Autofocus on open (the BottomSheet also honours data-autofocus once SheetHost uses it).
    const el = inputEl;
    if (el) queueMicrotask(() => el.focus({ preventScroll: true }));
    return () => clearTimeout(flashTimer);
  });

  // Dismissed keys of phrases that are gone from the text do no harm, but drop them on clear.
  $effect(() => {
    if (text === '' && dismissed.length) dismissed = [];
  });
</script>

<form class="quick-add" onsubmit={submit} data-testid="quick-add" novalidate>
  <h2 class="title">{t.title}</h2>

  <div class="input-well">
    <label class="sr-only" for="qa-title">{t.inputLabel}</label>
    <input
      bind:this={inputEl}
      bind:value={text}
      id="qa-title"
      type="text"
      class="input"
      dir={textDir(text || t.placeholder)}
      placeholder={t.placeholder}
      autocomplete="off"
      enterkeyhint="done"
      maxlength={200}
      data-autofocus
    />
  </div>

  {#if parsed.matches.length > 0}
    <ul class="tokens" aria-label={t.parsedLabel}>
      {#each parsed.matches as m (m.key)}
        <li class:overridden={overridden(m)} title={overridden(m) ? t.overridden : undefined}>
          <Chip
            kind="token"
            label={m.label}
            icon={chipIcon(m)}
            onremove={() => dismiss(m)}
            removeLabel={t.dismissChip(m.label)}
            data-key={m.key}
            data-hard={m.hard ? 'true' : undefined}
          />
        </li>
      {/each}
    </ul>
  {:else if text === ''}
    <p class="hint">{t.hint}</p>
  {/if}

  <div class="pickers" role="group" aria-label={t.pickers}>
    <PickerChip
      label={t.who}
      value={ownerText}
      icon={Users}
      userText
      aria-expanded={openPicker === 'owner'}
      onclick={() => toggle('owner')}
      onclear={() => clearField('owner')}
      data-picker="owner"
    />
    <PickerChip
      label={td.when}
      value={whenText}
      icon={CalendarDays}
      aria-expanded={openPicker === 'when'}
      onclick={() => toggle('when')}
      onclear={() => clearField('when')}
      data-picker="when"
    />
    <PickerChip
      label={td.priority}
      value={priority === 'normal' ? null : PRIORITY_LABELS[priority]}
      icon={Flag}
      aria-expanded={openPicker === 'priority'}
      onclick={() => toggle('priority')}
      onclear={() => clearField('priority')}
      data-picker="priority"
    />
    <PickerChip
      label={td.category}
      value={categoryId ? categoryShort(categoryId) : null}
      icon={categoryId ? categoryIcon(categoryId) : Tag}
      aria-expanded={openPicker === 'category'}
      onclick={() => toggle('category')}
      onclear={() => clearField('category')}
      data-picker="category"
    />
    <PickerChip
      label={td.recurrence}
      value={recurrence ? RECURRENCE_LABELS[recurrence] : null}
      icon={Repeat}
      aria-expanded={openPicker === 'recurrence'}
      onclick={() => toggle('recurrence')}
      onclear={() => clearField('recurrence')}
      data-picker="recurrence"
    />
  </div>

  {#if openPicker}
    <div class="panel" data-panel={openPicker}>
      {#if openPicker === 'owner'}
        <OwnerPicker
          value={picks.owner === undefined ? null : picks.owner}
          members={household.members}
          meUid={household.uid}
          label={t.who}
          onChange={(uid) => choose({ owner: uid })}
        />
      {:else if openPicker === 'when'}
        <WhenPicker value={plan} {today} onChange={(v) => choose({ plan: v })} />
      {:else if openPicker === 'priority'}
        <PriorityPicker value={priority} onChange={(p) => choose({ priority: p })} />
      {:else if openPicker === 'category'}
        <CategoryPicker value={categoryId} onChange={(c) => choose({ categoryId: c })} />
      {:else if openPicker === 'recurrence'}
        <RecurrencePicker value={recurrence} onChange={(f) => choose({ recurrence: f })} />
      {/if}
    </div>
  {/if}

  <div class="footer">
    <p class="flash" role="status" aria-live="polite">
      {#if flash}
        <span class="flash-in">
          <span>{t.added}</span>
          <span class="flash-title" dir={textDir(flash)}>{flash}</span>
        </span>
      {/if}
    </p>
    <Button type="submit" size="lg" block disabled={!title}>{t.add}</Button>
  </div>
</form>

<style>
  .quick-add {
    display: grid;
    gap: var(--s4);
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

  .input-well {
    border-radius: var(--r-lg);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: box-shadow var(--d-base) var(--ease-out);
  }

  .input-well:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--accent),
      0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .input {
    inline-size: 100%;
    min-block-size: 60px;
    padding-inline: var(--s4);
    border: 0;
    background: transparent;
    color: var(--ink);
    font: var(--font-headline);
    font-weight: 500;
    outline: none;
  }

  .input::placeholder {
    color: var(--placeholder);
    font-weight: 400;
  }

  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s1) var(--s2);
    margin: calc(var(--s2) * -1) 0 0;
    padding: 0;
    list-style: none;
  }

  .tokens li {
    transition: opacity var(--d-base) var(--ease-out);
  }

  .tokens li.overridden {
    opacity: 0.45;
    text-decoration: line-through;
  }

  .hint {
    margin-block-start: calc(var(--s2) * -1);
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .pickers {
    display: flex;
    gap: var(--s2);
    margin-inline: calc(var(--screen-pad) * -1);
    padding-inline: var(--screen-pad);
    overflow-x: auto;
    scrollbar-width: none;
    scroll-padding-inline: var(--screen-pad);
  }

  .pickers::-webkit-scrollbar {
    display: none;
  }

  .pickers > :global(*) {
    flex: none;
  }

  .panel {
    padding: var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface-2);
    animation: panel-in var(--d-base) var(--ease-out);
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation-duration: 1ms;
    }
  }

  .footer {
    display: grid;
    gap: var(--s2);
  }

  .flash {
    min-block-size: 1.5rem;
    font: var(--font-callout);
    color: var(--sage-ink);
    text-align: center;
  }

  .flash-in {
    display: inline-flex;
    align-items: center;
    gap: var(--s1-5);
    max-inline-size: 100%;
    animation: panel-in var(--d-base) var(--ease-out);
  }

  .flash-title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-2);
  }
</style>
