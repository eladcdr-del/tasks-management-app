<script lang="ts">
  /*
   * Seat: the end of a task's row, where the row answers "who does it?" (the design the family
   * picked, "מקום פנוי").
   *
   *   owned     the owner's avatar
   *   free      an empty seat: a dashed circle with "+" in accent ink and "לקחת" under it. A tap
   *             opens "מי לוקח?": "אני" (takes it) first, then "לבקש מ<name>" for every other
   *             member in the household's order (the request goes out at once). Nobody is ranked,
   *             highlighted or suggested. Alone in the household there is nobody to ask: the tap
   *             takes it at once.
   *   waiting   a request waits for someone's answer: a faded dashed ring with their initial and
   *             "מחכה לדני" under it. The menu offers taking it, asking someone else instead, and
   *             "ביטול הבקשה" to the one who asked
   *   askedMe   a request that waits for MY answer: nothing here (the row answers it with
   *             "אני לוקחת" / "לא מתאים לי")
   *
   * When a free task becomes someone's (my tap, or another phone), the seat turns into their avatar
   * with a small spring and the dashed ring breathing out; under reduced motion it simply fades.
   * `interactive` off (Home's selection mode): the same picture, nothing to tap.
   */
  import { untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import { Avatar } from '$components/ui';
  import { isFree } from '$lib/domain/homeList';
  import { pendingRequestOf } from '$lib/domain/requests';
  import type { Member, Task } from '$lib/domain/types';
  import { he } from '$lib/i18n/he';
  import { household } from '$lib/state/household.svelte';
  import { askFor, takeTask, withdrawRequest } from './actions';
  import SeatMenu, { type SeatMenuItem } from './SeatMenu.svelte';

  interface Props {
    task: Task;
    /** Off: a picture only (selection mode). */
    interactive?: boolean;
  }

  let { task, interactive = true }: Props = $props();
  const t = he.taskCard;
  const uid = $props.id();

  type State =
    | { kind: 'owned'; owner: Member | null }
    | { kind: 'free' }
    | { kind: 'waiting'; asked: Member; iAsked: boolean }
    | { kind: 'askedMe' };

  const me = $derived(household.me);
  const others = $derived(household.members.filter((m) => m.uid !== household.uid));

  const seat = $derived.by((): State => {
    const ids = household.memberIds;
    if (!isFree(task, ids)) return { kind: 'owned', owner: household.memberById(task.ownerId) };
    const to = pendingRequestOf(task, ids);
    if (to !== null && to === household.uid) return { kind: 'askedMe' };
    const asked = household.memberById(to);
    if (asked) return { kind: 'waiting', asked, iAsked: task.requestedBy === household.uid };
    return { kind: 'free' };
  });

  /** Who holds it (null while nobody does): a change from nobody to someone plays the arrival. */
  const holder = $derived(seat.kind === 'owned' ? task.ownerId : null);
  let arrivals = $state(0);
  let lastHolder: string | null | undefined;
  $effect(() => {
    const h = holder;
    untrack(() => {
      if (lastHolder === null && h !== null) arrivals++;
      lastHolder = h;
    });
  });

  /** The first letter of a name (Hebrew, Latin or an emoji alike). */
  function initialOf(name: string): string {
    const first = new Intl.Segmenter('he', { granularity: 'grapheme' })
      .segment(name.trim())
      [Symbol.iterator]()
      .next().value?.segment;
    return (first ?? '').toLocaleUpperCase('he');
  }

  // ── The menu ─────────────────────────────────────────────────────────────────
  let open = $state(false);
  let seatEl: HTMLButtonElement | undefined = $state();

  const items = $derived.by((): SeatMenuItem[] => {
    if (!me) return [];
    if (seat.kind === 'free') {
      return [
        { key: 'take', label: t.seatMenu.me, person: me },
        ...others.map((m) => ({
          key: `ask:${m.uid}`,
          label: t.seatMenu.ask(m.displayName),
          person: m
        }))
      ];
    }
    if (seat.kind === 'waiting') {
      const list: SeatMenuItem[] = [
        { key: 'take', label: t.take(me), person: me },
        ...others
          .filter((m) => m.uid !== seat.asked.uid)
          .map((m) => ({ key: `ask:${m.uid}`, label: t.seatMenu.ask(m.displayName), person: m }))
      ];
      if (seat.iAsked) list.push({ key: 'cancel', label: t.seatMenu.cancel, icon: X, apart: true });
      return list;
    }
    return [];
  });

  const menuTitle = $derived.by(() => {
    if (seat.kind !== 'waiting') return t.seatMenu.title;
    if (seat.iAsked) return t.iRequested(seat.asked.displayName);
    const by = household.memberById(task.requestedBy);
    return by ? t.requestedBetween(by, seat.asked.displayName) : t.seatMenu.title;
  });

  /** Free and alone: nobody to ask, so the seat takes the task at once. */
  const direct = $derived(seat.kind === 'free' && others.length === 0);

  function onSeat() {
    if (direct) {
      void takeTask(task.id);
      return;
    }
    open = !open;
  }

  function pick(key: string) {
    const kind = seat.kind;
    if (key === 'take') void takeTask(task.id);
    else if (key === 'cancel') withdrawRequest(task.id);
    else if (key.startsWith('ask:')) {
      const member = household.memberById(key.slice(4));
      if (member) askFor(task.id, member, kind === 'free');
    }
  }

  function closed(focusSeat: boolean) {
    open = false;
    if (focusSeat) seatEl?.focus({ preventScroll: true });
  }

  // Selection mode, or the task changed under the menu (taken on another phone): close it.
  $effect(() => {
    if (!interactive || (seat.kind !== 'free' && seat.kind !== 'waiting')) open = false;
  });
</script>

{#if seat.kind === 'owned'}
  {#key arrivals}
    <span class={['seat', 'owned', { arrive: arrivals > 0 }]} data-seat="owned">
      {#if arrivals > 0}<span class="ghost" aria-hidden="true"></span>{/if}
      {#if seat.owner}
        <Avatar
          name={seat.owner.displayName}
          photoURL={seat.owner.photoURL}
          color={seat.owner.color}
          size="sm"
          label={t.owner(seat.owner.displayName)}
        />
      {:else}
        <Avatar unassigned size="sm" />
      {/if}
    </span>
  {/key}
{:else if seat.kind === 'free' || seat.kind === 'waiting'}
  {@const waiting = seat.kind === 'waiting' ? seat : null}
  {@const caption = waiting ? t.seat.waiting(waiting.asked.displayName) : t.seat.free}
  {#snippet face()}
    {#if waiting}
      <span class="ring" data-member-color={waiting.asked.color} aria-hidden="true">
        <span class="initial">{initialOf(waiting.asked.displayName)}</span>
      </span>
    {:else}
      <span class="ring" aria-hidden="true"><Plus size={16} strokeWidth={2.4} /></span>
    {/if}
    <span class="cap" aria-hidden="true">{caption}</span>
  {/snippet}
  {#if interactive}
    <button
      bind:this={seatEl}
      type="button"
      class={['seat', 'tap', seat.kind, { open }]}
      data-seat={seat.kind}
      data-action="seat"
      aria-label={waiting
        ? t.seat.waitingLabel(waiting.asked.displayName, task.title)
        : t.seat.freeLabel(task.title)}
      aria-haspopup={direct ? undefined : 'menu'}
      aria-expanded={direct ? undefined : open}
      aria-controls={open ? `${uid}-menu` : undefined}
      onclick={onSeat}
    >
      {@render face()}
    </button>
    {#if open && seatEl}
      <SeatMenu
        id={`${uid}-menu`}
        anchor={seatEl}
        title={menuTitle}
        {items}
        onpick={pick}
        onclose={closed}
      />
    {/if}
  {:else}
    <span class={['seat', seat.kind]} data-seat={seat.kind}>{@render face()}</span>
  {/if}
{/if}

<style>
  /* One column for every row: the avatar, the empty seat and the waiting ring share it. */
  .seat {
    position: relative;
    display: inline-grid;
    justify-items: center;
    align-content: center;
    gap: 1px;
    inline-size: 48px;
    min-block-size: var(--tap-min);
    flex: none;
  }

  .tap {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .ring {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-pill);
    border: 1.75px dashed var(--hairline-strong);
    background: var(--bg);
    color: var(--accent-ink);
    transition:
      transform var(--d-fast) var(--ease-out),
      border-color var(--d-fast) var(--ease-out),
      background-color var(--d-fast) var(--ease-out);
  }

  .free .ring {
    border-color: color-mix(in oklab, var(--accent) 55%, var(--hairline-strong));
  }

  .cap {
    max-inline-size: 64px;
    overflow: hidden;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 0.875rem;
    color: var(--accent-ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* A request that waits: the asked member, faded, not yet theirs. */
  .waiting .ring {
    border-color: color-mix(in oklab, var(--m-base) 70%, transparent);
    background: color-mix(in oklab, var(--m-soft) 55%, var(--surface));
    color: var(--m-ink);
  }

  .waiting .initial {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    opacity: 0.72;
    transform: translateY(0.04em);
  }

  .waiting .cap {
    color: var(--ink-2);
    font-weight: 500;
  }

  .tap:active .ring,
  .tap.open .ring {
    transform: scale(0.92);
  }

  .tap.free:active .ring,
  .tap.free.open .ring {
    background: var(--accent-soft);
    border-style: solid;
  }

  @media (hover: hover) {
    .tap.free:hover .ring {
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--bg));
    }
  }

  .tap:focus-visible {
    outline: none;
  }

  .tap:focus-visible .ring {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ── Arrival: the empty seat becomes someone's ── */
  .arrive > :global(.avatar) {
    animation: seat-take 460ms var(--ease-spring) both;
  }

  .ghost {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: 32px;
    block-size: 32px;
    margin-block-start: -16px;
    margin-inline-start: -16px;
    border-radius: var(--r-pill);
    border: 1.75px dashed color-mix(in oklab, var(--accent) 60%, transparent);
    pointer-events: none;
    animation: seat-ghost 520ms var(--ease-out) both;
  }

  @keyframes seat-take {
    0% {
      opacity: 0;
      scale: 0.4;
      rotate: -25deg;
    }
    60% {
      opacity: 1;
    }
    100% {
      opacity: 1;
      scale: 1;
      rotate: 0deg;
    }
  }

  @keyframes seat-ghost {
    0% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
      scale: 1.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ring {
      transition: none;
    }

    .tap:active .ring,
    .tap.open .ring {
      transform: none;
    }

    .arrive > :global(.avatar) {
      animation: seat-fade 120ms linear both;
    }

    .ghost {
      display: none;
    }

    @keyframes seat-fade {
      from {
        opacity: 0;
      }
    }
  }
</style>
