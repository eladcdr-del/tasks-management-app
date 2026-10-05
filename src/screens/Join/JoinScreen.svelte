<script lang="ts">
  // owner: step 3.1. #/join/:code — keep the props contract (`code`).
  // repo.previewInvite → "הזמנה ממיכל להצטרף ל״הבית שלנו״" and one join button
  // (session.joinHousehold). Without a profile from the onboarding step, the profile fields sit
  // right here (prefilled from Google), so joining stays one screen. Hebrew errors for
  // not-found / revoked / expired / already-member / full. Signed-out visitors never get here:
  // App.svelte keeps the code and sends them through #/welcome first.
  import UsersRound from '@lucide/svelte/icons/users-round';
  import type { AddressAs, InvitePreview, MemberColor } from '$lib/domain/types';
  import { RepoError } from '$lib/data/repository';
  import { repoErrorMessage } from '$lib/data/firebase/errors';
  import { Banner, Button, Skeleton } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import { session } from '$lib/state/session.svelte';
  import OnboardingFrame from '../Onboarding/OnboardingFrame.svelte';
  import ProfileFields from '../Onboarding/ProfileFields.svelte';

  interface Props {
    code: string;
  }

  let { code }: Props = $props();

  const t = he.onboarding.join;
  type JoinErrorCode = keyof typeof t.errors;

  let preview = $state.raw<InvitePreview | null>(null);
  let loadError = $state<string | null>(null);
  let joinError = $state<string | null>(null);
  let busy = $state(false);
  let tried = $state(false);

  const draft = session.profileDraft;
  const askProfile = draft === null;
  let name = $state(draft?.displayName ?? session.user?.displayName?.split(' ')[0] ?? '');
  let addressAs = $state<AddressAs | null>(draft?.addressAs ?? null);
  let color = $state<MemberColor>(draft?.color ?? 'sage');

  function messageFor(e: unknown): string {
    const err = e instanceof RepoError ? e : new RepoError('unknown');
    return (
      (t.errors as Partial<Record<string, string>>)[err.code as JoinErrorCode] ??
      repoErrorMessage(err)
    );
  }

  $effect(() => {
    const c = code;
    const repo = session.repo;
    if (!repo) return;
    let live = true;
    preview = null;
    loadError = null;
    repo.previewInvite(c).then(
      (p) => live && (preview = p),
      (e) => live && (loadError = messageFor(e))
    );
    return () => {
      live = false;
    };
  });

  async function join(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    tried = true;
    if (askProfile && (!name.trim() || addressAs === null)) return;
    const profile =
      session.profileDraft ??
      ({
        displayName: name.trim(),
        photoURL: session.user?.photoURL ?? null,
        color,
        addressAs: addressAs ?? 'n'
      } as const);
    busy = true;
    joinError = null;
    try {
      await session.joinHousehold(code, profile);
      router.navigate('#/onboarding/install', { replace: true });
    } catch (err) {
      joinError = messageFor(err);
    } finally {
      busy = false;
    }
  }

  const title = $derived(
    preview ? t.invitedBy(preview.inviterName, preview.householdName) : t.title
  );
</script>

<form onsubmit={join} novalidate>
  <OnboardingFrame screen="join" {title} lead={preview ? t.pitch : undefined}>
    {#snippet hero()}
      <div class="icon" aria-hidden="true"><UsersRound size={36} strokeWidth={1.5} /></div>
    {/snippet}

    {#if loadError}
      <Banner tone="danger" title={t.errorTitle} body={loadError} />
    {:else if !preview}
      <div class="loading" aria-busy="true">
        <span class="visually-hidden">{t.loading}</span>
        <Skeleton height="20px" />
        <Skeleton height="20px" width="60%" />
      </div>
    {:else}
      {#if askProfile}
        <h2>{t.aboutYou}</h2>
        <ProfileFields bind:name bind:addressAs bind:color showErrors={tried} />
      {/if}
    {/if}

    {#snippet actions()}
      {#if joinError}<Banner tone="danger" title={t.errorTitle} body={joinError} />{/if}
      {#if loadError}
        <Button variant="secondary" size="lg" block href="#/onboarding/household"
          >{t.createInstead}</Button
        >
      {:else}
        <Button type="submit" size="lg" block loading={busy} disabled={!preview} data-join
          >{t.join}</Button
        >
      {/if}
    {/snippet}
  </OnboardingFrame>
</form>

<style>
  .icon {
    display: grid;
    place-items: center;
    inline-size: 72px;
    block-size: 72px;
    border-radius: var(--r-xl);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .loading {
    display: grid;
    gap: var(--s3);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }
</style>
