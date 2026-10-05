<script lang="ts">
  /*
   * RowMenu: a quiet "⋮" at the end of a list row that opens a small menu of actions for it.
   *   <RowMenu label="אפשרויות ל״ארוחה במסעדה״"
   *            items={[{ id: 'delete', label: 'מחיקה מההיסטוריה', icon: Trash2, danger: true,
   *                      onSelect: () => ask(treat) }]} />
   * Built on the native popover (popover="auto" + popovertarget): a tap outside, Escape and the
   * Android back gesture close it, and focus returns to the "⋮". Opening moves focus to the first
   * item; arrows / Home / End move between items; Tab closes. Placed under the "⋮" (above it near
   * the bottom of the screen), aligned to its outer edge, and it stays with the "⋮" while the page
   * scrolls or moves (closing once the "⋮" leaves the screen). Without popover support (very old
   * browsers) the "⋮" runs the first action directly. The hit area is 44px; the face is 32px.
   */
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import type { IconComponent } from '$components/ui/types';
  import { ICON_STROKE } from '$components/ui/types';

  export interface RowMenuItem {
    id: string;
    label: string;
    icon?: IconComponent;
    /** A destructive action (red). */
    danger?: boolean;
    onSelect: () => void;
  }

  interface Props {
    /** Accessible name of the "⋮" (and of the menu), e.g. "אפשרויות ל״גלידה״". */
    label: string;
    items: readonly RowMenuItem[];
  }

  let { label, items }: Props = $props();

  const uid = $props.id();
  const menuId = `${uid}-menu`;
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();
  let open = $state(false);
  /** Which side of the "⋮" the menu opens on (it grows away from it). */
  let side = $state<'below' | 'above'>('below');

  const supported = (el: HTMLElement | undefined): el is HTMLElement =>
    !!el && typeof el.showPopover === 'function';

  const menuItems = (): HTMLButtonElement[] =>
    menuEl ? [...menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')] : [];

  /**
   * Places the menu next to the "⋮" (fixed position, in the top layer): before it shows, on the
   * side with room (`keep`: the side it opened on, while it follows the "⋮").
   */
  function place(keep?: 'below' | 'above') {
    if (!triggerEl || !menuEl) return;
    const r = triggerEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const rtl = getComputedStyle(triggerEl).direction === 'rtl';
    const s = menuEl.style;
    // The "⋮" sits at the row's outer edge: the menu grows inwards from it.
    s.left = rtl ? `${Math.max(8, Math.round(r.left))}px` : 'auto';
    s.right = rtl ? 'auto' : `${Math.max(8, Math.round(vw - r.right))}px`;
    const below = keep ? keep === 'below' : r.bottom + 160 < vh;
    s.top = below ? `${Math.round(r.bottom + 4)}px` : 'auto';
    s.bottom = below ? 'auto' : `${Math.round(vh - r.top + 4)}px`;
    side = below ? 'below' : 'above';
    menuEl.dataset.side = side; // now, before it shows (the attribute below follows)
  }

  let frame = 0;
  /** While open, the menu follows its "⋮"; once the "⋮" is off screen (or gone) it closes. */
  function follow() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!open || !triggerEl) return;
      const r = triggerEl.getBoundingClientRect();
      if (!triggerEl.isConnected || r.bottom < 0 || r.top > window.innerHeight) close();
      else place(side);
    });
  }

  function listen(on: boolean) {
    if (on) {
      window.addEventListener('scroll', follow, { capture: true, passive: true });
      window.addEventListener('resize', follow);
    } else {
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      cancelAnimationFrame(frame);
    }
  }

  function onbeforetoggle(e: ToggleEvent) {
    if (e.newState === 'open') place();
  }

  function ontoggle(e: ToggleEvent) {
    open = e.newState === 'open';
    listen(open);
    if (open) {
      menuItems()[0]?.focus({ preventScroll: true });
    } else {
      const active = document.activeElement;
      if (!active || active === document.body || menuEl?.contains(active)) {
        triggerEl?.focus({ preventScroll: true });
      }
    }
  }

  function close() {
    if (supported(menuEl) && menuEl.matches(':popover-open')) menuEl.hidePopover();
  }

  /** Without popover support the "⋮" runs the first action (the native toggle is a no-op). */
  function onTriggerClick() {
    if (!supported(menuEl)) items[0]?.onSelect();
  }

  function select(item: RowMenuItem) {
    close(); // focus goes back to the "⋮" first, so a dialog the action opens returns there
    item.onSelect();
  }

  function onkeydown(e: KeyboardEvent) {
    const list = menuItems();
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowDown') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else if (e.key === 'Tab') {
      e.preventDefault();
      close();
      return;
    }
    if (!next) return;
    e.preventDefault();
    next.focus();
  }

  $effect(() => () => listen(false));
