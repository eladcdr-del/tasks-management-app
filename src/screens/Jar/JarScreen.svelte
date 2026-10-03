<script lang="ts">
  // STUB (1.1 → 4.2): placeholder. Step 4.2 replaces this file.
  import { he } from '$lib/i18n/he';
  import ProgressJar from '$components/jar/ProgressJar.svelte';
  import CelebrationOverlay from '$components/jar/CelebrationOverlay.svelte';

  let celebrating = $state(false);
</script>

<section class="stub" data-stub="JarScreen">
  <h1>{he.jar.title}</h1>
  <ProgressJar count={0} target={10} />
  <p>{he.common.comingSoon}</p>
</section>

{#if celebrating}
  <CelebrationOverlay treat="" onClose={() => (celebrating = false)} />
{/if}

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
