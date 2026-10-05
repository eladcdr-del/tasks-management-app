<script lang="ts">
  // The bar at the bottom while choosing several tasks on Home (feature "seat", B1): "מחיקה (3)"
  // and "אני לוקחת (2)" (the free ones among those chosen). It takes the bottom nav's place (the
  // nav and the FAB step aside, App.svelte), safe-area aware, and slides up from the bottom.
  // data-action-bar: SnackbarHost lifts its messages above it (52px buttons, --s3 padding and a
  // 1px rule, the same measures as the task screen's bar).
  import { fly } from 'svelte/transition';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Hand from '@lucide/svelte/icons/hand';
  import { Button } from '$components/ui';
  import type { Addressee } from '$lib/i18n/gender';
  import { he } from '$lib/i18n/he';
  import { dur, easeOut } from '$lib/platform/motion';

  interface Props {
    /** How many are chosen. */
    count: number;
    /** How many of them nobody holds yet. */
    free: number;
    me: Addressee;
    ondelete: () => void;
    ontake: () => void;
  }

  let { count, free, me, ondelete, ontake }: Props = $props();
  const t = he.home.select;
</script>

<div
  class="bar"
  role="group"
  aria-label={t.actions}
  data-action-bar
  data-select-bar
  transition:fly={{ y: 96, duration: dur(240), easing: easeOut, opacity: 1 }}
>
  <Button
    size="lg"
    variant="secondary"
    icon={Trash2}
    class="delete"
    disabled={count === 0}
    onclick={ondelete}
    data-select-delete>{t.delete(count)}</Button
  >
  <Button size="lg" block icon={Hand} disabled={free === 0} onclick={ontake} data-select-take
    >{t.take(me, free)}</Button
  >
</div>

<style>
  .bar {
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: var(--z-fab);
    display: flex;
    gap: var(--s3);
    max-inline-size: var(--content-max);
    margin-inline: auto;
    padding: var(--s3) var(--screen-pad) calc(var(--s3) + var(--safe-bottom));
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
    border-block-start: 1px solid var(--line);
    box-shadow: var(--sh-sheet);
  }

  .bar :global(.delete) {
    flex: none;
    white-space: nowrap;
  }

  .bar :global(.delete:not(:disabled)) {
    --btn-fg: var(--danger);
  }
</style>
