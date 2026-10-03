<script lang="ts">
  // STUB (1.1 → 4.2): full-screen celebration when the jar fills (static under reduced motion).
  import { he } from '$lib/i18n/he';

  interface Props {
    treat: string;
    onClose: () => void;
  }

  let { treat, onClose }: Props = $props();
</script>

<div
  class="overlay"
  data-stub="CelebrationOverlay"
  role="dialog"
  aria-modal="true"
  aria-label={he.jar.celebration}
>
  <p class="title">{he.jar.celebration}</p>
  <p dir="auto">{treat}</p>
  <button type="button" onclick={onClose}>{he.common.close}</button>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: grid;
    place-content: center;
    gap: var(--s3);
    background: var(--bg);
    text-align: center;
  }

  .title {
    font: var(--font-title);
  }

  button {
    min-block-size: var(--tap-min);
    padding-inline: var(--s5);
    border-radius: var(--r-pill);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
  }
</style>
