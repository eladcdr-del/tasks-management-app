<script lang="ts">
  // Setup, not connected yet: a terracotta plug reaching for a socket.
  import Illo from './Illo.svelte';

  let { title, class: className }: { title?: string; class?: string } = $props();
</script>

<Illo {title} class={className}>
  <circle class="f-sand" cx="104" cy="72" r="46" />
  <ellipse class="f-sand" cx="100" cy="139" rx="76" ry="8" opacity="0.8" />

  <!-- socket -->
  <rect class="f-surface o" x="116" y="52" width="50" height="50" rx="15" />
  <rect class="f-line" x="131" y="68" width="4.5" height="12" rx="2.25" />
  <rect class="f-line" x="146.5" y="68" width="4.5" height="12" rx="2.25" />
  <circle class="f-line" cx="141" cy="89" r="2" opacity="0.5" />

  <!-- cable -->
  <path class="l" d="M58 80c-14 0-21 9-22 21-1 13 7 23 22 24h44" />
  <!-- plug -->
  <path class="l" d="M86 70h14M86 90h14" style="stroke-width: 3.5" />
  <rect class="f-accent o" x="56" y="62" width="32" height="36" rx="9" />
  <path class="l" d="M64 72v16" opacity="0.4" />

  <!-- almost there -->
  <path class="s-accent" d="M106 62l3-5M108.5 80h5M106 98l3 5" />

  <circle class="f-line" cx="48" cy="46" r="2" opacity="0.45" />
  <path class="s-accent" d="M170 116v8M166 120h8" />
</Illo>
