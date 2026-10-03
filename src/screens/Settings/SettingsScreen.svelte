<script lang="ts">
  // STUB (1.1 → 4.3): placeholder. Step 4.3 replaces this file and keeps <NotificationSettings />
  // (owned by 5.1) in the notifications section.
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';
  import NotificationSettings from '$components/settings/NotificationSettings.svelte';
</script>

<section class="stub" data-stub="SettingsScreen">
  <button type="button" class="back" onclick={() => router.back('/household')}
    >{he.common.back}</button
  >
  <h1>{he.settings.title}</h1>
  <NotificationSettings />
  <p>{he.common.comingSoon}</p>
</section>

<style>
  .stub {
    display: grid;
    gap: var(--s3);
    padding-block: calc(var(--safe-top) + var(--s4)) var(--s7);
    padding-inline: var(--screen-pad);
  }

  .back {
    justify-self: start;
    min-block-size: var(--tap-min);
    padding-inline: var(--s3);
    margin-inline-start: calc(-1 * var(--s3));
    border-radius: var(--r-pill);
    color: var(--accent-ink);
    font: var(--font-callout);
    font-weight: 500;
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
