<script lang="ts">
  // Home, all clear: a cup of tea with a little steam, a terracotta pot. "אפשר לנשום."
  import Illo from './Illo.svelte';

  let { title, class: className }: { title?: string; class?: string } = $props();
</script>

<Illo {title} class={className}>
  <!-- warm sun -->
  <circle class="f-soft" cx="112" cy="70" r="46" />
  <!-- ground -->
  <ellipse class="f-sand" cx="100" cy="139" rx="76" ry="8" />

  <!-- steam -->
  <path class="lt" d="M83 82c-4-5 4-9 0-14s4-9 0-13" />
  <path class="lt" d="M95 78c-4-5 4-9 0-14s4-9 0-13" />
  <path class="lt" d="M107 82c-4-5 4-9 0-14" />

  <!-- saucer -->
  <path
    class="f-surface o"
    d="M56 133.5c0-2.5 3-4.5 6.5-4.5h63c3.5 0 6.5 2 6.5 4.5s-3 4.5-6.5 4.5h-63c-3.5 0-6.5-2-6.5-4.5z"
  />
  <!-- handle -->
  <path class="l" d="M118 100h4.5a9.5 9.5 0 0 1 0 19H117" />
  <!-- cup -->
  <path class="f-surface o" d="M70 92h48v20a20 20 0 0 1-20 20h-8a20 20 0 0 1-20-20z" />
  <!-- tea line -->
  <path class="lt" d="M75 99h38" />
  <!-- heart on the cup -->
  <path
    class="f-accent"
    d="M94 122.5c-.4 0-.8-.2-1.1-.4-3.6-2.9-6.4-5.2-6.4-8.3 0-2.1 1.6-3.8 3.7-3.8 1.5 0 2.8.8 3.8 2.1 1-1.3 2.3-2.1 3.8-2.1 2.1 0 3.7 1.7 3.7 3.8 0 3.1-2.8 5.4-6.4 8.3-.3.2-.7.4-1.1.4z"
  />

  <!-- plant: terracotta pot -->
  <path class="l" d="M151 117V97" />
  <path class="f-sage o" d="M151 104c-9.5-.5-14.5-7.5-13.5-15.5 8 .5 13.5 7 13.5 15.5z" />
  <path class="f-sage o" d="M151 98c1-8.5 7-14 15-13.5-.5 8-6.5 13.5-15 13.5z" />
  <path class="f-accent o" d="M139 117h24l-2.6 17.2a3.5 3.5 0 0 1-3.5 3H145a3.5 3.5 0 0 1-3.5-3z" />
  <path class="l" d="M137 117h28" />

  <!-- sparkles -->
  <path class="s-accent" d="M46 52v10M41 57h10" />
  <circle class="f-line" cx="62" cy="40" r="2" opacity="0.5" />
  <circle class="f-line" cx="168" cy="52" r="2" opacity="0.4" />
</Illo>
