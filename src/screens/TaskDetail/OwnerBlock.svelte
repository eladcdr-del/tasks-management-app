<script lang="ts">
  // owner: step 3.3. Who holds the task: the owner (or the dashed "?" while nobody took it), the
  // request line, and one-tap actions: take / ask someone / back to the list. The request line
  // speaks to the viewer like the card does ("מיכל ביקשה ממך", "ביקשת מדני"); only between two
  // other members is it in the third person ("מיכל ביקשה מדני").
  // No suggestion of who should do it, ever.
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import Send from '@lucide/svelte/icons/send';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import type { Task } from '$lib/domain/types';
  import { Avatar, Button } from '$components/ui';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { router } from '$lib/router/router.svelte';
  import { haptic } from '$lib/platform/haptics';

  interface Props {
    task: Task;
  }

  let { task }: Props = $props();
  const t = he.taskDetail;

  const me = $derived(household.me);
  const owner = $derived(household.memberById(task.ownerId));
  const mine = $derived(task.ownerId !== null && task.ownerId === household.uid);
  const requester = $derived(household.memberById(task.requestedBy));
  const ownerLine = $derived(
    task.ownerId === null
      ? t.waiting
      : mine
        ? t.ownedByMe
        : t.ownedBy(owner?.displayName ?? t.someone)
  );
  const multi = $derived(household.members.length > 1);
  const requestLine = $derived.by(() => {
    if (!requester || !owner || task.requestedBy === task.ownerId) return '';
    if (mine) return he.taskCard.requestedOfMe(requester);
    if (task.requestedBy === household.uid) return he.taskCard.iRequested(owner.displayName);
    return t.ev.requested(requester, owner.displayName);
  });

  let taking = $state(false);
  async function take() {
    taking = true;
    const r = await tasks.take(task.id);
    taking = false;
    if (r === null) return;
    if (r.ok) haptic('take');
    else {
      const by = household.memberById(r.takenBy);
      ui.show(t.takenBy(by ?? { displayName: t.someone, addressAs: 'n' }));
    }
  }
</script>

<section class="owner" aria-label={t.owner} data-testid="owner-block">
  <div class="who">
    {#if owner}
      <Avatar
        name={owner.displayName}
        photoURL={owner.photoURL}
        color={owner.color}
        size="md"
        decorative
      />
    {:else}
      <Avatar unassigned size="md" decorative />
    {/if}
    <div class="lines">
      <p class="owner-line" dir={textDir(ownerLine)}>{ownerLine}</p>
      {#if requestLine}
        <p class="request-line" data-request-line>{requestLine}</p>
      {/if}
    </div>
  </div>
  <div class="actions">
    {#if !mine && me}
      <Button size="sm" icon={HandHelping} loading={taking} onclick={take}>{t.take(me)}</Button>
    {/if}
    {#if multi}
      <Button
        size="sm"
        variant="secondary"
        icon={Send}
        onclick={() => router.openSheet({ name: 'request', taskId: task.id })}>{t.request}</Button
      >
    {/if}
    {#if task.ownerId !== null}
      <Button size="sm" variant="ghost" icon={Undo2} onclick={() => tasks.release(task.id)}
        >{t.release}</Button
      >
    {/if}
  </div>
</section>

<style>
  .owner {
    display: grid;
    gap: var(--s3);
    padding: var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--sh-1);
    border: var(--edge);
  }

  .who {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .lines {
    display: grid;
    gap: var(--s0-5);
    min-inline-size: 0;
  }

  .owner-line {
    font: var(--font-headline);
    color: var(--ink);
  }

  .request-line {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }
</style>
