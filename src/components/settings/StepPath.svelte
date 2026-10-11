<script lang="ts">
  // A way through the phone's settings as steps with ← between them: "פרטי האפליקציה" ← "התראות".
  // A line breaks only after an arrow, never inside a short step, and each step is isolated
  // (<bdi>), so a site name stays whole and in order. The arrows are decoration: a screen reader
  // hears commas between the steps.
  interface Props {
    /** Where the path starts ("באפליקציה", "בכרום"), shown before it. */
    label?: string;
    steps: readonly string[];
  }

  let { label, steps }: Props = $props();

  /** A step this long may wrap inside (a phrase); shorter ones stay on one line. */
  const LONG = 18;
</script>

<span class="path">
  {#if label}<span class="label">{label}:</span
    >{' '}{/if}{#each steps as step, i (i)}{#if i > 0}<span aria-hidden="true">{'\u00a0← '}</span
      ><span class="visually-hidden">{', '}</span>{/if}<bdi
      class={['step', { long: step.length > LONG }]}>{step}</bdi
    >{/each}
</span>

<style>
  .label {
    font-weight: 600;
    color: var(--ink);
  }

  .step:not(.long) {
    white-space: nowrap;
  }
</style>
