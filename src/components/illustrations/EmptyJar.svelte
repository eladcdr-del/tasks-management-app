<script lang="ts">
  // Treat jar, nothing yet: a glass jar with a terracotta lid and a little heart tag.
  import Illo from './Illo.svelte';

  let { title, class: className }: { title?: string; class?: string } = $props();
</script>

<Illo {title} class={className}>
  <circle class="f-soft" cx="98" cy="76" r="46" />
  <ellipse class="f-sand" cx="100" cy="139" rx="76" ry="8" />

  <!-- jar -->
  <path
    class="f-surface o"
    d="M72 70c0-7 4-11 10-11h36c6 0 10 4 10 11v50c0 10-8 17-18 17H90c-10 0-18-7-18-17z"
  />
  <path class="lt" d="M83 76v30" />
  <path class="lt" d="M83 113v4" />
  <!-- lid -->
  <rect class="f-accent o" x="79" y="44" width="42" height="15" rx="5" />
  <path class="l" d="M86 51.5h28" opacity="0.35" />

  <!-- tag on a string -->
  <path class="l" d="M121 54c9 1.5 14 7 15.5 15" />
  <g transform="rotate(-14 141 82)">
    <rect class="f-sand o" x="131" y="70" width="20" height="24" rx="4" />
    <circle class="f-line" cx="141" cy="75.5" r="1.6" />
    <path
      class="f-accent"
      d="M141 89.5c-.3 0-.6-.1-.8-.3-2.6-2.1-4.6-3.8-4.6-6 0-1.5 1.2-2.7 2.7-2.7 1.1 0 2 .6 2.7 1.5.7-.9 1.6-1.5 2.7-1.5 1.5 0 2.7 1.2 2.7 2.7 0 2.2-2 3.9-4.6 6-.2.2-.5.3-.8.3z"
    />
  </g>

  <!-- sparkles -->
  <path class="s-accent" d="M54 60v10M49 65h10" />
  <path class="s-accent" d="M150 40v7M146.5 43.5h7" />
  <circle class="f-line" cx="60" cy="102" r="2" opacity="0.4" />
</Illo>
