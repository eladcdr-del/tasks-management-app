<script lang="ts">
  /*
   * Dialog: a centred confirm (alertdialog). Native <dialog>.showModal(): inert background,
   * Escape = cancel, Tab wrapped, focus starts on the safe choice (cancel) and returns to the opener.
   *
   *   <Dialog open={asking} title="למחוק את המשימה?" message="…" tone="danger"
   *           confirmLabel={he.common.delete} onConfirm={del} onCancel={() => (asking = false)} />
   */
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import Button from './Button.svelte';
  import { he } from '$lib/i18n/he';
  import { REDUCED_MAX, reducedMotion } from '$lib/platform/motion';
  import { lockScroll, wrapTab } from './focus';

  interface Props {
    open: boolean;
    title: string;
    message?: string;
    children?: Snippet;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    /** Shows a spinner on the confirm button and blocks dismissal. */
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    children,
    confirmLabel = he.common.ok,
    cancelLabel = he.common.cancel,
    tone = 'default',
    loading = false,
    onConfirm,
    onCancel
  }: Props = $props();

  const uid = $props.id();
  let dialogEl: HTMLDialogElement | undefined = $state();
  let cardEl: HTMLDivElement | undefined = $state();
  let shown = $state(false);
  let release: (() => void) | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const isOpen = open;
    untrack(() => {
      const d = dialogEl;
      if (!d) return;
      clearTimeout(closeTimer);
      if (isOpen) {
        if (!d.open) d.showModal();
        release ??= lockScroll();
        d.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
        requestAnimationFrame(() => (shown = true));
      } else if (d.open) {
        shown = false;
        closeTimer = setTimeout(
          () => {
            d.close();
            release?.();
            release = null;
          },
          reducedMotion.current ? REDUCED_MAX : 160
        );
      }
    });
  });

  $effect(() => () => {
    clearTimeout(closeTimer);
    release?.();
    release = null;
  });

  function oncancel(e: Event) {
    e.preventDefault();
    if (!loading) onCancel();
  }

  function onclose() {
    // Browser force-close: keep the parent in sync.
    release?.();
    release = null;
    if (open) onCancel();
  }
</script>

<dialog
  bind:this={dialogEl}
  class={['dialog', { shown }]}
  role="alertdialog"
  aria-labelledby="{uid}-t"
  aria-describedby={message ? `${uid}-m` : undefined}
  {oncancel}
  {onclose}
  onkeydown={(e) => cardEl && wrapTab(e, cardEl)}
>
  <div class="scrim" aria-hidden="true"></div>
  <div class="card" bind:this={cardEl}>
    <h2 id="{uid}-t" class="title">{title}</h2>
    {#if message}<p id="{uid}-m" class="message">{message}</p>{/if}
    {#if children}<div class="extra">{@render children()}</div>{/if}
    <div class="actions">
      <Button variant="secondary" size="md" data-cancel disabled={loading} onclick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        variant={tone === 'danger' ? 'danger' : 'primary'}
        size="md"
        {loading}
        onclick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  </div>
</dialog>

<style>
  .dialog {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: var(--s5);
    border: 0;
    background: transparent;
    color: var(--ink);
    overflow: hidden;
  }

  .dialog:not([open]) {
    display: none;
  }

  .dialog::backdrop {
    background: transparent;
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: var(--scrim);
    opacity: 0;
    transition: opacity var(--d-base) var(--ease-out);
  }

  .card {
    position: relative;
    inline-size: min(100%, 360px);
    padding: var(--s6) var(--s5) var(--s5);
    border-radius: var(--r-xl);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-2);
    opacity: 0;
    transform: scale(0.96) translateY(6px);
    transition:
      opacity var(--d-base) var(--ease-out),
      transform var(--d-base) var(--ease-out);
  }

  .shown .scrim,
  .shown .card {
    opacity: 1;
  }

  .shown .card {
    transform: none;
  }

  .title {
    font: var(--font-title);
    color: var(--ink);
  }

  .message {
    margin-block-start: var(--s2);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .extra {
    margin-block-start: var(--s3);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
    margin-block-start: var(--s6);
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transform: none;
    }
  }
</style>
