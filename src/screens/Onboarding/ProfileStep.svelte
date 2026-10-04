<script lang="ts">
  // owner: step 3.1. #/onboarding/profile: name (prefilled from Google), address-as, colour →
  // session.profileDraft. Then on to the household step, or to `?next=<path>` when another screen
  // sent the user here (e.g. #/join/:code).
  import type { AddressAs, MemberColor } from '$lib/domain/types';
  import { Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import { session } from '$lib/state/session.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import ProfileFields from './ProfileFields.svelte';

  const t = he.onboarding.profile;
  const draft = session.profileDraft;
  let name = $state(draft?.displayName ?? session.user?.displayName?.split(' ')[0] ?? '');
  let addressAs = $state<AddressAs | null>(draft?.addressAs ?? null);
  let color = $state<MemberColor>(draft?.color ?? 'terracotta');
  let tried = $state(false);

  function next(e?: SubmitEvent) {
    e?.preventDefault();
    tried = true;
    if (!name.trim() || addressAs === null) return;
    session.profileDraft = {
      displayName: name.trim(),
      photoURL: session.user?.photoURL ?? null,
      color,
      addressAs
    };
    const target = router.route.query.next;
    router.navigate(target ? `#/${target.replace(/^#?\/?/, '')}` : '#/onboarding/household');
  }
</script>

<form onsubmit={next} novalidate>
  <OnboardingFrame screen="profile" title={t.title} lead={t.subtitle}>
    <ProfileFields bind:name bind:addressAs bind:color showErrors={tried} />
    {#snippet actions()}
      <Button type="submit" size="lg" block data-continue>
        {#snippet children()}{t.continue}{/snippet}
      </Button>
    {/snippet}
  </OnboardingFrame>
</form>
