<script lang="ts">
  // STUB (1.1 → 3.3): placeholder. Step 3.3 replaces this file; keep the props contract.
  // `id` is the task id from #/task/:id.
  import { he } from '$lib/i18n/he';
  import { router } from '$lib/router/router.svelte';

  interface Props {
    id: string;
  }

  let { id }: Props = $props();
</script>

<section class="stub" data-stub="TaskDetailScreen" data-task-id={id}>
  <button type="button" class="back" onclick={() => router.back('/')}>{he.common.back}</button>
  <h1>{he.task.detailTitle}</h1>
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
