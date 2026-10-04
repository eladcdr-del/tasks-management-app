<script lang="ts">
  // owner: step 3.1 (built in 3.1; formerly reserved for 4.3). #/household:
  //   - members (avatar, name, colour, open-task count: counts only, never advice); my own row
  //     opens an inline editor (name, address-as, colour)
  //   - household name (inline edit)
  //   - the invite card (InviteCard.svelte)
  //   - leave the household (Dialog confirm)
  // The gear in the header opens #/settings.
  import Settings from '@lucide/svelte/icons/settings';
  import Pencil from '@lucide/svelte/icons/pencil';
  import DoorOpen from '@lucide/svelte/icons/door-open';
  import House from '@lucide/svelte/icons/house';
  import type { AddressAs, MemberColor } from '$lib/domain/types';
  import {
    Avatar,
    Button,
    Card,
    Dialog,
    IconButton,
    ListRow,
    SectionHeader,
    Skeleton,
    TextField
  } from '$components/ui';
  import Header from '$components/shell/Header.svelte';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import { household } from '$lib/state/household.svelte';
  import { session } from '$lib/state/session.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import ProfileFields from '../Onboarding/ProfileFields.svelte';
  import InviteCard from './InviteCard.svelte';

  const t = he.household;

  // ── my details ──
  let editingMe = $state(false);
  let myName = $state('');
  let myAddress = $state<AddressAs | null>(null);
  let myColor = $state<MemberColor>('terracotta');
  let savingMe = $state(false);
  const takenColors = $derived(
    household.members.filter((m) => m.uid !== household.uid).map((m) => m.color)
  );

  function editMe() {
    const me = household.me;
    if (!me) return;
    myName = me.displayName;
    myAddress = me.addressAs === 'n' ? null : me.addressAs;
    myColor = me.color;
    editingMe = true;
  }

  async function saveMe(e: SubmitEvent) {
    e.preventDefault();
    if (!myName.trim()) return;
    savingMe = true;
    await household.updateMember({
      displayName: myName.trim(),
      color: myColor,
      ...(myAddress ? { addressAs: myAddress } : {})
    });
    savingMe = false;
    editingMe = false;
  }

  // ── household name ──
  let editingName = $state(false);
  let houseName = $state('');

  function editName() {
    houseName = household.household?.name ?? '';
    editingName = true;
  }

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    const name = houseName.trim();
    if (name && name !== household.household?.name) await household.updateHousehold({ name });
    editingName = false;
  }

  // ── leaving ──
  let leaving = $state(false);
  let leaveBusy = $state(false);

  async function leave() {
    leaveBusy = true;
    try {
      await session.leaveHousehold();
    } catch (e) {
      ui.pushError(e);
    } finally {
      leaveBusy = false;
      leaving = false;
    }
  }
</script>

<div class="screen" data-screen="household">
  <Header title={household.household?.name ?? t.title}>
    {#snippet actions()}
      <IconButton
        label={t.settings}
        icon={Settings}
        variant="tonal"
        onclick={() => router.navigate('#/settings')}
        data-settings
      />
    {/snippet}
  </Header>

  <div class="content">
    <section class="section" aria-labelledby="members-title">
      <SectionHeader
        id="members-title"
        title={t.membersTitle}
        count={household.members.length || undefined}
      />
      <Card padding="none">
        {#if !household.loaded}
          <div class="skeleton"><Skeleton variant="text" lines={2} /></div>
        {/if}
        {#each household.members as m (m.uid)}
          {@const mine = m.uid === household.uid}
          {#if mine && editingMe}
            <form class="editor" onsubmit={saveMe} novalidate data-me-editor>
              <h3>{t.editMeTitle}</h3>
              <ProfileFields
                bind:name={myName}
                bind:addressAs={myAddress}
                bind:color={myColor}
                taken={takenColors}
                nameLabel={t.nameLabel}
                showErrors
              />
              <div class="editor-actions">
                <Button type="submit" loading={savingMe} data-save-me>{he.common.save}</Button>
                <Button variant="ghost" onclick={() => (editingMe = false)}
                  >{he.common.cancel}</Button
                >
              </div>
            </form>
          {:else}
            <ListRow
              title={m.displayName}
              subtitle={t.openCount(tasks.countsByMember[m.uid] ?? 0)}
              userText
              onclick={mine ? editMe : undefined}
              class={mine ? 'me-row' : undefined}
            >
              {#snippet leading()}
                <Avatar
                  name={m.displayName}
                  photoURL={m.photoURL}
                  color={m.color}
                  size="md"
                  decorative
                />
              {/snippet}
              {#snippet trailing()}
                {#if mine}
                  <span class="me-tag">{t.me(m)}<Pencil size={16} aria-hidden="true" /></span>
                {/if}
              {/snippet}
            </ListRow>
          {/if}
        {/each}
      </Card>
    </section>

    <InviteCard />

    <section class="section" aria-labelledby="house-title">
      <SectionHeader id="house-title" title={t.houseNameLabel} />
      <Card padding="none">
        {#if editingName}
          <form class="editor" onsubmit={saveName} novalidate>
            <TextField
              label={t.houseNameLabel}
              bind:value={houseName}
              maxlength={40}
              data-field="house-name"
            />
            <div class="editor-actions">
              <Button type="submit">{he.common.save}</Button>
              <Button variant="ghost" onclick={() => (editingName = false)}
                >{he.common.cancel}</Button
              >
            </div>
          </form>
        {:else}
          <ListRow
            title={household.household?.name ?? ''}
            subtitle={t.editHouseName}
            icon={House}
            userText
            chevron
            onclick={editName}
          />
        {/if}
        <ListRow title={t.leave} icon={DoorOpen} flipIcon danger onclick={() => (leaving = true)} />
      </Card>
    </section>
  </div>
</div>

<Dialog
  open={leaving}
  title={t.leaveTitle}
  message={t.leaveBody}
  tone="danger"
  confirmLabel={t.leaveConfirm}
  loading={leaveBusy}
  onConfirm={leave}
  onCancel={() => (leaving = false)}
/>

<style>
  .content {
    display: grid;
    gap: var(--s6);
    padding-inline: var(--screen-pad);
    padding-block-end: var(--s8);
  }

  .section {
    display: grid;
    gap: var(--s2);
  }

  .skeleton {
    padding: var(--s4);
  }

  .me-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .editor {
    display: grid;
    gap: var(--s4);
    padding: var(--card-pad);
  }

  .editor h3 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .editor-actions {
    display: flex;
    gap: var(--s2);
  }
</style>
