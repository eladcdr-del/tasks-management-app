<script lang="ts">
  // Home's gentle note for the installed app (Android WebAPK) without notification permission of
  // its own (platform/push.ts appPushPrompt): onboarding asked in the Chrome tab, so Chrome allows
  // them, but Android drops the installed app's notifications until the app itself is allowed.
  //   'ask'      "כדי שההתראות יגיעו גם לאפליקציה המותקנת…" + "אישור התראות" (enablePush, from
  //              the tap: Android's own permission dialog). Allowed: the note goes, "ההתראות הופעלו"
  //   'blocked'  refused (now or before): the way back through Android's app info
  //   ×          "לא עכשיו": away for a few days (dismissAppPushPrompt)
  // Re-read like Settings: back in the foreground, on the Permissions API's change event, and when
  // this device's registration changes.
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import { Banner, Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import {
    appPushPrompt,
    dismissAppPushPrompt,
    enablePush,
    onPushRegistrationChange
  } from '$lib/platform/push';
  import { ui } from '$lib/state/ui.svelte';
  import StepPath from './StepPath.svelte';

  const t = he.notifications;

  let tick = $state(0);
  let dismissed = $state(false);
  /** Refused from this note just now (the permission reads 'denied' from here on anyway). */
  let refused = $state(false);
  let busy = $state(false);

  const prompt = $derived.by(() => {
    void tick;
    return appPushPrompt();
  });
  const shown = $derived(dismissed ? null : prompt && refused ? 'blocked' : prompt);

  async function allow() {
    if (busy) return;
    busy = true;
    try {
      const result = await enablePush();
      if (result === 'enabled') ui.show(t.enabled);
      else if (result === 'denied') refused = true;
      else if (result === 'error' || result === 'unavailable') ui.show(t.failed);
    } finally {
      busy = false;
      tick++;
    }
  }

  function dismiss() {
    dismissAppPushPrompt();
    dismissed = true;
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

{#if shown}
  <div class="app-push" data-app-push={shown}>
    <Banner
      tone="info"
      icon={shown === 'ask' ? BellRing : BellOff}
      ondismiss={dismiss}
      dismissLabel={t.app.dismiss}
    >
      {#if shown === 'ask'}
        <p class="body">{t.app.body}</p>
        <div class="action">
          <Button size="sm" loading={busy} onclick={allow} data-app-push-allow
            >{t.app.action}</Button
          >
        </div>
      {:else}
        <p class="body">{t.app.blocked}</p>
        <p class="steps"><StepPath steps={t.app.blockedSteps} /></p>
      {/if}
    </Banner>
  </div>
{/if}

<style>
  .app-push :global(.banner) {
    padding-block: var(--s3-5);
  }

  .body {
    text-wrap: pretty;
  }

  .action {
    padding-block-start: var(--s2);
  }

  .steps {
    padding-block-start: var(--s1);
    color: var(--ink-2);
  }
</style>
