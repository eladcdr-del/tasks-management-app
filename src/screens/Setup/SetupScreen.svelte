<script lang="ts">
  // owner: step 3.1. #/setup: firebase-config.ts is empty and the demo is off. A friendly
  // explanation, the SETUP.md guide on GitHub, and "נסו את הדמו" (select.ts enterDemo).
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { Setup } from '$components/illustrations';
  import { Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { DEMO_ENTRY_HREF, enterDemo } from '$lib/data/select';
  import OnboardingFrame from '../Onboarding/OnboardingFrame.svelte';

  const t = he.setup;

  function tryDemo(e: MouseEvent) {
    e.preventDefault();
    enterDemo();
  }
</script>

<OnboardingFrame screen="setup" title={t.title} lead={t.body} centered>
  {#snippet hero()}
    <Setup class="illo" />
  {/snippet}

  {#snippet actions()}
    <Button size="lg" block href={DEMO_ENTRY_HREF} onclick={tryDemo} data-try-demo
      >{t.tryDemo}</Button
    >
    <p class="hint">{t.demoHint}</p>
    <Button
      variant="ghost"
      size="lg"
      block
      href={t.guideUrl}
      target="_blank"
      rel="noopener noreferrer"
      iconEnd={ExternalLink}
      data-setup-guide
    >
      {t.guide}
    </Button>
  {/snippet}
</OnboardingFrame>

<style>
  :global(.illo) {
    inline-size: min(220px, 60vw);
    block-size: auto;
  }

  .hint {
    font: var(--font-caption);
    color: var(--ink-3);
    text-align: center;
    text-wrap: pretty;
  }
</style>
