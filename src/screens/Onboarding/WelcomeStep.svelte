<script lang="ts">
  // STUB (1.1 → 3.1): placeholder. Step 3.1 replaces this file; keep the props contract.
  import { he } from '$lib/i18n/he';
</script>

<section class="stub" data-stub="WelcomeStep">
  <h1>{he.onboarding.welcome.title}</h1>
  <p>{he.common.comingSoon}</p>
</section>

<style>
  .stub {
    display: grid;
    gap: var(--s3);
    padding-block: calc(var(--safe-top) + var(--s7)) var(--s7);
    padding-inline: var(--screen-pad);
  }

  h1 {
    font: var(--font-title);
    color: var(--ink);
  }

  p {
    font: var(--font-callout);
    color: var(--ink-2);
  }
</style>
