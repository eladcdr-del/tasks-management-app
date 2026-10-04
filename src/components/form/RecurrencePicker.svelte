<script lang="ts">
  // owner: step 3.3. חוזרת: לא חוזרת / כל שבוע / כל חודש / כל שנה. The anchor is kept by the
  // adapters (recurrenceAfterEdit), so only the frequency is chosen here.
  import type { RecurrenceFreq } from '$lib/domain/types';
  import { Chip } from '$components/ui';
  import { RECURRENCE_LABELS } from '$lib/i18n/format';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: RecurrenceFreq | null;
    onChange: (f: RecurrenceFreq | null) => void;
  }

  let { value, onChange }: Props = $props();
  const FREQS: RecurrenceFreq[] = ['weekly', 'monthly', 'yearly'];
</script>

<div class="opts" role="group" aria-label={he.taskDetail.recurrence}>
  <Chip
    label={he.taskDetail.pick.noRepeat}
    selected={value === null}
    onclick={() => onChange(null)}
  />
  {#each FREQS as f (f)}
    <Chip
      label={RECURRENCE_LABELS[f]}
      selected={value === f}
      onclick={() => onChange(f)}
      data-freq={f}
    />
  {/each}
</div>

<style>
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }
</style>
