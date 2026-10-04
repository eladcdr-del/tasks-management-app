<script lang="ts">
  // "Lock-clock": a clock with a small padlock: the hard-deadline glyph (Lucide has none).
  // Drawn on Lucide's 24-grid with the same stroke language, so it sits among Lucide icons.
  import type { LucideProps } from '@lucide/svelte';
  import { ICON_STROKE } from './types';

  let {
    size = 24,
    strokeWidth = ICON_STROKE,
    color = 'currentColor',
    class: className = '',
    ...rest
  }: LucideProps = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={['lucide-icon', className]}
  {...rest}
>
  <!-- Clock face, opened at the lower inline-end corner where the padlock sits. -->
  <path d="M20.6 10.2A9 9 0 1 0 10.2 20.8" />
  <path d="M12 7v5l2 1.2" />
  <!-- Padlock -->
  <rect x="14.5" y="17" width="7.5" height="5.5" rx="1.4" />
  <path d="M16.2 17v-1.6a2 2 0 0 1 4 0V17" />
</svg>
