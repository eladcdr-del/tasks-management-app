<script lang="ts">
  // owner: step 5.1. The notifications block at the top of Settings (Blueprint §9):
  //   status   one line per pushStatus() state (granted / unregistered / default / denied /
  //            unsupported / not-configured / demo); "granted" only once this device is registered
  //            for the household, so a failed registration never reads as "active". In the installed
  //            app without its own permission while push was on for the household in the browser
  //            (appPermissionMissing), the line says it must be allowed here once
  //   enable   "הפעלת התראות" while the permission has not been asked yet ("אישור התראות" in that
  //            installed-app case), "הפעלה מחדש" when it is allowed but this device is not
  //            registered (platform/push.ts)
  //   test     "בדיקת התראות" whenever the permission is granted (registered or not): a notification
  //            from this phone at once, and a real push from the notifier within minutes
  //            (testPush, which registers this device first when needed). A panel then says what
  //            was sent, how to allow notifications if the first did not show, and to tell us if
  //            only the second did not come
  //   denied   how to allow notifications again: in the installed app through Android's app info
  //            (long-press the icon → פרטי האפליקציה → התראות), in a tab through the site info
  //   types    my member.notify switches, one per push kind: requests, newTasks, reminders, soon,
  //            overdue, partnerDone, weekly (in that order); they are per person (all my devices),
  //            so they show in every state, the demo included
  // The status is re-read when the app returns to the foreground (the user may have changed the
  // permission in the system or site settings), on the Permissions API's change event, and when
  // this device's registration changes (UpdatePrompt registers a re-allowed permission on its own).
  import Bell from '@lucide/svelte/icons/bell';
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import Send from '@lucide/svelte/icons/send';
  import type { NotifyPrefs } from '$lib/domain/types';
  import { Button, Card, SectionHeader, Toggle } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { installState } from '$lib/platform/install';
  import {
    appPermissionMissing,
    enablePush,
    onPushRegistrationChange,
    pushStatus,
    testPush,
    type PushStatus,
    type PushTestResult
  } from '$lib/platform/push';
  import { household } from '$lib/state/household.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import StepPath from './StepPath.svelte';

  const t = he.notifications;
  const TYPES = [
    'requests',
    'newTasks',
    'reminders',
    'soon',
    'overdue',
    'partnerDone',
    'weekly'
  ] as const satisfies readonly (keyof NotifyPrefs)[];

  /** Bumped whenever the permission or the registration may have changed (neither is reactive). */
  let tick = $state(0);
  const support: PushStatus = $derived.by(() => {
    void tick;
    return pushStatus();
  });
  /** The installed app has not been allowed yet, although push was on here in the browser. */
  const appAsk = $derived.by(() => {
    void tick;
    return support === 'default' && appPermissionMissing() === 'ask';
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
  const canTest = $derived(support === 'granted' || support === 'unregistered');

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

  let testing = $state(false);
  let tested = $state<PushTestResult | null>(null);
  const testLead = $derived(
    !tested
      ? ''
      : tested.local
        ? tested.server
          ? t.test.sent
          : t.test.sentLocalOnly
        : tested.server
          ? t.test.sentServerOnly
          : t.test.failed
  );

  async function runTest() {
    if (testing) return;
    testing = true;
    try {
      tested = await testPush();
    } finally {
      testing = false;
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
      <div class="status" data-tone={appAsk ? 'unregistered' : support}>
        <span class="status-icon" aria-hidden="true"
          ><StatusIcon size={20} strokeWidth={1.75} /></span
        >
        <p data-push-status>{appAsk ? t.app.body : STATUS[support]}</p>
      </div>

      {#if support === 'default' || support === 'unregistered'}
        <Button block loading={busy} onclick={enable} data-enable-push
          >{support === 'unregistered' ? t.reconnect : appAsk ? t.app.action : t.enable}</Button
        >
      {:else if support === 'denied'}
        <div class="help" data-denied-help>
          <p class="help-title">{t.deniedHelpTitle}</p>
          <ol>
            {#each deniedSteps as step, i (i)}<li>{step}</li>{/each}
          </ol>
        </div>
      {/if}

      {#if canTest}
        <Button
          variant="secondary"
          block
          icon={Send}
          flipIcon
          loading={testing}
          onclick={runTest}
          data-test-push>{t.test.action}</Button
        >
      {/if}
      <div class="result-region" role="status">
        {#if tested && canTest}
          <div
            class="result"
            data-test-result={`${tested.local ? 'local' : 'no-local'} ${tested.server ? 'server' : 'no-server'}`}
          >
            <p class="result-lead">{testLead}</p>
            <div class="result-help">
              <p>{tested.local ? t.test.noFirst : t.test.blocked}</p>
              <ul>
                {#each t.test.paths as path (path.label)}
                  <li><StepPath label={path.label} steps={path.steps} /></li>
                {/each}
              </ul>
            </div>
            {#if tested.server}<p class="result-help">{t.test.noSecond(me ?? 'n')}</p>{/if}
          </div>
        {/if}
      </div>
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

  .help,
  .result {
    display: grid;
    gap: var(--s2);
    padding: var(--s4);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }

  .help-title,
  .types-title,
  .result-lead {
    font: var(--font-callout);
    font-weight: 600;
    color: var(--ink);
  }

  .result-lead,
  .result-help {
    text-wrap: pretty;
  }

  ol {
    display: grid;
    gap: var(--s1-5);
    padding-inline-start: var(--s5);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  /* An empty live region takes no room in the stack. */
  .result-region:empty {
    display: none;
  }

  .result {
    gap: var(--s3);
  }

  .result-help {
    display: grid;
    gap: var(--s1-5);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .result-help ul {
    display: grid;
    gap: var(--s1-5);
    padding-inline-start: var(--s5);
    list-style: disc;
  }

  .quiet {
    font: var(--font-caption);
    color: var(--ink-3);
  }
</style>
