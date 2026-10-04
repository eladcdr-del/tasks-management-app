<script lang="ts">
  // App root (1.1 → 2.4 → 3.1). Route outlet + FAB + bottom nav + sheet / snackbar hosts + update
  // prompt. Boot gating: the session's phase and ROUTE_META[route].access decide which routes may
  // render (components/shell/gate.ts):
  //   booting       → splash (brand mark on cream, no text; an error + retry if boot failed)
  //   setup         → #/setup                       signed-out → #/welcome
  //   no-household  → onboarding ('auth' routes) and #/join; else #/onboarding/household, or
  //                   #/join/:code for an invite opened while signed out
  //   ready         → 'auth' + 'household' routes; public routes and onboarding/household → #/
  // A disallowed route never renders (the splash stands in for the frame before the redirect).
  // The bottom nav and the FAB step aside while a sheet or the on-screen keyboard is open.
  import { untrack } from 'svelte';
  import { router } from '$lib/router/router.svelte';
  import { he } from '$lib/i18n/he';
  import { rememberPendingInvite, session, takePendingInvite } from '$lib/state/session.svelte';
  import { gateTarget, routeAllowed } from '$components/shell/gate';
  import { viewport } from '$components/shell/viewport.svelte';
  import { startInstallCapture } from '$lib/platform/install';
  import HomeScreen from './screens/Home/HomeScreen.svelte';
  import MemoryScreen from './screens/Memory/MemoryScreen.svelte';
  import JarScreen from './screens/Jar/JarScreen.svelte';
  import HouseholdScreen from './screens/Household/HouseholdScreen.svelte';
  import SettingsScreen from './screens/Settings/SettingsScreen.svelte';
  import TaskDetailScreen from './screens/TaskDetail/TaskDetailScreen.svelte';
  import WelcomeStep from './screens/Onboarding/WelcomeStep.svelte';
  import ProfileStep from './screens/Onboarding/ProfileStep.svelte';
  import HouseholdStep from './screens/Onboarding/HouseholdStep.svelte';
  import InstallStep from './screens/Onboarding/InstallStep.svelte';
  import NotificationsStep from './screens/Onboarding/NotificationsStep.svelte';
  import JoinScreen from './screens/Join/JoinScreen.svelte';
  import SetupScreen from './screens/Setup/SetupScreen.svelte';
  import AppMark from '$components/illustrations/AppMark.svelte';
  import BottomNav from '$components/shell/BottomNav.svelte';
  import DemoBanner from '$components/shell/DemoBanner.svelte';
  import FabHost from '$components/shell/FabHost.svelte';
  import SheetHost from '$components/shell/SheetHost.svelte';
  import SnackbarHost from '$components/shell/SnackbarHost.svelte';
  import UpdatePrompt from '$components/shell/UpdatePrompt.svelte';

  // Dev gallery: lazy, and only in dev / E2E builds. The env check is inlined here (rather than
  // using DEV_ROUTES_ENABLED from the router) so Rolldown drops the chunk from production builds.
  const loadDevGallery =
    import.meta.env.DEV || import.meta.env.VITE_E2E === '1'
      ? () => import('./screens/DevGallery/DevGalleryScreen.svelte')
      : null;

  const phase = $derived(session.phase);
  const route = $derived(router.route);
  const allowed = $derived(routeAllowed(phase, route.name));
  const ready = $derived(phase === 'ready');
  const tab = $derived(ready ? router.meta.tab : undefined);
  const fab = $derived(ready && router.meta.fab);
  const demoBanner = $derived(session.mode === 'demo' && route.name !== 'devGallery');
  const chromeHidden = $derived(viewport.keyboardOpen || router.sheet !== null);

  startInstallCapture();
  viewport.start();

  // Redirect a route the phase does not allow (replace: the wrong screen never enters history).
  $effect(() => {
    if (allowed || phase === 'booting') return;
    const current = route;
    untrack(() => {
      if (phase === 'signed-out' && current.name === 'join') {
        rememberPendingInvite(current.params.code); // back to #/join/:code after signing in
      }
      const target = gateTarget(
        phase,
        current.name,
        phase === 'no-household' ? takePendingInvite() : null
      );
      if (target) router.navigate(target, { replace: true });
    });
  });
</script>

{#if phase === 'booting' || !allowed}
  <div class="splash" data-phase={phase}>
    <AppMark size={88} />
    {#if session.error}
      <div class="boot-error" role="alert">
        <p>{he.errors.generic}</p>
        <button type="button" onclick={() => location.reload()}>{he.common.retry}</button>
      </div>
    {/if}
  </div>
{:else}
  <div class="app" class:with-nav={tab !== undefined} data-phase={phase}>
    {#if demoBanner}
      <DemoBanner />
    {/if}

    <main>
      {#if route.name === 'home' || route.name === 'new'}
        <HomeScreen />
      {:else if route.name === 'memory'}
        <MemoryScreen />
      {:else if route.name === 'jar'}
        <JarScreen />
      {:else if route.name === 'household'}
        <HouseholdScreen />
      {:else if route.name === 'settings'}
        <SettingsScreen />
      {:else if route.name === 'task'}
        {#key route.params.id}
          <TaskDetailScreen id={route.params.id} />
        {/key}
      {:else if route.name === 'welcome'}
        <WelcomeStep />
      {:else if route.name === 'onboardingProfile'}
        <ProfileStep />
      {:else if route.name === 'onboardingHousehold'}
        <HouseholdStep />
      {:else if route.name === 'onboardingInstall'}
        <InstallStep />
      {:else if route.name === 'onboardingNotifications'}
        <NotificationsStep />
      {:else if route.name === 'join'}
        <JoinScreen code={route.params.code} />
      {:else if route.name === 'setup'}
        <SetupScreen />
      {:else if route.name === 'devGallery' && loadDevGallery}
        {#await loadDevGallery() then gallery}
          <gallery.default />
        {/await}
      {/if}
    </main>

    {#if fab}
      <FabHost hidden={chromeHidden} />
    {/if}

    {#if tab !== undefined}
      <BottomNav active={tab} hidden={chromeHidden} />
    {/if}
  </div>

  {#if ready}
    <SheetHost />
  {/if}
{/if}

<SnackbarHost aboveNav={tab !== undefined && !chromeHidden} />
<UpdatePrompt />

<style>
  .app {
    min-block-size: 100dvh;
  }

  main {
    max-inline-size: var(--content-max);
    margin-inline: auto;
  }

  .with-nav main {
    padding-block-end: calc(var(--nav-h) + var(--safe-bottom));
  }

  .splash {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s6);
    min-block-size: 100dvh;
    padding: var(--safe-top) var(--screen-pad) var(--safe-bottom);
    background: var(--bg);
  }

  .boot-error {
    display: grid;
    justify-items: center;
    gap: var(--s3);
    text-align: center;
  }

  .boot-error p {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .boot-error button {
    min-block-size: var(--tap-min);
    padding-inline: var(--s5);
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    font: var(--font-callout);
    font-weight: 600;
  }
</style>
