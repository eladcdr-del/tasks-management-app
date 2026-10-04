<script lang="ts">
  /*
   * TaskCard (step 3.2): one open task, everywhere tasks are listed.
   *
   *   leading   CompletionCircle: the check animates, then (~300ms) the complete sheet opens
   *   body      "דני ביקש ממך" line · title (2 lines, textDir) · meta row (status first, then the
   *             quiet context: age, snoozes, plan hint, category)
   *   trailing  the owner's Avatar, or the dashed "?" when nobody took it yet
   *   pending   a micro-dot while the task has unsynced local writes
   *
   * The whole card opens #/task/:id (a stretched link on the title); the circle and `actions` sit
   * above that layer. Swipe toward inline-end = "בוצע" (complete sheet), toward inline-start =
   * "דחייה" (snooze sheet). The swipe is horizontal-only (touch-action: pan-y keeps vertical
   * scrolling native), springs back, and is instant under reduced motion. TaskDetail offers the
   * same actions without a gesture.
   */
  import type { Snippet } from 'svelte';
  import { Spring } from 'svelte/motion';
  import Check from '@lucide/svelte/icons/check';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import Repeat from '@lucide/svelte/icons/repeat';
  import { Avatar, Badge, CompletionCircle, categoryIcon } from '$components/ui';
  import type { Task } from '$lib/domain/types';
  import { ageDays } from '$lib/domain/age';
  import { categoryShort } from '$lib/domain/categories';
  import { ageLabel, planHint, snoozedLabel, whenChip, RECURRENCE_LABELS } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { href } from '$lib/router/routes';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { clock } from '$lib/state/clock.svelte';
  import { haptic } from '$lib/platform/haptics';
  import { reducedMotion } from '$lib/platform/motion';
  import { openComplete, openSnooze } from './actions';
  import { armedAction, decideAxis, resist, revealing, threshold } from './swipe';

  interface Props {
    task: Task;
    /** De-emphasised (an unowned task inside a time list; it is highlighted in "waiting"). */
    muted?: boolean;
    /** Buttons under the meta row (take / request on unowned cards). */
    actions?: Snippet;
    /** Swipe gestures (default on). */
    swipe?: boolean;
  }

  let { task, muted = false, actions, swipe = true }: Props = $props();

  const t = he.taskCard;
  const today = $derived(clock.today);
  const me = $derived(household.uid);
  const owner = $derived(household.memberById(task.ownerId));
  const requester = $derived(household.memberById(task.requestedBy));

  const chip = $derived(whenChip(task, today, clock.wall));
  const chipKind = $derived(
    chip?.tone === 'late' ? 'overdue' : task.hardDeadline && task.dueDate ? 'deadline' : 'due'
  );
  const age = $derived(ageDays(task, clock.nowMs) >= 7 ? ageLabel(task, clock.nowMs) : '');
  const snoozed = $derived(task.snoozeCount >= 2 ? snoozedLabel(task.snoozeCount) : '');
  const hint = $derived.by(() => {
    const h = planHint(task, today);
    return h && !chip?.text.includes(h) ? h : '';
  });
  const requestLine = $derived.by(() => {
    if (!task.requestedBy || !task.ownerId) return '';
    if (task.ownerId === me && task.requestedBy !== me && requester)
      return t.requestedOfMe(requester);
    if (task.requestedBy === me && task.ownerId !== me && owner)
      return t.iRequested(owner.displayName);
    return '';
  });

  // ── Completion: let the check be seen, then open the sheet; uncheck if it closes unfinished ──
  let checked = $state(false);
  let sheetSeen = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onCheck(v: boolean) {
    clearTimeout(timer);
    if (!v) return;
    timer = setTimeout(() => openComplete(task.id), reducedMotion.current ? 120 : 300);
  }

  $effect(() => {
    const s = router.sheet;
    if (!checked) return;
    if (s?.name === 'complete' && s.taskId === task.id) sheetSeen = true;
    else if (sheetSeen && s === null) {
      sheetSeen = false;
      checked = false;
    }
  });

  $effect(() => () => clearTimeout(timer));

  // ── Swipe ───────────────────────────────────────────────────────────────────
  let cardEl: HTMLElement | undefined = $state();
  const offset = new Spring(0, { stiffness: 0.2, damping: 0.72 });
  let rtl = $state(true);
  let limit = 96;
  let drag: { id: number; x: number; y: number; claimed: boolean } | null = null;
  let armed: 'done' | 'snooze' | null = $state(null);
  let swiping = $state(false);

  const side = $derived(revealing(offset.current, rtl));

  function onpointerdown(e: PointerEvent) {
    if (!swipe || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-swipe], .cc, .actions')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, claimed: false };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.claimed) {
      const axis = decideAxis(dx, dy);
      if (axis === 'pending') return;
      if (axis === 'vertical') {
        drag = null; // the page scrolls; this gesture is not ours
        return;
      }
      drag.claimed = true;
      swiping = true;
      if (cardEl) {
        rtl = getComputedStyle(cardEl).direction === 'rtl';
        limit = threshold(cardEl.offsetWidth);
        cardEl.setPointerCapture(e.pointerId);
      }
    }
    e.preventDefault();
    offset.set(resist(dx, limit), { instant: true });
    const next = armedAction(dx, rtl, limit);
    if (next !== armed) {
      armed = next;
      if (next) haptic('select');
    }
  }

  function swallowClick() {
    const stop = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
  }

  function endDrag(e: PointerEvent, cancelled: boolean) {
    if (!drag || e.pointerId !== drag.id) return;
    const claimed = drag.claimed;
    drag = null;
    if (!claimed) return;
    swallowClick();
    const action = cancelled ? null : armed;
    armed = null;
    swiping = false;
    if (reducedMotion.current) offset.set(0, { instant: true });
    else offset.set(0).catch(() => {});
    if (action === 'done') {
      haptic('complete');
      openComplete(task.id);
    } else if (action === 'snooze') {
      haptic('take');
      openSnooze(task.id);
    }
  }
