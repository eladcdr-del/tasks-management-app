<script lang="ts">
  // owner: step 2.4. The "מצב תצוגה · הנתונים לדוגמה" strip App.svelte shows above every screen in
  // demo mode. "יציאה מהדמו" forgets the stored mode and reloads (select.ts exitDemo): the app then
  // boots into Firebase when firebase-config.ts is filled in, otherwise into #/setup.
  import { he } from '$lib/i18n/he';
  import { exitDemo } from '$lib/data/select';
</script>

<aside class="demo-banner" aria-label={he.demo.label}>
  <span class="text">{he.demo.banner}</span>
  <button type="button" class="exit" onclick={() => exitDemo()}>{he.demo.exit}</button>
</aside>

<style>
  .demo-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s3);
    padding-block-start: var(--safe-top);
    padding-inline: var(--screen-pad);
    background: var(--surface-2);
    border-block-end: 1px solid var(--line);
  }

  .text {
    min-inline-size: 0;
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .exit {
    flex: none;
    min-block-size: var(--tap-min);
    padding-inline: var(--s2);
    margin-inline-end: calc(-1 * var(--s2));
    font: var(--font-caption);
    font-weight: 600;
    color: var(--accent-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
