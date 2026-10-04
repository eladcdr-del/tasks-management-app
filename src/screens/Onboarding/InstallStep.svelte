<script lang="ts">
  // owner: step 3.1. #/onboarding/install: Android Chrome's install prompt (beforeinstallprompt,
  // captured by platform/install.ts) behind one button; otherwise a short manual tip. Skippable;
  // both ways lead on to the notifications step (5.1).
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import { Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { installState, onInstallChange, promptInstall } from '$lib/platform/install';
  import { router } from '$lib/router/router.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';

  const t = he.onboarding.install;
  let inst = $state(installState());
  $effect(() => onInstallChange((s) => (inst = s)));

  const next = () => router.navigate('#/onboarding/notifications', { replace: true });

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') next();
  }
</script>

<OnboardingFrame screen="onboarding-install" title={t.title} lead={t.body}>
  {#snippet hero()}
    <div class="icon" aria-hidden="true"><Smartphone size={40} strokeWidth={1.5} /></div>
  {/snippet}

  {#if inst.installed}
    <p class="done"><CircleCheck size={20} aria-hidden="true" />{t.installed}</p>
  {:else if !inst.canPrompt}
    <div class="manual">
      <p class="manual-title">{t.manualTitle}</p>
      <ol>
        {#each t.manualSteps as step, i (i)}<li>{step}</li>{/each}
      </ol>
    </div>
  {/if}

  {#snippet actions()}
    {#if inst.canPrompt}
      <Button size="lg" block onclick={install} data-install>{t.install}</Button>
      <Button variant="ghost" size="lg" block onclick={next} data-skip>{t.later}</Button>
    {:else}
      <Button size="lg" block onclick={next} data-skip>{t.continue}</Button>
    {/if}
  {/snippet}
</OnboardingFrame>

<style>
  .icon {
    display: grid;
    place-items: center;
    inline-size: 80px;
    block-size: 80px;
    border-radius: var(--r-xl);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .manual {
    display: grid;
    gap: var(--s3);
    padding: var(--card-pad);
    border-radius: var(--r-lg);
    background: var(--surface-2);
  }

  .manual-title {
    font: var(--font-callout);
    font-weight: 600;
    color: var(--ink);
  }

  ol {
    display: grid;
    gap: var(--s2);
    padding-inline-start: var(--s5);
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .done {
    display: flex;
    align-items: center;
    gap: var(--s2);
    font: var(--font-callout);
    color: var(--sage-ink);
  }
</style>
