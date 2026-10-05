<script lang="ts">
  // owner: step 3.1. #/onboarding/household: create a household ("איך נקרא לבית?", default
  // "הבית שלנו") → session.createHousehold, or "יש לי קישור הזמנה" (paste a link or code) →
  // #/join/<code>. Uses session.profileDraft (kept in sessionStorage across reloads); without one
  // (the boot gate lands a fresh sign-in here) it sends the user to the profile step first, so a
  // house is never created with a silent neutral "את/ה" founder.
  import { untrack } from 'svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Link from '@lucide/svelte/icons/link';
  import { RepoError } from '$lib/data/repository';
  import { repoErrorMessage } from '$lib/data/firebase/errors';
  import { Avatar, Banner, Button, TextField } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { parseInviteInput } from '$lib/platform/share';
  import { router } from '$lib/router/router.svelte';
  import { session } from '$lib/state/session.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';

  const t = he.onboarding.household;
  let name = $state(t.defaultName);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let joining = $state(false);
  let link = $state('');
  let linkError = $state<string | undefined>();

  const profile = $derived(session.profileDraft);
  const toProfile = () => router.navigate('#/onboarding/profile', { replace: true });

  // On arrival only (creating the house later must not bounce anywhere).
  $effect(() => {
    untrack(() => {
      if (!session.profileDraft) toProfile();
    });
  });

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    if (!profile) {
      toProfile();
      return;
    }
    busy = true;
    error = null;
    try {
      await session.createHousehold(name.trim() || t.defaultName, profile);
      router.navigate('#/onboarding/install', { replace: true });
    } catch (err) {
      error = repoErrorMessage(err instanceof RepoError ? err : new RepoError('unknown'));
    } finally {
      busy = false;
    }
  }

  function join(e: SubmitEvent) {
    e.preventDefault();
    const code = parseInviteInput(link);
    if (!code) {
      linkError = t.inviteInvalid;
      return;
    }
    router.navigate(`#/join/${encodeURIComponent(code)}`);
  }
</script>

<OnboardingFrame screen="onboarding-household" title={t.title} lead={t.subtitle}>
  {#if profile}
    <a class="me" href="#/onboarding/profile" data-edit-profile>
      <Avatar
        name={profile.displayName}
        photoURL={profile.photoURL}
        color={profile.color}
        size="md"
        decorative
      />
      <span class="me-name" dir="auto">{profile.displayName}</span>
      <span class="me-edit"><Pencil size={16} aria-hidden="true" />{t.editMe}</span>
    </a>
  {/if}

  <form class="create" onsubmit={create} novalidate>
    <TextField
      label={t.nameLabel}
      bind:value={name}
      maxlength={40}
      enterkeyhint="go"
      data-field="household-name"
    />
    {#if error}<Banner tone="danger" title={t.errorTitle} body={error} />{/if}
    <Button type="submit" size="lg" block loading={busy} data-create>{t.create}</Button>
  </form>

  <div class="or" aria-hidden="true"><span>{t.or}</span></div>

  {#if joining}
    <form class="join" onsubmit={join} novalidate>
      <TextField
        label={t.inviteLabel}
        placeholder={t.invitePlaceholder}
        bind:value={link}
        error={linkError}
        oninput={() => (linkError = undefined)}
        autocomplete="off"
        enterkeyhint="go"
        data-field="invite"
      />
      <Button type="submit" variant="secondary" size="lg" block data-join-link>{t.inviteGo}</Button>
    </form>
  {:else}
    <Button
      variant="ghost"
      size="lg"
      block
      icon={Link}
      onclick={() => (joining = true)}
      data-have-invite
    >
      {t.haveInvite}
    </Button>
  {/if}
</OnboardingFrame>

<style>
  .me {
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 64px;
    padding: var(--s2) var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    color: var(--ink);
    text-decoration: none;
  }

  .me-name {
    flex: 1;
    min-inline-size: 0;
    font: var(--font-body);
    font-weight: 600;
  }

  .me-edit {
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    font: var(--font-callout);
    color: var(--accent-ink);
  }

  .create,
  .join {
    display: grid;
    gap: var(--s4);
  }

  .or {
    display: flex;
    align-items: center;
    gap: var(--s3);
    font: var(--font-caption);
    color: var(--ink-3);
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-block-start: 1px solid var(--line);
  }
</style>
