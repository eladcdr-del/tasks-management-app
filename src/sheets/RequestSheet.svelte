<script lang="ts">
  // RequestSheet (step 3.2): "לבקש מ…". The household's other members in their stable order (by
  // joining, never by load) with no suggestion; the only candidate is preselected, which is not a
  // suggestion but the only answer. Sends tasks.request(taskId, uid): ownerId = them, requestedBy = me.
  // Rendered by SheetHost; `onClose` pops the sheet's history entry.
  import Send from '@lucide/svelte/icons/send';
  import { Avatar, Button, ChoiceRow } from '$components/ui';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { haptic } from '$lib/platform/haptics';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { ui } from '$lib/state/ui.svelte';

  interface Props {
    taskId: string;
    onClose: () => void;
  }

  let { taskId, onClose }: Props = $props();
  const t = he.sheetRequest;

  const task = $derived(tasks.byId(taskId));
  const others = $derived(household.members.filter((m) => m.uid !== household.uid));
  const candidates = $derived(others.filter((m) => m.uid !== task?.ownerId));
  let picked = $state<string | null>(null);
  const who = $derived(picked ?? (candidates.length === 1 ? (candidates[0]?.uid ?? null) : null));

  function send() {
    const member = household.memberById(who);
    if (!task || !member) return;
    haptic('take');
    tasks.request(task.id, member.uid);
    ui.show(t.sent(member.displayName));
    onClose();
  }
</script>

<div class="sheet" data-sheet-content="request" data-task-id={taskId}>
  <header>
    <h2>{t.title}</h2>
    {#if task}<p class="context" dir={textDir(task.title)}>{task.title}</p>{/if}
  </header>

  {#if !task || task.status !== 'open'}
    <p class="note">{t.missing}</p>
    <Button variant="secondary" onclick={onClose}>{he.common.close}</Button>
  {:else if others.length === 0}
    <p class="note">{t.alone}</p>
    <Button variant="secondary" onclick={onClose}>{he.common.close}</Button>
  {:else}
    <div class="rows" role="radiogroup" aria-label={t.group}>
      {#each others as m (m.uid)}
        {@const owns = task.ownerId === m.uid}
        <ChoiceRow
          name="request-to"
          value={m.uid}
          title={m.displayName}
          subtitle={owns ? t.owns(m) : undefined}
          userText
          disabled={owns}
          checked={who === m.uid}
          onselect={() => (picked = m.uid)}
        >
          {#snippet leading()}
            <Avatar name={m.displayName} photoURL={m.photoURL} color={m.color} decorative />
          {/snippet}
        </ChoiceRow>
      {/each}
    </div>
    <Button block size="lg" icon={Send} flipIcon disabled={!who} onclick={send}>{t.send}</Button>
  {/if}
</div>

<style>
  .sheet {
    display: grid;
    gap: var(--s4);
  }

  header {
    display: grid;
    gap: var(--s1);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .context {
    font: var(--font-callout);
    color: var(--ink-2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .rows {
    display: grid;
    gap: var(--s2);
  }

  .note {
    font: var(--font-callout);
    color: var(--ink-2);
  }
</style>
