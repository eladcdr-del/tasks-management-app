<script lang="ts">
  // STUB (1.1 → 3.1): placeholder. Step 3.1 replaces this file; keep the props contract.
  // `code` is the invite code from #/join/:code.
  import { he } from '$lib/i18n/he';

  interface Props {
    code: string;
  }

  let { code }: Props = $props();
</script>

<section class="stub" data-stub="JoinScreen">
  <h1>{he.onboarding.join.title}</h1>
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
