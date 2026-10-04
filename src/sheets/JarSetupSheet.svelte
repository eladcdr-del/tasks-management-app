<script lang="ts">
  // JarSetupSheet (step 4.2): the treat and how many tasks fill the jar (3–50) → household.setJar.
  // Opens with the current jar when there is one. Rendered by SheetHost; `onClose` pops its entry.
  import { Button, Stepper, TextField } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { household } from '$lib/state/household.svelte';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
  const t = he.jar.setup;

  const current = household.jar;
  let treat = $state(current?.treat ?? '');
  let target = $state(current?.target ?? 10);
  let tried = $state(false);
  const error = $derived(tried && treat.trim() === '' ? t.treatError : undefined);

  function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    const name = treat.trim();
    if (!name) return;
    household.setJar({ treat: name, target: Math.min(50, Math.max(3, Math.round(target))) });
    onClose();
  }
</script>

<form class="sheet" data-sheet-content="jarSetup" onsubmit={save} novalidate>
  <header>
    <h2>{current ? t.editTitle : t.title}</h2>
    <p class="hint">{t.hint}</p>
  </header>
  <TextField
    label={t.treat}
    bind:value={treat}
    placeholder={t.treatPlaceholder}
    maxlength={60}
    enterkeyhint="done"
    {error}
    data-autofocus
  />
  <div class="target">
    <p class="target-label">{t.target}</p>
    <Stepper
      bind:value={target}
      min={3}
      max={50}
      label={t.target}
      suffix={t.targetSuffix}
      haptics
    />
  </div>
  <Button type="submit" block size="lg">{current ? t.save : t.start}</Button>
</form>

<style>
  .sheet {
    display: grid;
    gap: var(--s5);
  }

  header {
    display: grid;
    gap: var(--s1);
  }

  h2 {
    font: var(--font-headline);
    color: var(--ink);
  }

  .hint {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .target {
    display: grid;
    gap: var(--s2);
  }

  .target-label {
    font: var(--font-callout);
    font-weight: 500;
    color: var(--ink);
  }
</style>
