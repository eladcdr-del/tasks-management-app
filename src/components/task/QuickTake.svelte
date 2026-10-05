<script lang="ts">
  // QuickTake (feature "home"): the compact actions at the end of an unowned task's row: a small
  // "אני לוקחת" pill (the viewer's own form) and, when there is someone to ask, a quiet hand icon
  // that opens the request sheet ("לבקש מ…"). Visible sizes are small; both hit areas are ≥ 44px.
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import { IconButton } from '$components/ui';
  import type { Addressee } from '$lib/i18n/gender';
  import { he } from '$lib/i18n/he';
  import { openRequest, takeTask } from './actions';

  interface Props {
    taskId: string;
    /** The viewer's form ("אני לוקחת" / "אני לוקח"). */
    me: Addressee;
    /** Someone else to ask (no request icon while alone). */
    canRequest: boolean;
  }

  let { taskId, me, canRequest }: Props = $props();
  const t = he.taskCard;
</script>

<div class={['quick', { 'with-ask': canRequest }]}>
  <button type="button" class="take" data-action="take" onclick={() => takeTask(taskId)}>
    <span class="face">{t.take(me)}</span>
  </button>
  {#if canRequest}
    <IconButton
      size="sm"
      icon={HandHelping}
      label={t.request}
      class="ask"
      data-action="request"
      onclick={() => openRequest(taskId)}
    />
  {/if}
</div>

<style>
  .quick {
    display: flex;
    align-items: center;
    gap: 0;
  }

  /* The icon's face is 32px inside a 44px hit area: let that spare room reach into the row's own
     padding, so the icon lines up with the avatars of the owned rows. */
  .quick.with-ask {
    margin-inline-end: calc(var(--s2) * -1);
  }

  .take {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    min-block-size: var(--tap-min);
    -webkit-tap-highlight-color: transparent;
  }

  .face {
    display: inline-flex;
    align-items: center;
    min-block-size: 32px;
    padding-block: 0.2em;
    padding-inline: var(--s3);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--accent-ink);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    font-size: var(--fs-caption);
    font-weight: 600;
    line-height: var(--lh-caption);
    white-space: nowrap;
    transition:
      background-color var(--d-fast) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .take:active .face {
    transform: scale(0.95);
    background: color-mix(in oklab, var(--surface-2), var(--ink) 6%);
  }

  @media (hover: hover) {
    .take:hover .face {
      background: color-mix(in oklab, var(--surface-2), var(--ink) 4%);
    }
  }

  .take:focus-visible {
    outline: none;
  }

  .take:focus-visible .face {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .quick :global(.ask) {
    color: var(--ink-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .take:active .face {
      transform: none;
    }
  }
</style>
