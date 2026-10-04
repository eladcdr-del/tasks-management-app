<script lang="ts">
  // owner: step 3.3. A done task's documentation: who finished it and when, the note, cost, place,
  // contact and photo thumbs (tap → full-screen viewer). This is what the house memory remembers.
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Wallet from '@lucide/svelte/icons/wallet';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Phone from '@lucide/svelte/icons/phone';
  import StickyNote from '@lucide/svelte/icons/sticky-note';
  import type { Task } from '$lib/domain/types';
  import { Avatar, ICON_STROKE } from '$components/ui';
  import PhotoThumb from '$components/memory/PhotoThumb.svelte';
  import { formatCurrency, formatDate } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { household } from '$lib/state/household.svelte';

  interface Props {
    task: Task;
    today: string;
  }

  let { task, today }: Props = $props();
  const t = he.taskDetail;

  const by = $derived(household.memberById(task.completedBy));
  const c = $derived(task.completion);
  const hasDoc = $derived(
    !!c && (!!c.note || c.cost !== null || !!c.place || !!c.contact || c.photoIds.length > 0)
  );
</script>

<section class="doc" aria-label={t.documentation} data-testid="documentation">
  <div class="done-head">
    <span class="check" aria-hidden="true"><CircleCheck strokeWidth={ICON_STROKE} /></span>
    <div class="lines">
      <p class="done-title">{t.doneTitle}</p>
      <p class="done-line">
        {#if by}
          <Avatar name={by.displayName} color={by.color} photoURL={by.photoURL} size="xs" ring={false} decorative />
        {/if}
        {t.doneLine(by?.displayName ?? t.someone, task.completedAt ? formatDate(task.completedAt, { today }) : '')}
      </p>
    </div>
  </div>

  {#if hasDoc && c}
    <dl class="facts">
      {#if c.note}
        <div class="fact wide">
          <dt><StickyNote strokeWidth={ICON_STROKE} aria-hidden="true" /><span>{t.note}</span></dt>
          <dd dir={textDir(c.note)}>{c.note}</dd>
        </div>
      {/if}
      {#if c.cost !== null}
        <div class="fact">
          <dt><Wallet strokeWidth={ICON_STROKE} aria-hidden="true" /><span>{t.cost}</span></dt>
          <dd class="num">{formatCurrency(c.cost)}</dd>
        </div>
      {/if}
      {#if c.place}
        <div class="fact">
          <dt><MapPin strokeWidth={ICON_STROKE} aria-hidden="true" /><span>{t.place}</span></dt>
          <dd dir={textDir(c.place)}>{c.place}</dd>
        </div>
      {/if}
      {#if c.contact}
        <div class="fact">
          <dt><Phone strokeWidth={ICON_STROKE} aria-hidden="true" /><span>{t.contact}</span></dt>
          <dd dir={textDir(c.contact)}>{c.contact}</dd>
        </div>
      {/if}
    </dl>
    {#if c.photoIds.length > 0}
      <div class="photos">
        {#each c.photoIds as id, i (id)}
          <PhotoThumb photoId={id} label={t.photo(i + 1)} size={88} />
        {/each}
      </div>
    {/if}
  {:else}
    <p class="no-doc">{t.noDocumentation}</p>
  {/if}
</section>

<style>
  .doc {
    display: grid;
    gap: var(--s4);
    padding: var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--sh-1);
    border: var(--edge);
  }

  .done-head {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .check {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--success-soft);
    color: var(--sage-ink);
  }

  .check :global(svg) {
    inline-size: 22px;
    block-size: 22px;
  }

  .lines {
    display: grid;
    gap: var(--s0-5);
  }

  .done-title {
    font: var(--font-headline);
    color: var(--sage-ink);
  }

  .done-line {
    display: flex;
    align-items: center;
    gap: var(--s1-5);
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s3);
    margin: 0;
  }

  .fact {
    display: grid;
    gap: var(--s1);
    padding: var(--s3);
    border-radius: var(--r-md);
    background: var(--surface-2);
    min-inline-size: 0;
  }

  .fact.wide {
    grid-column: 1 / -1;
  }

  dt {
    display: flex;
    align-items: center;
    gap: var(--s1);
    font: var(--font-caption);
    color: var(--ink-2);
  }

  dt :global(svg) {
    inline-size: var(--icon-xs);
    block-size: var(--icon-xs);
  }

  dd {
    margin: 0;
    font: var(--font-callout);
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .photos {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }

  .no-doc {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-3);
  }
</style>
