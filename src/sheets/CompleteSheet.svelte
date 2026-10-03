<script lang="ts">
  // STUB (1.1 → 3.3): placeholder. Step 3.3 replaces this file; keep the props contract.
  // Rendered by SheetHost when router.sheet.name matches; `onClose` pops the sheet's history entry.
  import { he } from '$lib/i18n/he';

  interface Props {
    taskId: string;
    onClose: () => void;
  }

  let { taskId, onClose }: Props = $props();
</script>

<div class="stub" data-stub="CompleteSheet" data-task-id={taskId}>
  <h2>{he.sheetComplete.title}</h2>
  <p>{he.common.comingSoon}</p>
  <button type="button" onclick={onClose}>{he.common.close}</button>
</div>

<style>
  .stub {
    display: grid;
    gap: var(--s3);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  p {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  button {
    justify-self: start;
    min-block-size: var(--tap-min);
    padding-inline: var(--s5);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--ink);
    font: var(--font-callout);
    font-weight: 500;
  }
</style>
