<script lang="ts">
  /*
   * Disclosure: a row that shows or hides a block below it ("להוסיף תיעוד?" in CompleteSheet).
   * A real <button aria-expanded aria-controls>; the panel element always exists (so aria-controls
   * always points somewhere) and its content mounts while open.
   * Motion: the content's height animates open/closed (240 / 200ms, ease-out); under reduced motion
   * it is a ≤ 120ms crossfade with no height travel. `bind:open`.
   *
   *   <Disclosure summary="להוסיף תיעוד?" hint="הערה, עלות, מקום">…fields…</Disclosure>
   */
  import type { Snippet } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { dur, easeOut, reducedMotion } from '$lib/platform/motion';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  interface Props {
    /** The always-visible button text. */
    summary: string;
    /** Quiet second line under the summary (what is inside). */
    hint?: string;
    icon?: IconComponent;
    open?: boolean;
    onchange?: (open: boolean) => void;
    children: Snippet;
    class?: string;
  }

  let {
    summary,
    hint,
    icon: Icon,
    open = $bindable(false),
    onchange,
    children,
    class: className
  }: Props = $props();

  const uid = $props.id();
  const panelId = `${uid}-panel`;

  function toggle() {
    open = !open;
    onchange?.(open);
  }

  /** Height reveal, or a crossfade under reduced motion. */
  function reveal(node: Element, { opening }: { opening: boolean }) {
    if (reducedMotion.current) return fade(node, { duration: dur(120) });
    return slide(node, { duration: opening ? 240 : 200, easing: easeOut });
  }
</script>

<div class={['disclosure', { open }, className]}>
  <button
    type="button"
    class="summary"
    aria-expanded={open}
    aria-controls={panelId}
    onclick={toggle}
  >
    {#if Icon}<Icon strokeWidth={ICON_STROKE} aria-hidden="true" class="ds-icon" />{/if}
    <span class="text">
      <span class="label">{summary}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </span>
    <ChevronDown strokeWidth={ICON_STROKE} aria-hidden="true" class="ds-chev" />
  </button>
  <div id={panelId} class="panel">
    {#if open}
      <div class="content" in:reveal={{ opening: true }} out:reveal={{ opening: false }}>
        <div class="inner">{@render children()}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .disclosure {
    display: grid;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: var(--s3);
    inline-size: 100%;
    min-block-size: var(--btn-h);
    padding-block: var(--s2);
    padding-inline: var(--s4) var(--s3);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--ink);
    text-align: start;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  @media (hover: hover) {
    .summary:hover {
      background: color-mix(in oklab, var(--surface-2), var(--ink) 4%);
    }
  }

  .summary:active {
    background: color-mix(in oklab, var(--surface-2), var(--ink) 8%);
  }

  .summary:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .summary :global(.ds-icon) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-2);
  }

  .text {
    display: grid;
    gap: var(--s0-5);
    flex: 1;
    min-inline-size: 0;
  }

  .label {
    font: var(--font-body);
    font-weight: 500;
  }

  .hint {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .summary :global(.ds-chev) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-2);
    transition: rotate var(--d-base) var(--ease-out);
  }

  .open .summary :global(.ds-chev) {
    rotate: 180deg;
  }

  .content {
    overflow: hidden;
  }

  .inner {
    display: grid;
    gap: var(--s4);
    padding-block: var(--s4) var(--s1);
  }

  @media (prefers-reduced-motion: reduce) {
    .summary :global(.ds-chev) {
      transition-duration: var(--d-fast);
    }
  }
</style>
