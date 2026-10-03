<script lang="ts">
  // STUB (1.1 → 4.2): the large SVG jar with marbles in member colours (non-competitive).
  interface Props {
    count: number;
    target: number;
  }

  let { count, target }: Props = $props();

  const pct = $derived(target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0);
</script>

<div class="jar" data-stub="ProgressJar" role="img" aria-label={`${count} / ${target}`}>
  <div class="fill" style:block-size={`${pct}%`}></div>
</div>

<style>
  .jar {
    position: relative;
    justify-self: center;
    inline-size: 120px;
    block-size: 150px;
    border-radius: var(--r-lg) var(--r-lg) var(--r-xl) var(--r-xl);
    border: 2px solid var(--line);
    background: var(--surface);
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    background: var(--accent-soft);
  }
</style>
