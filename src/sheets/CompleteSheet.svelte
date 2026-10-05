<script lang="ts">
  // owner: step 3.3. Completing a task: a warm line, an optional documentation block (collapsed by
  // default: note, cost ₪, place, contact, up to 3 photos) and "סיום". The house memory is built
  // from this documentation, but documenting is never required. After "סיום": the sheet closes,
  // a completion haptic plays and a "בוצע · ביטול" snackbar offers undo (tasks.reopen).
  import PartyPopper from '@lucide/svelte/icons/party-popper';
  import NotebookPen from '@lucide/svelte/icons/notebook-pen';
  import type { EncodedPhoto } from '$lib/domain/types';
  import {
    Button,
    Disclosure,
    NumberField,
    TextArea,
    TextField,
    ICON_STROKE
  } from '$components/ui';
  import PhotoPicker from '$components/form/PhotoPicker.svelte';
  import { relativeDayLabel } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { tasks } from '$lib/state/tasks.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { haptic } from '$lib/platform/haptics';

  interface Props {
    taskId: string;
    onClose: () => void;
  }

  let { taskId, onClose }: Props = $props();
  const t = he.sheetComplete;

  const task = $derived(tasks.byId(taskId));

  let open = $state(false);
  let note = $state('');
  let cost = $state<number | null>(null);
  let place = $state('');
  let contact = $state('');
  let photos = $state<EncodedPhoto[]>([]);
  let photoBusy = $state(false);
  let saving = $state(false);

  async function finish() {
    if (saving || photoBusy) return;
    saving = true;
    const id = taskId;
    const result = await tasks.complete(
      id,
      { note: note.trim(), cost, place: place.trim(), contact: contact.trim() },
      $state.snapshot(photos) as EncodedPhoto[]
    );
    saving = false;
    if (result === null) return; // the store already showed the error
    haptic('complete');
    const next = result.nextTaskId ? tasks.byId(result.nextTaskId) : null;
    const nextDate = next?.dueDate ?? next?.scheduledFor ?? null;
    onClose();
    ui.show(nextDate ? t.doneNext(relativeDayLabel(nextDate, tasks.today)) : t.done, {
      action: he.common.undo,
      onAction: () => tasks.reopen(id)
    });
  }
</script>

<div class="complete" data-testid="complete-sheet">
  <div class="hero">
    <span class="badge" aria-hidden="true">
      <PartyPopper strokeWidth={ICON_STROKE} />
    </span>
    <div class="hero-text">
      <h2>{t.title}</h2>
      {#if task}
        <p class="task-title" dir={textDir(task.title)}>{task.title}</p>
      {/if}
    </div>
  </div>

  <Disclosure bind:open summary={t.docSummary} hint={t.docHint} icon={NotebookPen}>
    <div class="fields">
      <TextArea label={t.note} bind:value={note} placeholder={t.notePlaceholder} rows={2} />
      <NumberField label={t.cost} bind:value={cost} min={0} placeholder="0" />
      <TextField label={t.place} bind:value={place} placeholder={t.placePlaceholder} />
      <TextField label={t.contact} bind:value={contact} placeholder={t.contactPlaceholder} />
      <PhotoPicker bind:photos bind:busy={photoBusy} />
    </div>
  </Disclosure>

  <Button size="lg" block loading={saving} disabled={photoBusy || !task} onclick={finish}>
    {t.finish}
  </Button>
</div>

<style>
  .complete {
    display: grid;
    gap: var(--s5);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: var(--s4);
  }

  .badge {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--r-pill);
    background: var(--accent-soft);
    color: var(--accent-ink);
    animation: pop var(--d-slow) var(--ease-spring) both;
  }

  .badge :global(svg) {
    inline-size: 28px;
    block-size: 28px;
  }

  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .badge {
      animation: none;
    }
  }

  .hero-text {
    display: grid;
    gap: var(--s1);
    min-inline-size: 0;
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
    text-wrap: balance;
  }

  .task-title {
    font: var(--font-callout);
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }

  .fields {
    display: grid;
    gap: var(--s4);
    padding-block: var(--s3) var(--s1);
  }
</style>
