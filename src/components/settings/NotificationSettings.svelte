<script lang="ts">
  // STUB (1.1 → 5.1): notifications block in Settings — status, enable, per-type toggles,
  // and help when the browser blocked them.
  import { he } from '$lib/i18n/he';
</script>

<div class="card" data-stub="NotificationSettings">
  <h2>{he.notifications.title}</h2>
  <p>{he.common.comingSoon}</p>
</div>

<style>
  .card {
    display: grid;
    gap: var(--s1);
    padding: var(--card-pad);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  h2 {
    font: var(--font-headline);
  }

  p {
    font: var(--font-callout);
    color: var(--ink-2);
  }
</style>
