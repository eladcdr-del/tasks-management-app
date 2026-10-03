<script lang="ts">
  /*
   * BottomSheet: presentation only. It never touches the router.
   *
   *   <BottomSheet open={!!spec} onClose={() => router.closeSheet()} onClosed={() => (shown = null)}
   *                title="דחייה">
   *     …content…   {#snippet footer()}<Button block size="lg">שמירה</Button>{/snippet}
   *   </BottomSheet>
   *
   * Intended wiring (SheetHost, step 3.1):
   *   - `open` = `router.sheet !== null`. Keep the last SheetSpec in local state and clear it in
   *     `onClosed`, so the content stays rendered while the sheet animates out.
   *   - `onClose` = `router.closeSheet()`. It fires on Escape, scrim tap, the × button and
   *     drag-to-dismiss. The Android back button pops the sheet's history entry; the router then
   *     sets `router.sheet = null`, which flips `open` and runs the same exit animation.
   *
   * Behaviour:
   *   - Native <dialog>.showModal(): top layer, everything behind is inert. Tab is wrapped inside
   *     the panel; focus goes to `[data-autofocus]` (else the title) and returns to the opener.
   *   - Springs up (Svelte Spring, stiffness .18 / damping .75); reduced motion → 120ms crossfade.
   *   - Drag the handle/header (or the whole panel when its content doesn't scroll) to move it.
   *     Release fast downwards (> 0.8 px/ms) or past half its height to dismiss; otherwise it
   *     settles on the nearest snap point (velocity-projected).
   *   - `snapPoints` are fractions of the viewport height, e.g. [0.5, 0.92]. Without them the sheet
   *     fits its content, up to the viewport minus a peek; content scrolls inside.
   *   - Safe-area bottom padding is built in. Mark any element `data-no-drag` to opt it out.
   */
  import type { Snippet } from 'svelte';
  import { flushSync, tick, untrack } from 'svelte';
  import { Spring } from 'svelte/motion';
  import X from '@lucide/svelte/icons/x';
  import IconButton from './IconButton.svelte';
  import { he } from '$lib/i18n/he';
  import { reducedMotion, SHEET_SPRING, REDUCED_MAX } from '$lib/platform/motion';
  import { focusInitial, lockScroll, wrapTab } from './focus';

  interface Props {
    open: boolean;
    /** The user asked to close (Escape, scrim, ×, drag). Set `open` to false in response. */
    onClose: () => void;
    /** The exit animation finished and the dialog is gone. */
    onClosed?: () => void;
    /** Visible heading; also the dialog's accessible name. */
    title?: string;
    /** Accessible name when there is no visible title. */
    label?: string;
    /** Visible heights as fractions of the viewport, ascending: [0.5, 0.92]. */
    snapPoints?: number[];
    /** Index into snapPoints to open at (default 0). */
    initialSnap?: number;
    /** When false, Escape/scrim/drag cannot dismiss (e.g. while saving). */
    dismissible?: boolean;
    /** Show the × button in the header (default true). */
    showClose?: boolean;
    /** 'inline' renders the bare panel in the page flow (gallery/docs only). */
    presentation?: 'modal' | 'inline';
    /** Replaces the title row. */
    header?: Snippet;
    /** Sticky action area pinned to the bottom (above the safe area). */
    footer?: Snippet;
    children: Snippet;
    class?: string;
  }

  let {
    open,
    onClose,
    onClosed,
    title,
    label,
    snapPoints,
    initialSnap = 0,
    dismissible = true,
    showClose = true,
    presentation = 'modal',
    header,
    footer,
    children,
    class: className
  }: Props = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;

  let dialogEl: HTMLDialogElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();
  let bodyEl: HTMLDivElement | undefined = $state();
  let headingEl: HTMLHeadingElement | undefined = $state();

  let visible = $state(false); // the <dialog> is showing
  let shown = $state(false); // reduced-motion crossfade target
  let dragging = $state(false);
  let panelH = $state(0);
  let vh = $state(typeof window === 'undefined' ? 800 : window.innerHeight);
  let bodyScrollable = $state(false);
  let snapIndex = $state(0);

  const offset = new Spring(0, { ...SHEET_SPRING, precision: 0.5 });

  const heights = $derived(
    snapPoints && snapPoints.length > 0
      ? snapPoints.map((f) => Math.round(Math.min(Math.max(f, 0.1), 1) * vh))
      : null
  );
  const fixedHeight = $derived(heights ? Math.max(...heights) : null);
  /** Full panel height: the top snap, or the measured content height. */
  const fullH = $derived(fixedHeight ?? panelH);
  /**
   * The sheet's position is one number, `offset` = how far below "fully up" it is.
   * Offsets per snap (0 = fully up); the first snap is the lowest.
   */
  const offsets = $derived(heights ? heights.map((h) => Math.max(0, fullH - h)) : [0]);
  const restOffset = $derived(offsets[0] ?? 0);
  const minOffset = $derived(Math.min(...offsets));
  const closedOffset = $derived(fullH + 48);
  /*
   * Snap sheets: between snaps the panel is RESIZED to the visible height (so the footer stays
   * on screen and the content scrolls within what is visible); below the lowest snap (dismiss
   * drag, exit) it keeps that height and slides. Content-height sheets only slide.
   */
  const panelBlockSize = $derived(
    fixedHeight === null ? undefined : `${fixedHeight - Math.min(offset.current, restOffset)}px`
  );
  const panelShift = $derived(
    fixedHeight === null ? offset.current : Math.max(0, offset.current - restOffset)
  );

  const scrimOpacity = $derived(
    reducedMotion.current
      ? shown
        ? 1
        : 0
      : Math.min(
          1,
          Math.max(0, (closedOffset - offset.current) / Math.max(1, closedOffset - restOffset))
        )
  );

  let releaseScroll: (() => void) | null = null;

  function measure() {
    if (panelEl) panelH = panelEl.offsetHeight;
    if (bodyEl) bodyScrollable = bodyEl.scrollHeight > bodyEl.clientHeight + 1;
  }

  async function show() {
    const d = dialogEl;
    if (!d || !panelEl) return;
    snapIndex = Math.min(Math.max(initialSnap, 0), Math.max(0, (snapPoints?.length ?? 1) - 1));
    // Park the panel off-screen before the dialog becomes visible (no first-frame flash).
    offset.set(window.innerHeight * 1.5, { instant: true });
    shown = false;
    vh = window.innerHeight;
    flushSync();
    if (!d.open) d.showModal();
    visible = true;
    releaseScroll ??= lockScroll();
    measure();
    focusInitial(panelEl, headingEl ?? panelEl);
    const target = offsets[snapIndex] ?? 0;
    if (reducedMotion.current) {
      offset.set(target, { instant: true });
      await tick();
      requestAnimationFrame(() => (shown = true));
    } else {
      offset.set(closedOffset, { instant: true });
      offset.set(target).catch(() => {});
    }
  }

  async function hide() {
    const d = dialogEl;
    if (!d) return;
    try {
      if (reducedMotion.current) {
        shown = false;
        await new Promise((r) => setTimeout(r, REDUCED_MAX));
      } else {
        await offset.set(closedOffset);
      }
    } catch {
      return; // re-opened mid-exit
    }
    if (open) return;
    finishClose();
  }

  function finishClose() {
    if (dialogEl?.open) dialogEl.close();
    visible = false;
    dragging = false;
    releaseScroll?.();
    releaseScroll = null;
    onClosed?.();
  }

  $effect(() => {
    if (presentation !== 'modal') return;
    const isOpen = open;
    untrack(() => {
      if (isOpen) void show();
      else if (visible) void hide();
    });
  });

  // Keep the panel measured (content changes, keyboard, rotation).
  $effect(() => {
    if (presentation !== 'modal' || !panelEl || !bodyEl) return;
    const ro = new ResizeObserver(() => {
      const before = panelH;
      measure();
      // Content sheets: re-seat when the content height changes while resting.
      if (fixedHeight === null && open && !dragging && before !== panelH) {
        offset.set(offsets[snapIndex] ?? 0, { instant: before === 0 }).catch(() => {});
      }
    });
    ro.observe(panelEl);
    const content = bodyEl.firstElementChild;
    if (content) ro.observe(content);
    const onResize = () => (vh = window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  });

  // Never leave the page scroll-locked if the component unmounts while open.
  $effect(() => () => {
    releaseScroll?.();
    releaseScroll = null;
  });

  function requestClose() {
    if (!dismissible) return;
    onClose();
    // If the parent declined (kept `open`), settle back on the current snap.
    queueMicrotask(() => {
      if (open && visible) offset.set(offsets[snapIndex] ?? 0).catch(() => {});
    });
  }

  function oncancel(e: Event) {
    e.preventDefault(); // we animate out ourselves
    requestClose();
  }

  function onNativeClose() {
    // The browser may force-close (e.g. repeated Escape). Keep our state honest.
    if (visible) {
      visible = false;
      releaseScroll?.();
      releaseScroll = null;
      if (open) onClose();
      onClosed?.();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (panelEl) wrapTab(e, panelEl);
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  interface DragStart {
    id: number;
    y: number;
    offset: number;
    claimed: boolean;
  }
  let drag: DragStart | null = null;
  let samples: { t: number; y: number }[] = [];

  function rubber(distance: number): number {
    // Diminishing resistance past the top snap.
    return 18 * Math.log1p(distance / 18);
  }

  function onpointerdown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Listeners sit on the <dialog>; only the panel is a drag surface (not the scrim).
    if (!panelEl?.contains(target) || target.closest('[data-no-drag]')) return;
    if (bodyEl?.contains(target)) {
      // Scrollable content keeps native scrolling; drag from the header instead.
      if (bodyScrollable) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    }
    drag = { id: e.pointerId, y: e.clientY, offset: offset.current, claimed: false };
    samples = [{ t: e.timeStamp, y: e.clientY }];
  }

  function onpointermove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.claimed) {
      if (Math.abs(dy) < 6) return;
      drag.claimed = true;
      dragging = true;
      panelEl?.setPointerCapture(e.pointerId);
    }
    let next = drag.offset + dy;
    if (next < minOffset) next = minOffset - rubber(minOffset - next);
    if (!dismissible && next > restOffset) next = restOffset + rubber(next - restOffset);
    offset.set(next, { instant: true });
    samples.push({ t: e.timeStamp, y: e.clientY });
    if (samples.length > 8) samples.shift();
  }

  function swallowNextClick() {
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
    dragging = false;
    if (!claimed) return;
    if (panelEl?.hasPointerCapture(e.pointerId)) panelEl.releasePointerCapture(e.pointerId);
    swallowNextClick();

    let velocity = 0; // px/ms, positive = downwards
    if (!cancelled) {
      const recent = samples.filter((s) => e.timeStamp - s.t <= 100);
      const first = recent[0] ?? samples[0];
      if (first && e.timeStamp > first.t)
        velocity = (e.clientY - first.y) / (e.timeStamp - first.t);
    }
    const projected = offset.current + velocity * 160;
    const pastHalf = projected > restOffset + (closedOffset - restOffset) * 0.5;
    if (dismissible && !cancelled && (velocity > 0.8 || pastHalf)) {
      requestClose();
      return;
    }
    let best = 0;
    offsets.forEach((o, i) => {
      if (Math.abs(o - projected) < Math.abs((offsets[best] ?? 0) - projected)) best = i;
    });
    snapIndex = best;
    offset.set(offsets[best] ?? 0).catch(() => {});
  }
