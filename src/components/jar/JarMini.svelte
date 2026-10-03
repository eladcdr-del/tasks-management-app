<script lang="ts">
  // STUB (1.1 → 4.2): Home strip "ארוחה במסעדה · 7 מתוך 10" with a slim progress bar;
  // becomes a celebration card when full. Renders nothing while no jar is set.
  import type { TreatJar } from '$lib/domain/types';

  interface Props {
    jar: TreatJar | null;
  }

  let { jar }: Props = $props();
</script>

{#if jar}
  <div class="mini" data-stub="JarMini" dir="auto">{jar.treat} · {jar.count}/{jar.target}</div>
{/if}

<style>
  .mini {
    padding: var(--s3) var(--card-pad);
    border-radius: var(--r-md);
    background: var(--surface);
    border: var(--edge);
    font: var(--font-callout);
    color: var(--ink-2);
  }
</style>
