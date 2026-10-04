<script lang="ts">
  /*
   * Banner: an inline message block (not transient: Snackbar is for that).
   *   tone   info · success → role="status" (polite)    warn · danger → role="alert" (assertive)
   *   icon   per tone (override with `icon`, or `null` for none)
   *   title  bold first line; body (or children) below; optional action link/button and ×.
   *
   *   <Banner tone="danger" title="ההתחברות נכשלה" body="נסו שוב בעוד רגע."
   *           actionLabel="ניסיון חוזר" onaction={retry} />
   *   <Banner tone="info" title="ההתראות כבויות" ondismiss={() => (hidden = true)} />
   *
   * Mount it when there is something to say: an alert banner announces itself on insertion.
   */
  import type { Snippet } from 'svelte';
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import X from '@lucide/svelte/icons/x';
  import { he } from '$lib/i18n/he';
  import { textDir } from '$lib/i18n/textDir';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Tone = 'info' | 'warn' | 'danger' | 'success';

  interface Props {
    tone?: Tone;
    title?: string;
    body?: string;
    /** Rich body instead of `body`. */
    children?: Snippet;
    /** Override the tone's icon; `null` for none. */
    icon?: IconComponent | null;
    actionLabel?: string;
    onaction?: (e: MouseEvent) => void;
    actionHref?: string;
    /** Shows the × button. */
    ondismiss?: () => void;
    /** Accessible name of the × button (default "סגירת ההודעה"). */
    dismissLabel?: string;
    /** Title / body contain user-entered text: direction via textDir(). */
    userText?: boolean;
    class?: string;
  }

  const ICONS: Record<Tone, IconComponent> = {
    info: Info,
    warn: TriangleAlert,
    danger: CircleAlert,
    success: CircleCheck
  };

  let {
    tone = 'info',
    title,
    body,
    children,
    icon,
    actionLabel,
    onaction,
    actionHref,
    ondismiss,
    dismissLabel = he.ui.dismiss,
    userText = false,
    class: className
  }: Props = $props();

  const Icon = $derived(icon === undefined ? ICONS[tone] : icon);
  const role = $derived(tone === 'warn' || tone === 'danger' ? 'alert' : 'status');
  const dirOf = (s: string | undefined) => (userText ? textDir(s) : undefined);
</script>

<div class={['banner', tone, { dismissible: !!ondismiss }, className]} {role}>
  {#if Icon}
    <span class="icon"><Icon strokeWidth={ICON_STROKE} aria-hidden="true" class="bn-icon" /></span>
  {/if}
  <div class="text">
    {#if title}<p class="title" dir={dirOf(title)}>{title}</p>{/if}
    {#if children}
      <div class="body">{@render children()}</div>
    {:else if body}
      <p class="body" dir={dirOf(body)}>{body}</p>
    {/if}
    {#if actionLabel && actionHref}
      <a class="action" href={actionHref}>{actionLabel}</a>
    {:else if actionLabel && onaction}
      <button type="button" class="action" onclick={onaction}>{actionLabel}</button>
    {/if}
  </div>
  {#if ondismiss}
    <button type="button" class="dismiss" aria-label={dismissLabel} onclick={() => ondismiss?.()}>
      <X strokeWidth={ICON_STROKE} aria-hidden="true" class="bn-x" />
    </button>
  {/if}
</div>

<style>
  .banner {
    --bn-bg: var(--info-soft);
    --bn-fg: var(--info-ink);
    --bn-icon: var(--ink-2);
    display: flex;
    align-items: flex-start;
    gap: var(--s3);
    padding: var(--s3) var(--s4);
    border-radius: var(--r-md);
    background: var(--bn-bg);
    color: var(--bn-fg);
  }

  .dismissible {
    padding-inline-end: var(--s1);
  }

  .warn {
    --bn-bg: var(--warn-soft);
    --bn-fg: var(--warn-ink);
    --bn-icon: var(--warn-ink);
  }

  .danger {
    --bn-bg: var(--danger-soft);
    --bn-fg: var(--danger);
    --bn-icon: var(--danger);
  }

  .success {
    --bn-bg: var(--success-soft);
    --bn-fg: var(--sage-ink);
    --bn-icon: var(--sage-ink);
  }

  .icon {
    display: grid;
    place-items: center;
    flex: none;
    min-block-size: var(--lh-callout);
    color: var(--bn-icon);
  }

  .icon :global(.bn-icon) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .text {
    display: grid;
    gap: var(--s0-5);
    flex: 1;
    min-inline-size: 0;
    font: var(--font-callout);
  }

  .title {
    font-weight: 600;
  }

  .body {
    color: inherit;
  }

  .title + .body {
    font-weight: 400;
  }

  .action {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    margin-block: calc(var(--s2) * -1) calc(var(--s3) * -1);
    padding-inline: 0;
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }

  .dismiss {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    margin-block: calc(var(--s2-5) * -1);
    border-radius: var(--r-pill);
    color: inherit;
  }

  .dismiss :global(.bn-x) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .dismiss:active {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .action:focus-visible,
  .dismiss:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .action:focus-visible {
    border-radius: var(--r-xs);
  }
</style>
