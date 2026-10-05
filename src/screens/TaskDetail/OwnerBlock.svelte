<script lang="ts">
  // owner: step 3.3. Who holds the task: the owner (or the dashed "?" while nobody took it), the
  // request line, and one-tap actions. The request line speaks to the viewer like the card does
  // ("מיכל ביקשה ממך", "ביקשת מדני · מחכה לתשובה"); only between two other members is it in the
  // third person ("מיכל ביקשה מדני").
  //
  // A request is a proposal (domain/requests.ts): until the asked member answers, nobody holds the
  // task. The asked member answers here ("אני לוקח/ת" / "לא מתאים לי"); the one who asked can
  // withdraw it ("ביטול הבקשה"); anyone may still take it. Once accepted, the line is quiet history
  // ("לבקשת מיכל" / "לבקשתך").
  // No suggestion of who should do it, ever.
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import Send from '@lucide/svelte/icons/send';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import X from '@lucide/svelte/icons/x';
  import type { Task } from '$lib/domain/types';
  import { requestView } from '$lib/domain/requests';
  import { Avatar, Button } from '$components/ui';
  import { acceptRequest, declineRequest } from '$components/task/actions';
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
  const tc = he.taskCard;

  const me = $derived(household.me);
  const owner = $derived(household.memberById(task.ownerId));
  const mine = $derived(task.ownerId !== null && task.ownerId === household.uid);
  const view = $derived(requestView(task, household.uid, household.memberIds));
  const askedMe = $derived(view.kind === 'askedMe');
  const requester = $derived(
    household.memberById(task.requestedBy) ?? { displayName: t.someone, addressAs: 'm' as const }
  );
  const nameOf = (uid: string) => household.memberById(uid)?.displayName ?? t.someone;

  const ownerLine = $derived(
    askedMe
      ? tc.requestedOfMe(requester)
      : task.ownerId === null
        ? t.waiting
        : mine
          ? t.ownedByMe
          : t.ownedBy(owner?.displayName ?? t.someone)
  );
  const requestLine = $derived.by(() => {
    switch (view.kind) {
      case 'askedMe':
        return t.awaitingMe;
      case 'iAsked':
        return tc.iRequestedWaiting(nameOf(view.to));
      case 'between':
        return tc.requestedBetween(requester, nameOf(view.to));
      case 'accepted':
        return view.by === household.uid ? tc.atMyRequest : tc.atRequestOf(nameOf(view.by));
      default:
        return '';
    }
  });
  const multi = $derived(household.members.length > 1);

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

  async function accept() {
    taking = true;
    await acceptRequest(task.id);
    taking = false;
  }

  function cancel() {
    haptic('select');
    tasks.cancelRequest(task.id);
    ui.show(t.cancelled);
  }
</script>

<section
  class="owner"
  aria-label={t.owner}
  data-testid="owner-block"
  data-request={view.kind}
  class:asked={askedMe}
>
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
    {#if askedMe && me}
      <Button size="sm" icon={HandHelping} loading={taking} onclick={accept} data-action="accept"
        >{tc.accept(me)}</Button
      >
      <Button
        size="sm"
        variant="secondary"
        onclick={() => declineRequest(task.id)}
        data-action="decline">{tc.decline}</Button
      >
    {:else}
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
      {#if view.kind === 'iAsked'}
        <Button size="sm" variant="ghost" icon={X} onclick={cancel} data-action="cancel-request"
          >{t.cancelRequest}</Button
        >
      {/if}
      {#if task.ownerId !== null}
        <Button size="sm" variant="ghost" icon={Undo2} onclick={() => tasks.release(task.id)}
          >{t.release}</Button
        >
      {/if}
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

  /* Waiting for my answer: the same accent ink as the card's "ביקש ממך" line. */
  .asked .request-line {
    color: var(--accent-ink);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }
</style>
