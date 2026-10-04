<script lang="ts">
  // owner: step 3.1 (built in 3.1; formerly reserved for 4.3). #/settings:
  //   notifications (<NotificationSettings />, owned by 5.1) · appearance (theme, haptics) ·
  //   install hint · demo mode ("להציג כ…" between members, exit) · account (sign out) ·
  //   version + sync status.
  import LogOut from '@lucide/svelte/icons/log-out';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Info from '@lucide/svelte/icons/info';
  import type { Theme } from '$lib/platform/theme';
  import {
    Avatar,
    Button,
    Card,
    ChoiceRow,
    ListRow,
    SectionHeader,
    SegmentedControl,
    SyncIndicator,
    Toggle
  } from '$components/ui';
  import Header from '$components/shell/Header.svelte';
  import NotificationSettings from '$components/settings/NotificationSettings.svelte';
  import { he } from '$lib/i18n/he';
  import { exitDemo, isDemoRepository } from '$lib/data/select';
  import { installState, onInstallChange, promptInstall } from '$lib/platform/install';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { session } from '$lib/state/session.svelte';
  import { sync } from '$lib/state/sync.svelte';
  import { ui } from '$lib/state/ui.svelte';

  const t = he.settings;
  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'system', label: t.theme.system },
    { value: 'light', label: t.theme.light },
    { value: 'dark', label: t.theme.dark }
  ];

  let inst = $state(installState());
  $effect(() => onInstallChange((s) => (inst = s)));

  const demoRepo = $derived(isDemoRepository(session.repo) ? session.repo : null);
  const me = $derived(household.me);

  function actAs(uid: string) {
    demoRepo?.actAs(uid);
  }

  async function signOut() {
    try {
      await session.signOut();
    } catch (e) {
      ui.pushError(e);
    }
  }
</script>

<div class="screen" data-screen="settings">
  <Header title={t.title} onBack={() => router.back('/household')} />

  <div class="content">
    <NotificationSettings />

    <section class="section" aria-labelledby="s-appearance">
      <SectionHeader id="s-appearance" title={t.appearance} />
      <Card padding="md">
        <div class="stack">
          <SegmentedControl
            label={t.themeLabel}
            options={themeOptions}
            value={prefs.theme}
            onchange={(v) => prefs.setTheme(v)}
            haptics
          />
          <Toggle
            label={t.haptics}
            description={t.hapticsHint}
            checked={prefs.haptics}
            onchange={(on) => prefs.setHaptics(on)}
          />
        </div>
      </Card>
    </section>

    {#if session.mode === 'demo'}
      <section class="section" aria-labelledby="s-demo" data-demo-section>
        <SectionHeader id="s-demo" title={t.demo.title} />
        <Card padding="none">
          {#if demoRepo && household.members.length > 1}
            <p class="hint">{t.demo.hint}</p>
            <div role="radiogroup" aria-label={t.demo.actAs}>
              {#each household.members as m (m.uid)}
                <ChoiceRow
                  name="act-as"
                  value={m.uid}
                  title={m.displayName}
                  userText
                  checked={m.uid === household.uid}
                  onselect={() => actAs(m.uid)}
                >
                  {#snippet leading()}
                    <Avatar
                      name={m.displayName}
                      photoURL={m.photoURL}
                      color={m.color}
                      size="sm"
                      decorative
                    />
                  {/snippet}
                </ChoiceRow>
              {/each}
            </div>
          {/if}
          <ListRow title={t.demo.exit} icon={LogOut} flipIcon onclick={() => exitDemo()} />
        </Card>
      </section>
    {/if}

    <section class="section" aria-labelledby="s-account">
      <SectionHeader id="s-account" title={t.account} />
      <Card padding="none">
        {#if me}
          <ListRow title={me.displayName} subtitle={session.user?.email || undefined} userText>
            {#snippet leading()}
              <Avatar
                name={me.displayName}
                photoURL={me.photoURL}
                color={me.color}
                size="sm"
                decorative
              />
            {/snippet}
          </ListRow>
        {/if}
        <ListRow title={t.signOut} icon={LogOut} flipIcon danger onclick={signOut} />
      </Card>
    </section>

    <section class="section" aria-labelledby="s-about">
      <SectionHeader id="s-about" title={t.about} />
      <Card padding="none">
        {#if inst.installed}
          <ListRow title={t.install.installed} icon={Smartphone} />
        {:else if inst.canPrompt}
          <ListRow title={t.install.title} icon={Smartphone}>
            {#snippet trailing()}
              <Button size="sm" onclick={() => promptInstall()}>{t.install.action}</Button>
            {/snippet}
          </ListRow>
        {:else}
          <ListRow title={t.install.title} subtitle={t.install.hint} icon={Smartphone} />
        {/if}
        <ListRow
          title={he.common.appName}
          subtitle={t.version(__APP_VERSION__, __APP_COMMIT__)}
          icon={Info}
        >
          {#snippet trailing()}
            <SyncIndicator status={sync.status} pending={sync.pendingWrites} />
          {/snippet}
        </ListRow>
      </Card>
    </section>
  </div>
</div>

<style>
  .content {
    display: grid;
    gap: var(--s6);
    padding-inline: var(--screen-pad);
    padding-block-end: calc(var(--safe-bottom) + var(--s8));
  }

  .section {
    display: grid;
    gap: var(--s2);
  }

  .stack {
    display: grid;
    gap: var(--s4);
  }

  .hint {
    padding: var(--s4) var(--s4) var(--s1);
    font: var(--font-caption);
    color: var(--ink-2);
  }
</style>
