<script lang="ts">
  // STUB (1.1 → 3.2): placeholder Home. Step 3.2 replaces this file.
  // Shows the brand and today's date in Hebrew so the shell smoke test has something to assert.
  import { he } from '$lib/i18n/he';
  import JarMini from '$components/jar/JarMini.svelte';

  const today = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Jerusalem'
  }).format(new Date());
</script>

<section class="home" data-stub="HomeScreen">
  <header>
    <p class="brand" dir="ltr">{he.common.appName}</p>
    <h1>{he.home.title}</h1>
    <p class="date">{today}</p>
  </header>

  <JarMini jar={null} />

  <div class="card">
    <p>{he.common.comingSoon}</p>
  </div>
</section>

<style>
  .home {
    display: grid;
    gap: var(--s5);
    padding-block: calc(var(--safe-top) + var(--s7)) var(--s7);
    padding-inline: var(--screen-pad);
  }

  header {
    display: grid;
    gap: var(--s1);
  }

  .brand {
    justify-self: start;
    font: var(--font-caption);
    letter-spacing: 0.04em;
    color: var(--accent-ink);
  }

  h1 {
    font: var(--font-display);
    color: var(--ink);
  }

  .date {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .card {
    padding: var(--card-pad);
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  .card p {
    font: var(--font-callout);
    color: var(--ink-2);
  }
</style>
