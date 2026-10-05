<script lang="ts">
  // owner: step 3.1. The invite card on #/household: "הזמנה בוואטסאפ" creates a code
  // (household.createInvite, which revokes the previous one) and shares
  // https://eladcdr-del.github.io/tasks-management-app/#/join/<code> through share.ts (Web Share →
  // WhatsApp → clipboard). While a link is active: its validity ("בתוקף עוד 6 ימים"), send again,
  // copy, and "ביטול קישור". Remaining capacity at the bottom.
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Copy from '@lucide/svelte/icons/copy';
  import Link2Off from '@lucide/svelte/icons/link-2-off';
  import { Button, Card } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { validForLabel } from '$lib/i18n/format';
  import { copyText, inviteLink, shareTask } from '$lib/platform/share';
  import { clock } from '$lib/state/clock.svelte';
  import { household } from '$lib/state/household.svelte';
  import { ui } from '$lib/state/ui.svelte';

  const t = he.household.invite;
  let busy = $state(false);

  const h = $derived(household.household);
  const active = $derived(
    household.invite && household.invite.expiresAt > clock.nowMs ? household.invite : null
  );
  const link = $derived(active ? inviteLink(active.code) : null);
  const left = $derived(h ? Math.max(0, h.maxMembers - h.memberCount) : 0);
  const full = $derived(h !== null && left === 0);

  async function share(code: string) {
    const result = await shareTask({
      title: t.shareTitle,
      text: t.shareText(h?.name ?? he.household.title),
      url: inviteLink(code)
    });
    if (result === 'copied') ui.show(t.copied);
  }

  async function create() {
    if (busy) return;
    busy = true;
    try {
      const invite = await household.createInvite();
      if (invite) await share(invite.code);
    } finally {
      busy = false;
    }
  }

  async function copy() {
    if (link && (await copyText(link))) ui.show(t.copied);
  }

  async function revoke() {
    await household.revokeInvite();
    ui.show(t.revoked);
  }
</script>

<Card padding="lg" as="section" class="invite">
  <div class="body" data-invite-card>
    <h2>{t.title}</h2>
    {#if full}
      <p class="text">{t.full}</p>
    {:else if active && link}
      <div class="link" aria-label={t.linkLabel}>
        <span class="url" dir="ltr" data-invite-link>{link}</span>
        <span class="valid" data-invite-valid>{validForLabel(active.expiresAt, clock.nowMs)}</span>
      </div>
      <div class="row">
        <Button icon={MessageCircle} block onclick={() => share(active.code)}>{t.resend}</Button>
        <Button variant="secondary" icon={Copy} block onclick={copy} data-invite-copy
          >{t.copy}</Button
        >
      </div>
      <Button variant="ghost" size="sm" icon={Link2Off} onclick={revoke} data-invite-revoke
        >{t.revoke}</Button
      >
    {:else}
      <p class="text">{t.body}</p>
      <Button
        size="lg"
        block
        icon={MessageCircle}
        loading={busy}
        onclick={create}
        data-invite-create
      >
        {t.create}
      </Button>
    {/if}
    {#if !full && h}
      <p class="capacity" data-invite-capacity>{t.capacity(left)}</p>
    {/if}
  </div>
</Card>

<style>
  .body {
    display: grid;
    gap: var(--s3);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .text {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .link {
    display: grid;
    gap: var(--s1);
    padding: var(--s3) var(--s4);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }

  .url {
    font: var(--font-caption);
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    color: var(--ink);
    overflow-wrap: anywhere;
    text-align: left;
  }

  .valid {
    font: var(--font-caption);
    font-weight: 600;
    color: var(--sage-ink);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
  }

  .body > :global(.btn.ghost) {
    justify-self: start;
    margin-inline-start: calc(-1 * var(--s2));
  }

  .capacity {
    font: var(--font-caption);
    color: var(--ink-2);
  }
</style>
