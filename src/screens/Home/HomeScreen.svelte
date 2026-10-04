<script lang="ts">
  // STUB (1.1 → 3.2): placeholder Home. Step 3.2 replaces this file.
  // Shows the brand and today's date in Hebrew so the shell smoke test has something to assert.
  // Step 2.4 wired it to the state stores (pulse counts, jar, my name, as bare data; the date from
  // the app clock) so tests/e2e/boot.spec.ts can assert the seeded data. 3.2 builds the real Home on
  // the same stores.
  import { he } from '$lib/i18n/he';
  import JarMini from '$components/jar/JarMini.svelte';
  import { household } from '$lib/state/household.svelte';
  import { tasks } from '$lib/state/tasks.svelte';
  import { clock } from '$lib/state/clock.svelte';

  const dateFormat = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Jerusalem'
  });
  const today = $derived(dateFormat.format(clock.nowMs));
</script>

<section class="home" data-stub="HomeScreen">
  <header>
    <p class="brand" dir="ltr">{he.common.appName}</p>
    <h1>{he.home.title}</h1>
    <p class="date">{today}</p>
  </header>

  <JarMini jar={household.jar} />

  <ul class="pulse" data-stub="pulse" data-loaded={tasks.openLoaded}>
    <li data-pulse="attention">{tasks.pulse.attention}</li>
    <li data-pulse="today">{tasks.pulse.today}</li>
    <li data-pulse="waiting">{tasks.pulse.waiting}</li>
  </ul>
  <p class="me" data-me dir="auto">{household.me?.displayName ?? ''}</p>

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

  .pulse {
    display: flex;
    gap: var(--s5);
    padding: 0;
    list-style: none;
    font: var(--font-numeral);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .me {
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
