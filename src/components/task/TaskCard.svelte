<script lang="ts">
  /*
   * TaskCard (step 3.2): one open task, everywhere tasks are listed.
   *
   *   leading   CompletionCircle: the check animates, then (~300ms) the complete sheet opens
   *   body      request line ("דני ביקש ממך" calls; "ביקשת מדני · מחכה לתשובה", "מיכל ביקשה מדני",
   *             "לבקשת מיכל" / "לבקשתך" are quiet) · title (2 lines, textDir) · meta row (status
   *             first, then the quiet context: plan hint, snoozes, age, category)
   *   trailing  `trailing` (e.g. Home's small "take" action), else the owner's Avatar, or the dashed
   *             "?" when nobody took it yet
   *   pending   a micro-dot while the task has unsynced local writes
   *
   * Two variants. `card` (default) is a raised card of its own. `row` is the compact line used in
   * Home's lists (TaskList variant="row" draws the surface and the hairlines between rows): the
   * meta row keeps to ONE line (badges that do not fit drop out, status badges come first) and the
   * trailing slot is centred.
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
  import { requestView, type RequestView } from '$lib/domain/requests';
  import { ageLabel, planHint, snoozedLabel, whenChip, recurrenceText } from '$lib/i18n/format';
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
    variant?: 'card' | 'row';
    /** De-emphasised card (variant card only). */
    muted?: boolean;
    /** Buttons under the meta row (answers to a request), given the task. */
    actions?: Snippet<[Task]>;
    /** Replaces the avatar at the inline end (a compact "take" action), given the task. */
    trailing?: Snippet<[Task]>;
    /** The category badge (off inside a group that already names the category). */
    showCategory?: boolean;
    /** Swipe gestures (default on). */
    swipe?: boolean;
  }

  let {
    task,
    variant = 'card',
    muted = false,
    actions,
    trailing,
    showCategory = true,
    swipe = true
  }: Props = $props();

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
  /**
   * The request, from where the viewer stands (domain/requests.ts). Waiting for my answer it calls
   * (accent); everything else is a quiet line. An accepted request shows only to its two people.
   */
  const request = $derived.by((): { kind: RequestView['kind']; text: string } => {
    const view = requestView(task, me, household.memberIds);
    const who = requester ?? { displayName: he.taskDetail.someone, addressAs: 'm' as const };
    const nameOf = (uid: string) => household.memberById(uid)?.displayName ?? he.taskDetail.someone;
    switch (view.kind) {
      case 'askedMe':
        return { kind: view.kind, text: t.requestedOfMe(who) };
      case 'iAsked':
        return { kind: view.kind, text: t.iRequestedWaiting(nameOf(view.to)) };
      case 'between':
        return { kind: view.kind, text: t.requestedBetween(who, nameOf(view.to)) };
      case 'accepted':
        if (view.owner === me) return { kind: view.kind, text: t.atRequestOf(nameOf(view.by)) };
        if (view.by === me) return { kind: view.kind, text: t.atMyRequest };
        return { kind: 'none', text: '' };
      default:
        return { kind: 'none', text: '' };
    }
  });

  /** A row keeps the request on its meta line (who asked first when it waits for my answer). */
  const inlineRequest = $derived(variant === 'row' && request.text !== '');

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
    if (target.closest('[data-no-swipe], .cc, .actions, .trail-actions')) return;
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

