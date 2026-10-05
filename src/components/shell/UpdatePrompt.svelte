<script lang="ts">
  // owner: step 5.1. The always-mounted PWA host (App.svelte renders it once):
  //   1. Registers the service worker (virtual:pwa-register, registerType 'prompt') in production
  //      and E2E builds, never on the dev server. Checks for a new version hourly and whenever
  //      the app comes back to the foreground.
  //   2. A waiting version shows the snackbar "גרסה חדשה מוכנה · עדכון" (it stays until acted on).
  //      It also applies itself when the document becomes hidden with no sheet open, so a
  //      half-written task is never lost to a reload.
  //   3. Push: when the household is ready and permission is already granted, refreshes the FCM
  //      token silently (platform/push.ts); leaving the household forgets the registration. A
  //      permission re-allowed while the app is open registers on the spot (watchPushPermission),
  //      and the page answers the SW's push hand-off pings (listenForSwMessages).
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import { session, type Phase } from '$lib/state/session.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import {
    forgetPushRegistration,
    listenForSwMessages,
    refreshPush,
    watchPushPermission
  } from '$lib/platform/push';

  const CHECK_EVERY_MS = 60 * 60 * 1000;

  let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
  let waiting = false;
  let snackId: number | null = null;
  let applying = false;

  function apply() {
    if (applying || !applyUpdate) return;
    applying = true;
    void applyUpdate(true);
  }

  onMount(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (registration && navigator.onLine !== false) void registration.update().catch(() => {});
    };
    const timer = setInterval(check, CHECK_EVERY_MS);

    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        waiting = true;
        if (snackId === null) {
          snackId = ui.show(he.update.ready, {
            action: he.update.action,
            onAction: apply,
            duration: 0
          });
        }
      },
      onRegisteredSW(_url, reg) {
        registration = reg;
      },
      onRegisterError(e: unknown) {
        console.warn('[homecare] service worker registration failed', e);
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (waiting && router.sheet === null) apply();
      } else {
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const stopSw = listenForSwMessages();
    const stopPermission = watchPushPermission();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      stopSw();
      stopPermission();
    };
  });

  // Push token upkeep, keyed on the household (re-runs when it changes).
  let lastPhase: Phase = 'booting';
  $effect(() => {
    const phase = session.phase;
    const hid = session.householdId;
    if (phase === 'ready' && hid !== null) void refreshPush();
    else if (lastPhase === 'ready' && phase === 'no-household') forgetPushRegistration();
    lastPhase = phase;
  });
</script>