</script>

{#snippet panelInner(inline: boolean)}
  <div class="grab" aria-hidden="true"><span class="handle"></span></div>
  {#if header}
    <div class="head custom">{@render header()}</div>
  {:else if title || (showClose && !inline)}
    <div class="head">
      {#if title}
        <h2 bind:this={headingEl} id={titleId} class="title" tabindex="-1">{title}</h2>
      {/if}
      {#if showClose}
        <IconButton
          label={he.common.close}
          icon={X}
          variant="tonal"
          size="sm"
          class="close"
          data-no-drag
          onclick={requestClose}
        />
      {/if}
    </div>
  {/if}
  <div class={['body', { 'drag-all': !bodyScrollable && !inline }]} bind:this={bodyEl}>
    <div class="content">{@render children()}</div>
  </div>
  {#if footer}
    <div class="foot">{@render footer()}</div>
  {/if}
{/snippet}

{#if presentation === 'inline'}
  <div
    class={['panel', 'inline', { 'no-foot': !footer }, className]}
    role="group"
    aria-labelledby={title ? titleId : undefined}
    aria-label={title ? undefined : label}
  >
    {@render panelInner(true)}
  </div>
{:else}
  <dialog
    bind:this={dialogEl}
    class={['sheet', { rm: reducedMotion.current, shown, dragging }]}
    aria-labelledby={title ? titleId : undefined}
    aria-label={title ? undefined : label}
    {oncancel}
    onclose={onNativeClose}
    {onkeydown}
    {onpointerdown}
    {onpointermove}
    onpointerup={(e) => endDrag(e, false)}
    onpointercancel={(e) => endDrag(e, true)}
  >
    {#if visible || open}
      <button
        type="button"
        class="scrim"
        tabindex="-1"
        aria-label={he.common.close}
        style:opacity={scrimOpacity}
        onclick={requestClose}
      ></button>
    {/if}
    <div
      bind:this={panelEl}
      class={['panel', { 'no-foot': !footer }, className]}
      style:block-size={panelBlockSize}
      style:transform="translate3d(0, {panelShift}px, 0)"
    >
      {#if visible || open}
        {@render panelInner(false)}
      {/if}
    </div>
  </dialog>
{/if}

<style>
  /* ── Dialog shell: full-viewport, transparent; our own scrim animates with the drag. ── */
  .sheet {
    position: fixed;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .sheet:not([open]) {
    display: none;
  }

  .sheet::backdrop {
    background: transparent;
  }

  .scrim {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    background: var(--scrim);
    cursor: default;
    touch-action: none;
  }

  .scrim:focus-visible {
    outline: none;
  }

  /* ── Panel ── */
  .panel {
    --sheet-pad: var(--screen-pad);
    position: absolute;
    inset-block-end: 0;
    inset-inline: 0;
    display: flex;
    flex-direction: column;
    max-inline-size: var(--content-max);
    max-block-size: calc(100dvh - var(--safe-top) - var(--s6));
    margin-inline: auto;
    border-start-start-radius: var(--r-xl);
    border-start-end-radius: var(--r-xl);
    background: var(--surface);
    border: var(--edge);
    border-block-end: 0;
    box-shadow: var(--sh-sheet);
    will-change: transform;
    outline: none;
  }

  /* Background continues below the panel, so an upward rubber-band never shows a gap. */
  .panel:not(.inline)::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block-start: 100%;
    block-size: 120px;
    background: var(--surface);
  }

  .inline {
    position: relative;
    max-block-size: none;
    box-shadow: var(--sh-2);
    border-radius: var(--r-xl);
    border-block-end: var(--edge);
    overflow: hidden;
  }

  .grab {
    display: grid;
    place-items: center;
    flex: none;
    block-size: 22px;
    touch-action: none;
    cursor: grab;
  }

  .dragging .grab {
    cursor: grabbing;
  }

  .handle {
    inline-size: 36px;
    block-size: 5px;
    border-radius: var(--r-pill);
    background: color-mix(in oklab, var(--ink-3) 45%, transparent);
    transition:
      background-color var(--d-fast) var(--ease-out),
      inline-size var(--d-base) var(--ease-out);
  }

  .dragging .handle {
    inline-size: 44px;
    background: color-mix(in oklab, var(--ink-3) 75%, transparent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--s3);
    flex: none;
    min-block-size: 44px;
    padding-inline: var(--sheet-pad) calc(var(--sheet-pad) - 6px);
    padding-block-end: var(--s2);
    touch-action: none;
  }

  .head.custom {
    display: block;
    padding-inline: var(--sheet-pad);
  }

  .title {
    flex: 1;
    min-inline-size: 0;
    font: var(--font-title);
    color: var(--ink);
    outline: none;
  }

  .head :global(.close) {
    margin-inline-start: auto;
  }

  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .drag-all {
    touch-action: none;
  }

  .content {
    padding-inline: var(--sheet-pad);
    padding-block: var(--s2) var(--s5);
  }

  .no-foot .content {
    padding-block-end: calc(var(--s6) + var(--safe-bottom));
  }

  .inline .content {
    padding-block-end: var(--s6);
  }

  .foot {
    flex: none;
    padding-inline: var(--sheet-pad);
    padding-block: var(--s3) calc(var(--s4) + var(--safe-bottom));
    background: var(--surface);
    border-block-start: 1px solid var(--line);
  }

  .inline .foot {
    padding-block-end: var(--s4);
  }

  /* Reduced motion: no travel, a short crossfade. */
  .rm .panel,
  .rm .scrim {
    transition: opacity var(--d-fast) linear;
  }

  .rm:not(.shown) .panel {
    opacity: 0;
  }
</style>