</script>

<div
  class={['swipe', { muted, swiping }]}
  data-task-id={task.id}
  data-owner={task.ownerId ?? ''}
  data-muted={muted ? '' : undefined}
>
  {#if swipe && side}
    <div class={['under', side, { armed: armed === side }]} aria-hidden="true">
      <span class="under-label">
        {#if side === 'done'}
          <Check size={20} strokeWidth={2.25} />{t.swipe.done}
        {:else}
          <AlarmClock size={20} strokeWidth={2} />{t.swipe.snooze}
        {/if}
      </span>
    </div>
  {/if}

  <article
    bind:this={cardEl}
    class="card"
    style:translate={offset.current ? `${offset.current}px 0` : undefined}
    {onpointerdown}
    {onpointermove}
    onpointerup={(e) => endDrag(e, false)}
    onpointercancel={(e) => endDrag(e, true)}
  >
    <CompletionCircle label={task.title} bind:checked onchange={onCheck} />
    <div class="body">
      {#if requestLine}
        <p class="requested">
          <HandHelping class="req-icon" strokeWidth={1.75} aria-hidden="true" />{requestLine}
        </p>
      {/if}
      <a
        class="title"
        href={href('task', { id: task.id })}
        dir={textDir(task.title)}
        draggable="false">{task.title}</a
      >
      <div class="meta">
        {#if task.priority === 'urgent'}
          <Badge kind="urgent" label={t.urgent} />
        {/if}
        {#if chip}
          <Badge kind={chipKind} label={chip.text} data-when={chip.tone} />
        {/if}
        {#if task.priority === 'high'}
          <Badge kind="neutral" tone="warn" label={t.high} />
        {/if}
        {#if hint}
          <Badge variant="plain" icon={null} label={hint} class="hint" />
        {/if}
        {#if age}
          <Badge kind="age" label={age} />
        {/if}
        {#if snoozed}
          <Badge kind="snooze" label={snoozed} data-snoozed />
        {/if}
        {#if task.categoryId}
          <Badge
            variant="plain"
            icon={categoryIcon(task.categoryId)}
            label={categoryShort(task.categoryId)}
          />
        {/if}
        {#if task.recurrence}
          <Badge variant="plain" icon={Repeat} label={RECURRENCE_LABELS[task.recurrence.freq]} />
        {/if}
      </div>
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </div>
    <div class="trail">
      {#if owner}
        <Avatar
          name={owner.displayName}
          photoURL={owner.photoURL}
          color={owner.color}
          size="sm"
          label={t.owner(owner.displayName)}
        />
      {:else}
        <Avatar unassigned size="sm" />
      {/if}
    </div>
    {#if task.pending}
      <span class="pending" title={t.pending}><span class="visually-hidden">{t.pending}</span></span
      >
    {/if}
  </article>
</div>

<style>
  .swipe {
    position: relative;
    border-radius: var(--r-lg);
    isolation: isolate;
  }

  .card {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2px;
    padding-block: var(--s2);
    padding-inline: 6px 14px;
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    touch-action: pan-y;
    transition:
      background-color var(--d-base) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out);
  }

  .swiping .card {
    box-shadow: var(--sh-2);
    user-select: none;
  }

  /* Unowned task inside a time list: present, but quieter than the owned work around it. */
  .muted .card {
    background: color-mix(in srgb, var(--surface) 55%, var(--bg));
    box-shadow: none;
    outline: 1px dashed var(--line);
    outline-offset: -1px;
  }

  .muted .title {
    color: var(--ink-2);
    font-weight: 400;
  }

  .card > :global(.cc) {
    position: relative;
    z-index: 1;
  }

  .body {
    display: grid;
    gap: 6px;
    flex: 1;
    min-inline-size: 0;
    padding-block: 10px 6px;
    padding-inline-start: 2px;
  }

  .requested {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: var(--font-caption);
    color: var(--accent-ink);
  }

  .requested :global(.req-icon) {
    inline-size: 1.05em;
    block-size: 1.05em;
    flex: none;
  }

  .title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
    color: var(--ink);
    text-align: start;
    text-decoration: none;
    text-wrap: pretty;
    -webkit-tap-highlight-color: transparent;
  }

  /* The whole card opens the task; the circle and the action buttons sit above this layer. */
  .title::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .title:focus-visible {
    outline: none;
  }

  .title:focus-visible::after {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }

  .meta :global(.hint) {
    color: var(--ink-2);
  }

  .actions {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
    margin-block-start: var(--s2);
  }

  .trail {
    flex: none;
    padding-block-start: 8px;
  }

  .pending {
    position: absolute;
    inset-block-start: 10px;
    inset-inline-end: 10px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-pill);
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--surface);
  }

  /* ── What the swipe reveals ── */
  .under {
    position: absolute;
    inset: 1px;
    z-index: -1;
    display: flex;
    align-items: center;
    padding-inline: var(--s5);
    border-radius: var(--r-lg);
    font: var(--font-callout);
    font-weight: 600;
    transition:
      background-color var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }

  /* The card moves toward inline-end for "done", so the label shows at inline-start. */
  .under.done {
    justify-content: flex-start;
    background: color-mix(in srgb, var(--sage) 28%, var(--surface-2));
    color: var(--sage-ink);
  }

  .under.snooze {
    justify-content: flex-end;
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .under.done.armed {
    background: var(--sage-ink);
    color: var(--surface);
  }

  .under.snooze.armed {
    background: var(--ink-2);
    color: var(--surface);
  }

  .under-label {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
  }

  .armed .under-label {
    animation: nudge var(--d-base) var(--ease-out);
  }

  @keyframes nudge {
    50% {
      scale: 1.12;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .armed .under-label {
      animation: none;
    }
  }
</style>
