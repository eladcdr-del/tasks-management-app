<script lang="ts" module>
  import type { AvatarPerson, IconComponent } from '$components/ui';

  /** One choice in the seat's menu. */
  export interface SeatMenuItem {
    key: string;
    label: string;
    /** An avatar at the start of the item (me, or the member to ask). */
    person?: AvatarPerson;
    /** Or an icon in a small well (e.g. withdrawing a request). */
    icon?: IconComponent;
    /** A hairline above this item (it is a different kind of choice). */
    apart?: boolean;
  }
</script>

<script lang="ts">
  /*
   * SeatMenu: the small menu the seat opens ("מי לוקח?"). Anchored to the seat (below it, or above
   * when there is no room), it scales and fades in from the seat and out again.
   *
   * It lives in the top layer (popover="manual"), so the list's rounded, clipped surface never cuts
   * it. It closes on a tap outside it (that tap does nothing else), Escape, Tab, the platform's close
   * request (Android back: watchClose), or a pick. role="menu" with role="menuitem" items, roving
   * focus (arrows, Home, End), focus on the first item when it opens and back on the seat when it
   * closes from inside.
   */
  import { Avatar } from '$components/ui';
  import { reducedMotion } from '$lib/platform/motion';
  import { watchClose } from './closeWatch';

  interface Props {
    id: string;
    /** The seat it hangs from (and that toggles it: taps on it are not "outside"). */
    anchor: HTMLElement;
    title: string;
    items: readonly SeatMenuItem[];
    onpick: (key: string) => void;
    /** It closed without a pick. `focusAnchor`: focus was inside, give it back to the seat. */
    onclose: (focusAnchor: boolean) => void;
  }

  let { id, anchor, title, items, onpick, onclose }: Props = $props();

  let menuEl: HTMLElement | undefined = $state();
  let pos = $state<{ top: number; left: number; origin: string } | null>(null);
  let leaving = $state(false);
  let done = false;

  const supportsPopover =
    typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

  /** Places the menu next to the seat, inside the visual viewport. */
  function place() {
    const el = menuEl;
    if (!el || !anchor?.isConnected) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const pad = 12;
    const gap = 6;
    const rtl = getComputedStyle(anchor).direction === 'rtl';
    // The seat sits at the row's inline end: the menu opens from it toward the row's text.
    let left = rtl ? a.left - 2 : a.right - w + 2;
    left = Math.max(pad, Math.min(left, vw - w - pad));
    const below = a.bottom + gap + h <= vh - pad || a.top - gap - h < pad;
    let top = below ? a.bottom + gap : a.top - gap - h;
    top = Math.max(pad, Math.min(top, vh - h - pad));
    const ox = Math.round(a.left + a.width / 2 - left);
    const oy = below ? Math.round(a.top + a.height / 2 - top) : Math.round(a.top - top);
    pos = { top: Math.round(top), left: Math.round(left), origin: `${ox}px ${oy}px` };
  }

  const itemsOf = () => [...(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  function focusItem(i: number) {
    const all = itemsOf();
    if (all.length === 0) return;
    const next = all[(i + all.length) % all.length];
    for (const el of all) el.tabIndex = el === next ? 0 : -1;
    next?.focus({ preventScroll: true });
  }

  /** Closes with the exit animation, then tells the parent. */
  function close(focusAnchor: boolean, then?: () => void) {
    if (done) return;
    done = true;
    stopWatching();
    const finish = () => {
      if (supportsPopover && menuEl?.matches(':popover-open')) menuEl.hidePopover();
      then?.();
      onclose(focusAnchor);
    };
    if (reducedMotion.current || !menuEl) finish();
    else {
      leaving = true;
      setTimeout(finish, 130);
    }
  }

  function pick(key: string) {
    if (done) return;
    // The action runs at once (haptics need the tap's activation); the menu then leaves.
    onpick(key);
    close(true);
  }

  let stopWatching: () => void = () => {};
  let swallowUntil = 0;

  $effect(() => {
    const el = menuEl;
    if (!el) return;
    if (supportsPopover) el.showPopover();
    place();
    focusItem(0);
    stopWatching = watchClose(() => close(true));

    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || el.contains(target) || anchor?.contains(target)) return;
      // A tap outside only closes the menu; it does not also open what was under it.
      swallowUntil = performance.now() + 600;
      close(false);
    };
    const onClick = (e: MouseEvent) => {
      if (performance.now() > swallowUntil) return;
      swallowUntil = 0;
      const target = e.target as Node | null;
      if (target && (el.contains(target) || anchor?.contains(target))) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onDown, true);
      // The click of the tap that closed the menu may still be on its way: keep swallowing it until
      // it passes, the next tap starts, or a moment has gone by.
      const disarm = () => {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('pointerdown', disarm, true);
      };
      document.addEventListener('pointerdown', disarm, true);
      setTimeout(disarm, 650);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
      stopWatching();
      if (supportsPopover && el.matches(':popover-open')) el.hidePopover();
    };
  });

  function onkeydown(e: KeyboardEvent) {
    const all = itemsOf();
    const at = all.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(at + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(at - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(all.length - 1);
        break;
      case 'Tab':
        // Focus moves on to what follows the seat; the menu steps aside.
        close(false);
        break;
    }
  }
</script>

<div
  bind:this={menuEl}
  {id}
  class={['menu', { placed: pos !== null, leaving, fallback: !supportsPopover }]}
  popover={supportsPopover ? 'manual' : undefined}
  role="menu"
  tabindex="-1"
  aria-labelledby="{id}-title"
  data-seat-menu
  style:top={pos ? `${pos.top}px` : undefined}
  style:left={pos ? `${pos.left}px` : undefined}
  style:transform-origin={pos?.origin}
  {onkeydown}
>
  <p class="title" id="{id}-title">{title}</p>
  {#each items as item, i (item.key)}
    {#if item.apart}<div class="apart" role="separator"></div>{/if}
    <button
      type="button"
      role="menuitem"
      class="item"
      tabindex={i === 0 ? 0 : -1}
      data-menu-item={item.key}
      onclick={() => pick(item.key)}
    >
      {#if item.person}
        <Avatar
          name={item.person.displayName}
          photoURL={item.person.photoURL}
          color={item.person.color}
          size="sm"
          decorative
        />
      {:else if item.icon}
        {@const Icon = item.icon}
        <span class="well" aria-hidden="true"><Icon size={18} strokeWidth={1.9} /></span>
      {/if}
      <span class="label" dir="auto">{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .menu {
    /* Undo the UA popover box: it is placed by hand next to the seat. */
    position: fixed;
    inset: auto;
    margin: 0;
    padding: var(--s1-5);
    min-inline-size: 208px;
    max-inline-size: min(300px, calc(100vw - 24px));
    border: var(--edge);
    border-radius: 20px;
    background: var(--surface);
    color: var(--ink);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--line) 70%, transparent),
      var(--sh-2);
    overflow: visible;
    opacity: 0;
    scale: 0.9;
  }

  .menu.fallback {
    z-index: var(--z-overlay);
  }

  .menu.placed {
    animation: menu-in 190ms var(--ease-out) forwards;
  }

  .menu.leaving {
    animation: menu-out 130ms var(--ease-out) forwards;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      scale: 0.86;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  @keyframes menu-out {
    from {
      opacity: 1;
      scale: 1;
    }
    to {
      opacity: 0;
      scale: 0.94;
    }
  }

  .title {
    padding: var(--s2) var(--s3) var(--s1-5);
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: 52px;
    padding-block: var(--s1-5);
    padding-inline: var(--s2) var(--s4);
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--ink);
    font: var(--font-body);
    font-weight: 500;
    text-align: start;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  @media (hover: hover) {
    .item:hover {
      background: var(--surface-2);
    }
  }

  .item:active {
    background: color-mix(in oklab, var(--surface-2), var(--ink) 6%);
  }

  .item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .label {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .well {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .apart {
    margin: var(--s1) var(--s3);
    border-block-start: 1px solid var(--line);
  }

  @media (prefers-reduced-motion: reduce) {
    .menu,
    .menu.placed {
      scale: 1;
      animation: menu-fade 100ms linear forwards;
    }

    .menu.leaving {
      animation: none;
    }

    @keyframes menu-fade {
      to {
        opacity: 1;
      }
    }
  }
</style>
