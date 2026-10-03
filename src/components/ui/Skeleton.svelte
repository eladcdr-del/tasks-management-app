<script lang="ts">
  // Skeleton: warm placeholder blocks while data loads. The shimmer travels in the reading
  // direction (right → left in RTL); static under reduced motion. Decorative (aria-hidden): mark
  // the loading container with aria-busy="true" instead.
  //   <Skeleton variant="text" lines={2} />  <Skeleton variant="circle" size={40} />
  //   <Skeleton variant="card" />            <Skeleton width="60%" height="20px" />
  interface Props {
    variant?: 'text' | 'circle' | 'rect' | 'card';
    lines?: number;
    width?: string;
    height?: string;
    /** circle diameter in px */
    size?: number;
    class?: string;
  }

  let { variant = 'rect', lines = 1, width, height, size = 40, class: className }: Props = $props();
</script>

{#if variant === 'text'}
  <span class={['stack', className]} aria-hidden="true" style:inline-size={width}>
    {#each { length: lines }, i (i)}
      <span class="sk line" style:inline-size={i === lines - 1 && lines > 1 ? '62%' : '100%'}
      ></span>
    {/each}
  </span>
{:else if variant === 'circle'}
  <span
    class={['sk', 'circle', className]}
    aria-hidden="true"
    style:inline-size="{size}px"
    style:block-size="{size}px"
  ></span>
{:else if variant === 'card'}
  <span class={['card', className]} aria-hidden="true">
    <span class="sk circle" style:inline-size="26px" style:block-size="26px"></span>
    <span class="stack grow">
      <span class="sk line" style:inline-size="72%"></span>
      <span class="sk line small" style:inline-size="44%"></span>
    </span>
    <span class="sk circle" style:inline-size="32px" style:block-size="32px"></span>
  </span>
{:else}
  <span
    class={['sk', 'rect', className]}
    aria-hidden="true"
    style:inline-size={width ?? '100%'}
    style:block-size={height ?? '48px'}
  ></span>
{/if}

<style>
  .sk {
    --sk-base: var(--surface-2);
    --sk-hi: color-mix(in oklab, var(--surface-2), var(--surface) 70%);
    display: block;
    background: linear-gradient(90deg, var(--sk-base) 0%, var(--sk-hi) 50%, var(--sk-base) 100%) 0
      0 / 300% 100%;
    animation: shimmer 1.6s var(--ease-out) infinite;
  }

  :global([dir='rtl']) .sk {
    animation-name: shimmer-rtl;
  }

  .line {
    block-size: 12px;
    border-radius: 6px;
  }

  .line.small {
    block-size: 10px;
  }

  .circle {
    border-radius: var(--r-pill);
    flex: none;
  }

  .rect {
    border-radius: var(--r-md);
  }

  .stack {
    display: grid;
    gap: 10px;
    inline-size: 100%;
  }

  .grow {
    flex: 1;
  }

  .card {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s4);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }

  @keyframes shimmer-rtl {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk {
      animation: none;
      background: var(--sk-base);
    }
  }
</style>
