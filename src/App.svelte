<script lang="ts">
  // App root (1.1 → 2.4). Route outlet + bottom nav + sheet / snackbar hosts + update prompt.
  // Step 2.4 adds boot gating (adapter selection, auth, onboarding/setup redirects) only.
  import { router } from '$lib/router/router.svelte';
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
  import BottomNav from '$components/shell/BottomNav.svelte';
  import SheetHost from '$components/shell/SheetHost.svelte';
  import SnackbarHost from '$components/shell/SnackbarHost.svelte';
  import UpdatePrompt from '$components/shell/UpdatePrompt.svelte';

  // Dev gallery: lazy, and only in dev / E2E builds. The env check is inlined here (rather than
  // using DEV_ROUTES_ENABLED from the router) so Rolldown drops the chunk from production builds.
  const loadDevGallery =
    import.meta.env.DEV || import.meta.env.VITE_E2E === '1'
      ? () => import('./screens/DevGallery/DevGalleryScreen.svelte')
      : null;

  const route = $derived(router.route);
  const tab = $derived(router.meta.tab);
</script>

<div class="app" class:with-nav={tab !== undefined}>
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

  {#if tab !== undefined}
    <BottomNav active={tab} />
  {/if}
</div>

<SheetHost />
<SnackbarHost />
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
</style>
