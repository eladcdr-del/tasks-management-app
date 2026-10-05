<script lang="ts">
  // owner: step 3.1. #/welcome: brand hero, one-line value prop, "כניסה עם Google". Opened from an
  // invite link (App.svelte keeps the code while signed out), it first says that they were
  // invited, so the generic sign-in page does not look like the wrong link.
  // After a successful sign-in the boot gate takes over (no household → onboarding, member → Home,
  // a pending invite → #/join/:code); a first-timer without a pending invite goes to the profile
  // step first. Errors show inline (Banner); a closed popup stays quiet.
  // Auth starts without Google's sign-in script (init.ts), so launches never wait for it. In
  // Firebase mode this screen preconnects to Google and the auth domain and loads the script in the
  // background (platform/googleSignIn.ts), so the first tap opens Google's popup at once.
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import { AppMark } from '$components/illustrations';
  import { Banner, Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { RepoError } from '$lib/data/repository';
  import { isCancelled, repoErrorMessage } from '$lib/data/firebase/errors';
  import { router } from '$lib/router/router.svelte';
  import { warmGoogleSignIn } from '$lib/platform/googleSignIn';
  import { peekPendingInvite, session } from '$lib/state/session.svelte';
  import { firebaseConfig } from '../../../firebase-config';
  import OnboardingFrame from './OnboardingFrame.svelte';

  const t = he.onboarding.welcome;
  /** Kept by App.svelte before it sent the visitor here (sessionStorage, read once). */
  const invited = peekPendingInvite() !== null;
  const preconnect =
    session.mode === 'firebase'
      ? ['https://apis.google.com', `https://${firebaseConfig.authDomain}`]
      : [];
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (session.mode === 'firebase') warmGoogleSignIn();
  });

  async function signIn() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.signIn();
      if (
        session.phase === 'no-household' &&
        !peekPendingInvite() &&
        router.route.name !== 'join'
      ) {
        router.navigate('#/onboarding/profile', { replace: true });
      }
    } catch (e) {
      const err = e instanceof RepoError ? e : new RepoError('unknown');
      if (!isCancelled(err)) error = repoErrorMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  {#each preconnect as origin (origin)}
    <link rel="preconnect" href={origin} />
  {/each}
</svelte:head>

<OnboardingFrame screen="welcome" title={t.title} lead={t.valueProp} centered>
  {#snippet hero()}
    <div class="mark">
      <AppMark size={96} tile />
      <span class="brand" dir="ltr">{he.common.appName}</span>
    </div>
  {/snippet}

  {#snippet actions()}
    {#if invited}
      <Banner tone="info" icon={MailOpen} title={t.invitedTitle} body={t.invitedBody} />
    {/if}
    {#if error}
      <Banner tone="danger" title={t.errorTitle} body={error} />
    {/if}
    <Button size="lg" block loading={busy} onclick={signIn} data-sign-in>
      {#snippet children()}
        <span class="g" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"
            ><path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            /><path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            /><path
              fill="#FBBC05"
              d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
            /><path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            /></svg
          >
        </span>
        {t.signIn}
      {/snippet}
    </Button>
    <p class="privacy">{t.privacy}</p>
  {/snippet}
</OnboardingFrame>

<style>
  .mark {
    display: grid;
    justify-items: center;
    gap: var(--s3);
    padding-block-start: var(--s6);
  }

  /* The app icon, lifted slightly off the page like on a home screen. */
  .mark :global(.appmark) {
    filter: drop-shadow(0 10px 18px rgb(160 72 34 / 0.22));
  }

  .brand {
    font: var(--font-headline);
    letter-spacing: 0.01em;
    color: var(--accent-ink);
  }

  .g {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-inline-end: var(--s1);
    border-radius: var(--r-pill);
    background: #fff;
  }

  .privacy {
    font: var(--font-caption);
    color: var(--ink-2);
    text-align: center;
  }
</style>
