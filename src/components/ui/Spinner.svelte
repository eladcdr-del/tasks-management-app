<script lang="ts">
  // Spinner: a quiet rotating arc in currentColor.
  // With `label` it announces itself (role=status); without, it is decorative (inside a busy button).
  interface Props {
    size?: number;
    /** Accessible label, e.g. he.common.loading. Omit when the parent already conveys "busy". */
    label?: string;
    class?: string;
  }

  let { size = 20, label, class: className }: Props = $props();
  const stroke = $derived(size <= 16 ? 2 : 2.25);
  const r = $derived((24 - stroke * 2) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<span
  class={['spinner', className]}
  style:--size="{size}px"
  role={label ? 'status' : undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <circle class="track" cx="12" cy="12" {r} stroke-width={stroke} />
    <circle
      class="arc"
      cx="12"
      cy="12"
      {r}
      stroke-width={stroke}
      stroke-dasharray="{c * 0.28} {c}"
    />
  </svg>
  {#if label}<span class="visually-hidden">{label}</span>{/if}
</span>

<style>
  .spinner {
    display: inline-grid;
    place-items: center;
    inline-size: var(--size);
    block-size: var(--size);
    color: inherit;
    flex: none;
  }

  svg {
    animation: spin 820ms linear infinite;
  }

  circle {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
  }

  .track {
    opacity: 0.18;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  /* Still communicates "working", just calmer. */
  @media (prefers-reduced-motion: reduce) {
    svg {
      animation-duration: 1600ms;
    }
  }
</style>
