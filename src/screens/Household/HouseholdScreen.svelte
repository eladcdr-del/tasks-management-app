<script lang="ts">
  // STUB (1.1 → 4.3): placeholder. Step 4.3 replaces this file; keep the props contract.
  import { he } from '$lib/i18n/he';
</script>

<section class="stub" data-stub="HouseholdScreen">
  <h1>{he.household.title}</h1>
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