{#snippet requestMeta()}
  <span
    class={['requested', 'in-meta', { quiet: request.kind !== 'askedMe' }]}
    data-request={request.kind}
  >
    <HandHelping class="req-icon" strokeWidth={1.75} aria-hidden="true" />{request.text}
  </span>
{/snippet}

<div
  class={['swipe', { row: variant === 'row', muted: muted && variant === 'card', swiping }]}
  data-task-id={task.id}
  data-owner={task.ownerId ?? ''}
  data-variant={variant}
  data-muted={muted && variant === 'card' ? '' : undefined}
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
      {#if request.text && variant === 'card'}
        <p class={['requested', { quiet: request.kind !== 'askedMe' }]} data-request={request.kind}>
          <HandHelping class="req-icon" strokeWidth={1.75} aria-hidden="true" />{request.text}
        </p>
      {/if}
      <a
        class="title"
        href={href('task', { id: task.id })}
        dir={textDir(task.title)}
        draggable="false">{task.title}</a
      >
      <div class="meta">
        {#if inlineRequest && request.kind === 'askedMe'}{@render requestMeta()}{/if}
        {#if task.priority === 'urgent'}
          <Badge kind="urgent" label={t.urgent} />
        {/if}
        {#if chip}
          <Badge kind={chipKind} label={chip.text} data-when={chip.tone} />
        {/if}
        {#if task.priority === 'high'}
          <Badge kind="neutral" tone="warn" label={t.high} />
        {/if}
        {#if inlineRequest && request.kind !== 'askedMe'}{@render requestMeta()}{/if}
        {#if hint}
          <Badge variant="plain" icon={null} label={hint} class="hint" />
        {/if}
        {#if snoozed}
          <Badge kind="snooze" label={snoozed} data-snoozed />
        {/if}
        {#if age}
          <Badge kind="age" label={age} />
        {/if}
        {#if task.categoryId && showCategory}
          <Badge
            variant="plain"
            icon={categoryIcon(task.categoryId)}
            label={categoryShort(task.categoryId)}
          />
        {/if}
        {#if task.recurrence}
          <Badge variant="plain" icon={Repeat} label={recurrenceText(task.recurrence)} />
        {/if}
      </div>
      {#if actions}<div class="actions">{@render actions(task)}</div>{/if}
    </div>
    {#if trailing}
      <div class="trail trail-actions">{@render trailing(task)}</div>
    {:else}
      <div class="trail">
        {#if owner}
          <Avatar
            name={owner.displayName}
            photoURL={owner.photoURL}
            color={owner.color}
            size={variant === 'row' ? 'xs' : 'sm'}
            label={t.owner(owner.displayName)}
          />
        {:else}
          <Avatar unassigned size={variant === 'row' ? 'xs' : 'sm'} />
        {/if}
      </div>
    {/if}
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

  /* Not mine to answer: context, not a call. */
  .requested.quiet {
    color: var(--ink-2);
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

  .trail-actions {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
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

  /* ── Row: a compact line inside a list surface (TaskList variant="row") ── */
  .row,
  .row .card {
    border-radius: 0;
  }

  .row .card {
    align-items: center;
    gap: 0;
    min-block-size: 50px;
    padding-block: 0;
    padding-inline: var(--s1) var(--s3);
    background: var(--surface);
    border: 0;
    box-shadow: none;
  }

  .row .body {
    gap: 3px;
    padding-block: var(--s2);
    padding-inline: var(--s0-5) var(--s2);
  }

  .row .requested.in-meta {
    flex: none;
    white-space: nowrap;
  }

  .row .title {
    font-size: var(--fs-body);
    line-height: 1.375;
  }

  .row .title:focus-visible::after {
    outline-offset: -2px;
  }

  /* One line of meta: what does not fit wraps onto a second line that is clipped away whole. */
  .row .meta {
    gap: 14px var(--s2-5);
    max-block-size: 1.85em;
    overflow: hidden;
    font-size: var(--fs-caption);
  }

  .row .meta:empty {
    display: none;
  }

  .row .meta :global(.badge) {
    flex: none;
    white-space: nowrap;
  }

  /* Pills a little slimmer than on a card, so a dated row stays compact. */
  .row .meta :global(.badge:not(.plain)) {
    min-block-size: 1.62em;
    padding-block: 0;
  }

  .row .actions {
    margin-block-start: var(--s1-5);
  }

  .row .trail {
    align-self: center;
    padding-block: 0;
  }

  .row .pending {
    inset-block-start: var(--s2);
    inset-inline-end: var(--s2);
  }

  .row .under {
    inset: 0;
    border-radius: 0;
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
