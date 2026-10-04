<script lang="ts">
  // ProgressBar: slim rounded bar that fills from inline-start (the right, in RTL).
  //   <ProgressBar value={7} max={10} label="התקדמות הצנצנת" />
  import type { MemberColor } from '$lib/domain/types';

  interface Props {
    value: number;
    max?: number;
    /** Accessible name (Hebrew). */
    label: string;
    /** Spoken value, e.g. "7 מתוך 10". Defaults to the percentage. */
    valueText?: string;
    tone?: 'accent' | 'sage' | MemberColor;
    size?: 'slim' | 'regular';
    class?: string;
  }

  let {
    value,
    max = 100,
    label,
    valueText,
    tone = 'accent',
    size = 'slim',
    class: className
  }: Props = $props();

  const pct = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
  const isMember = $derived(tone !== 'accent' && tone !== 'sage');
</script>

<div
  class={['progress', size, `tone-${isMember ? 'member' : tone}`, className]}
  data-member-color={isMember ? tone : undefined}
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={valueText}
>
  <span class="fill" style:inline-size="{pct}%"></span>
</div>

<style>
  /* Every fill is ≥ 3:1 against the track (tokens.css): the -ink shades, not the light bases. */
  .progress {
    --fill: var(--progress-fill);
    display: flex;
    inline-size: 100%;
    block-size: 6px;
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--progress-track);
  }

  .regular {
    block-size: 10px;
  }

  .tone-sage {
    --fill: var(--sage-ink);
  }

  .tone-member {
    --fill: var(--m-ink);
  }

  .fill {
    display: block;
    min-inline-size: 0;
    border-radius: inherit;
    background: var(--fill);
    transition: inline-size var(--d-slow) var(--ease-out);
  }
</style>
