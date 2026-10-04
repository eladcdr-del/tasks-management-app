<script lang="ts">
  // owner: step 3.3. "מתי" (the soft plan): היום / מחר / השבוע (a week plan) / תאריך. Tapping the
  // selected option again clears the plan. Due dates are a separate field (DateField).
  import type { ISODate } from '$lib/domain/types';
  import { Chip } from '$components/ui';
  import DateField from './DateField.svelte';
  import { planFor, whenKeyOf, type PlanValue, type WhenKey } from './when';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: PlanValue;
    today: ISODate;
    onChange: (v: PlanValue) => void;
  }

  let { value, today, onChange }: Props = $props();
  const t = he.taskDetail.pick;

  const current = $derived(whenKeyOf(value, today));
  let dateMode = $state(false);
  const showDate = $derived(dateMode || current === 'date');

  const QUICK: { key: Exclude<WhenKey, 'date'>; label: string }[] = [
    { key: 'today', label: t.today },
    { key: 'tomorrow', label: t.tomorrow },
    { key: 'week', label: t.thisWeek }
  ];

  const NONE: PlanValue = { scheduledFor: null, weekPlan: false };

  function pick(key: Exclude<WhenKey, 'date'>) {
    dateMode = false;
    onChange(current === key ? NONE : planFor(key, today));
  }
</script>

<div class="when">
  <div class="opts" role="group" aria-label={he.taskDetail.when}>
    {#each QUICK as o (o.key)}
      <Chip
        label={o.label}
        selected={current === o.key}
        onclick={() => pick(o.key)}
        data-when={o.key}
      />
    {/each}
    <Chip
      label={t.date}
      selected={showDate}
      onclick={() => {
        if (showDate) {
          dateMode = false;
          if (current === 'date') onChange(NONE);
        } else dateMode = true;
      }}
      data-when="date"
    />
  </div>
  {#if showDate}
    <DateField
      value={current === 'date' && !value.weekPlan ? value.scheduledFor : null}
      min={today}
      onChange={(d) => onChange(d === null ? NONE : { scheduledFor: d, weekPlan: false })}
    />
  {/if}
</div>

<style>
  .when {
    display: grid;
    gap: var(--s3);
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }
</style>