</script>

<button
  bind:this={triggerEl}
  type="button"
  class={['trigger', { open }]}
  aria-label={label}
  title={label}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={menuId}
  popovertarget={menuId}
  onclick={onTriggerClick}
  data-row-menu
>
  <span class="face"
    ><EllipsisVertical size={18} strokeWidth={ICON_STROKE} aria-hidden="true" /></span
  >
</button>

<div
  bind:this={menuEl}
  id={menuId}
  class="menu"
  popover="auto"
  role="menu"
  tabindex="-1"
  aria-label={label}
  data-side={side}
  {onbeforetoggle}
  {ontoggle}
  {onkeydown}
>
  {#each items as item (item.id)}
    <button
      type="button"
      role="menuitem"
      tabindex="-1"
      class={['item', { danger: item.danger }]}
      data-menu-item={item.id}
      onclick={() => select(item)}
    >
      {#if item.icon}
        <item.icon size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
      {/if}
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .trigger {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    /* The 44px hit area reaches into the row's padding; the 32px face lines up with its edge. */
    margin-inline-end: calc(var(--s2) * -1);
    color: var(--ink-3);
    -webkit-tap-highlight-color: transparent;
  }

  .face {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-pill);
    transition:
      background-color var(--d-fast) var(--ease-out),
      color var(--d-fast) var(--ease-out);
  }

  .trigger.open .face,
  .trigger:active .face {
    background: var(--surface-2);
    color: var(--ink);
  }

  @media (hover: hover) {
    .trigger:hover .face {
      background: color-mix(in srgb, var(--surface-2) 70%, transparent);
      color: var(--ink-2);
    }
  }

  .trigger:focus-visible {
    outline: none;
  }

  .trigger:focus-visible .face {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* The menu: a small floating card in the top layer (fixed; place() sets its edges). */
  .menu {
    position: fixed;
    inset: auto;
    margin: 0;
    min-inline-size: 11rem;
    max-inline-size: calc(100vw - 2 * var(--s4));
    padding: var(--s1);
    /* One step above the card it floats over (in dark mode a lighter surface does the lifting). */
    border: 1px solid var(--surface-raised-edge);
    border-radius: var(--r-md);
    background: var(--surface-raised);
    color: var(--ink);
    box-shadow: var(--sh-2);
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
    transform-origin: top left;
    transition:
      opacity var(--d-fast) var(--ease-out),
      transform var(--d-fast) var(--ease-out),
      overlay var(--d-fast) allow-discrete,
      display var(--d-fast) allow-discrete;
  }

  .menu[data-side='above'] {
    transform: translateY(4px) scale(0.97);
    transform-origin: bottom left;
  }

  .menu:popover-open {
    opacity: 1;
    transform: none;
  }

  @starting-style {
    .menu:popover-open {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }

    .menu[data-side='above']:popover-open {
      transform: translateY(4px) scale(0.97);
    }
  }

  .menu::backdrop {
    background: transparent;
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: var(--tap-min);
    padding-inline: var(--s3);
    border-radius: var(--r-sm);
    font: var(--font-body);
    color: var(--ink);
    text-align: start;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .item.danger {
    color: var(--danger);
  }

  .item:active,
  .item:focus-visible {
    background: var(--surface-raised-press);
  }

  .item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .item:hover {
      background: var(--surface-raised-press);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu,
    .menu[data-side='above'],
    .menu:popover-open {
      transform: none;
    }

    @starting-style {
      .menu:popover-open,
      .menu[data-side='above']:popover-open {
        transform: none;
      }
    }
  }
</style>
