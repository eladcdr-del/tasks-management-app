<script lang="ts">
  // House memory, nothing found: an open notebook with a ribbon, and a magnifying glass.
  import Illo from './Illo.svelte';

  let { title, class: className }: { title?: string; class?: string } = $props();
</script>

<Illo {title} class={className}>
  <circle class="f-sage" cx="94" cy="72" r="46" opacity="0.7" />
  <ellipse class="f-sand" cx="100" cy="139" rx="76" ry="8" />

  <!-- book -->
  <path class="f-surface o" d="M100 56c-13-7.5-31-8.5-46-3.5v66c15-5 33-4 46 3.5z" />
  <path class="f-surface o" d="M100 56c13-7.5 31-8.5 46-3.5v66c-15-5-33-4-46 3.5z" />
  <path class="l" d="M100 56v66" />
  <!-- writing -->
  <path class="lt" d="M63 68c9-2 19-1.5 28 1.5M63 79c9-2 19-1.5 28 1.5M63 90c6-1.2 12-1 18 .5" />
  <path class="lt" d="M109 69.5c6-2.6 13-3.4 19-2.6M109 80.5c9-3 19-3.5 28-1.5" />
  <!-- ribbon -->
  <path class="f-accent" d="M131 51h9v25l-4.5-3.6-4.5 3.6z" />

  <!-- magnifier -->
  <path class="l" d="M153.5 117.5l11 11" style="stroke-width: 5" />
  <circle class="f-surface o" cx="142" cy="106" r="15" />
  <path class="lt" d="M134 101.5a9 9 0 0 1 6.5-5" />

  <!-- sparkles -->
  <path class="s-accent" d="M44 44v9M39.5 48.5h9" />
  <circle class="f-line" cx="160" cy="44" r="2" opacity="0.45" />
</Illo>
