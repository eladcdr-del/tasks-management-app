<script lang="ts">
  // owner: step 5.1. The notifications block at the top of Settings (Blueprint §9):
  //   status   one line per pushStatus() state (granted / unregistered / default / denied /
  //            unsupported / not-configured / demo); "granted" only once this device is registered
  //            for the household, so a failed registration never reads as "active"
  //   enable   "הפעלת התראות" while the permission has not been asked yet, "הפעלה מחדש" when it
  //            is allowed but this device is not registered (platform/push.ts)
  //   denied   how to allow notifications again: in the installed app through Android's app info
  //            (long-press the icon → פרטי האפליקציה → התראות), in a tab through the site info
  //   types    my member.notify switches {requests, reminders, partnerDone, weekly}; they are
  //            per person (all my devices), so they show in every state, the demo included
  // The status is re-read when the app returns to the foreground (the user may have changed the
  // permission in the system or site settings), on the Permissions API's change event, and when
  // this device's registration changes (UpdatePrompt registers a re-allowed permission on its own).
  import Bell from '@lucide/svelte/icons/bell';
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import type { NotifyPrefs } from '$lib/domain/types';
  import { Button, Card, SectionHeader, Toggle } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { installState } from '$lib/platform/install';
  import {
    enablePush,
    onPushRegistrationChange,
    pushStatus,
    type PushStatus
  } from '$lib/platform/push';
  import { household } from '$lib/state/household.svelte';
  import { ui } from '$lib/state/ui.svelte';

  const t = he.notifications;
  const TYPES = ['requests', 'reminders', 'partnerDone', 'weekly'] as const;

  /** Bumped whenever the permission or the registration may have changed (neither is reactive). */
  let tick = $state(0);
  const support: PushStatus = $derived.by(() => {
    void tick;
    return pushStatus();
  });
  const me = $derived(household.me);
  const deniedSteps = installState().installed ? t.deniedStepsApp : t.deniedSteps;

  const STATUS: Record<PushStatus, string> = {
    granted: t.status.granted,
    default: t.status.default,
    unregistered: t.status.unregistered,
    denied: t.status.denied,
    unsupported: t.status.unsupported,
    'not-configured': t.status.notConfigured,
    demo: t.status.demo
  };
  const StatusIcon = $derived(
    support === 'granted' ? BellRing : support === 'denied' ? BellOff : Bell
  );

  let busy = $state(false);

  async function enable() {
    if (busy) return;
    busy = true;
    try {
      const result = await enablePush();
      if (result === 'enabled') ui.show(t.enabled);
      else if (result === 'error' || result === 'unavailable') ui.show(t.failed);
    } finally {
      busy = false;
      tick++;
    }
  }

  function setType(key: keyof NotifyPrefs, on: boolean) {
    if (!me || me.notify[key] === on) return;
    void household.updateMember({ notify: { ...me.notify, [key]: on } });
  }

  $effect(() => {
    const recheck = () => tick++;
    const stopReg = onPushRegistrationChange(recheck);
    document.addEventListener('visibilitychange', recheck);
    let status: PermissionStatus | null = null;
    let disposed = false;
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        if (disposed) return;
        status = s;
        s.addEventListener('change', recheck);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stopReg();
      document.removeEventListener('visibilitychange', recheck);
      status?.removeEventListener('change', recheck);
    };
  });
</script>

<section class="section" aria-labelledby="s-notifications" data-notifications={support}>
  <SectionHeader id="s-notifications" title={t.title} />
  <Card padding="md">
    <div class="stack">
      <div class="status" data-tone={support}>
        <span class="status-icon" aria-hidden="true"
          ><StatusIcon size={20} strokeWidth={1.75} /></span
        >
        <p data-push-status>{STATUS[support]}</p>
      </div>

      {#if support === 'default' || support === 'unregistered'}
        <Button block loading={busy} onclick={enable} data-enable-push
          >{support === 'default' ? t.enable : t.reconnect}</Button
        >
      {:else if support === 'denied'}
        <div class="help" data-denied-help>
          <p class="help-title">{t.deniedHelpTitle}</p>
          <ol>
            {#each deniedSteps as step, i (i)}<li>{step}</li>{/each}
          </ol>
        </div>
      {/if}
    </div>
  </Card>

  {#if me}
    <Card padding="md">
      <div class="stack">
        <p class="types-title">{t.typesTitle}</p>
        {#each TYPES as key (key)}
          <Toggle
            label={t.types[key].label}
            description={t.types[key].desc}
            checked={me.notify[key]}
            onchange={(on) => setType(key, on)}
          />
        {/each}
        <p class="quiet">{t.quietHours}</p>
      </div>
    </Card>
  {/if}
</section>

<style>
  .section {
    display: grid;
    gap: var(--s2);
  }

  .stack {
    display: grid;
    gap: var(--s4);
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--s3);
    font: var(--font-callout);
    color: var(--ink);
  }

  .status-icon {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--ink-2);
  }

  [data-tone='granted'] .status-icon {
    background: var(--success-soft);
    color: var(--sage-ink);
  }

  [data-tone='denied'] .status-icon,
  [data-tone='unregistered'] .status-icon {
    background: var(--warn-soft);
    color: var(--warn-ink);
  }

  .help {
    display: grid;
    gap: var(--s2);
    padding: var(--s4);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }

  .help-title,
  .types-title {
    font: var(--font-callout);
    font-weight: 600;
    color: var(--ink);
  }

  ol {
    display: grid;
    gap: var(--s1-5);
    padding-inline-start: var(--s5);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .quiet {
    font: var(--font-caption);
    color: var(--ink-3);
  }
</style>
