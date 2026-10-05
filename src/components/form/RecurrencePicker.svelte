<script lang="ts">
  // חוזרת: one-tap presets (לא חוזרת / כל יום / כל שבוע / כל חודש / כל שנה), then "אחר" for every
  // N days / weeks / months / years ("כל [N] [יחידה]"), and for a weekly rule seven day toggles
  // (א ב ג ד ה ו ש: "every Sunday and Wednesday"). The logic lives in ./repeat.ts. The anchor is kept
  // by the adapters (recurrenceAfterEdit), so only the rule is chosen here.
  import { Chip, SegmentedControl, Stepper } from '$components/ui';
  import { intervalOf, MAX_INTERVAL, type RecurrenceRule } from '$lib/domain/recurrence';
  import type { ISODate, RecurrenceFreq } from '$lib/domain/types';
  import { recurrenceText, weekdayFullName } from '$lib/i18n/format';
  import { he } from '$lib/i18n/he';
  import {
    customStart,
    presetOf,
    presetRule,
    PRESETS,
    shownDays,
    toggleDay,
    UNITS,
    withInterval,
    withUnit,
    type RepeatPreset
  } from './repeat';

  interface Props {
    value: RecurrenceRule | null;
    /**
     * The task's own day (its due date, or a day plan; not a week plan): a weekly rule without
     * listed days repeats on its weekday, so that day shows as on.
     */
    date?: ISODate | null;
    /**
     * A new rule. `settled` is true for a one-tap choice that needs nothing more (the host may close
     * the picker); false while the days or the custom row are being set.
     */
    onChange: (rule: RecurrenceRule | null, settled: boolean) => void;
  }

  let { value, date = null, onChange }: Props = $props();
  const t = he.taskDetail.pick;
  const uid = $props.id();
  const DAYS = [0, 1, 2, 3, 4, 5, 6];

  /** "אחר" was tapped: the custom row stays even if its interval is set back to 1. */
  let customPicked = $state(false);
  const preset = $derived(presetOf(value));
  const custom = $derived(value !== null && (customPicked || preset === 'custom'));
  const interval = $derived(value ? intervalOf(value) : 1);
  const days = $derived(shownDays(value, date));
  const units = $derived(
    UNITS.map((u) => ({ value: u, label: interval === 1 ? t.unitOne[u] : t.unitMany[u] }))
  );

  const labelOf = (p: RepeatPreset) => (p === 'none' ? t.noRepeat : recurrenceText({ freq: p }));

  function pickPreset(p: RepeatPreset) {
    customPicked = false;
    // "כל שבוע" leads on to its days; every other preset is complete in one tap
    onChange(presetRule(p), p !== 'weekly');
  }

  function pickCustom() {
    customPicked = true;
    onChange(customStart(value), false);
  }
</script>

<div class="repeat">
  <div class="opts" role="group" aria-label={he.taskDetail.recurrence}>
    {#each PRESETS as p (p)}
      <Chip
        label={labelOf(p)}
        selected={!custom && preset === p}
        onclick={() => pickPreset(p)}
        data-repeat={p}
      />
    {/each}
    <Chip label={t.customRepeat} selected={custom} onclick={pickCustom} data-repeat="custom" />
  </div>

  {#if custom && value}
    <div class="more custom" data-testid="repeat-custom">
      <div class="every">
        <span class="every-word" aria-hidden="true">{t.every}</span>
        <Stepper
          value={interval}
          min={1}
          max={MAX_INTERVAL}
          label={t.everyHowMany}
          haptics
          onchange={(n) => onChange(withInterval(value, n), false)}
        />
      </div>
      <SegmentedControl
        class="units"
        options={units}
        value={value.freq}
        label={t.repeatUnit}
        haptics
        onchange={(u: RecurrenceFreq) => onChange(withUnit(value, u), false)}
      />
    </div>
  {/if}

  {#if value?.freq === 'weekly'}
    <div class="more">
      <p class="days-label" id="{uid}-days">{t.onDays}</p>
      <div class="days" role="group" aria-labelledby="{uid}-days" data-testid="repeat-days">
        {#each DAYS as d (d)}
          <button
            type="button"
            class="day"
            aria-pressed={days.includes(d)}
            aria-label={weekdayFullName(d)}
            data-day={d}
            onclick={() => onChange(toggleDay(value, d, date), false)}
          >
            <span class="day-face">{t.dayLetters[d]}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .repeat {
    display: grid;
    gap: var(--s4);
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }

  /* The rows a choice leads to: set off by a hairline, entering softly. */
  .more {
    display: grid;
    gap: var(--s3);
    padding-block-start: var(--s4);
    border-block-start: 1px solid var(--line);
    animation: more-in var(--d-base) var(--ease-out);
  }

  .more + .more {
    padding-block-start: 0;
    border-block-start: 0;
  }

  @keyframes more-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  .every {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .every-word {
    font: var(--font-headline);
    color: var(--ink);
  }

  /* The picker sits on sand (quick add) or on a white card (task screen): an ink-tinted track reads
     on both, where the default sand track would vanish on sand. */
  .custom :global(.segmented.units) {
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }

  .days-label {
    font: var(--font-caption);
    color: var(--ink-2);
  }

  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--s1);
  }

  /* Each toggle fills its column (≥ 44px tall); the round face sits centred in it. */
  .day {
    position: relative;
    display: grid;
    place-items: center;
    min-inline-size: 0;
    min-block-size: var(--tap-min);
    border-radius: var(--r-pill);
    color: var(--ink-2);
  }

  .day-face {
    display: grid;
    place-items: center;
    inline-size: min(100%, 2.75rem);
    aspect-ratio: 1;
    border-radius: var(--r-pill);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    font-size: var(--fs-callout);
    font-weight: 600;
    line-height: 1;
    transition:
      background-color var(--d-base) var(--ease-out),
      color var(--d-base) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out),
      transform var(--d-fast) var(--ease-out);
  }

  .day[aria-pressed='true'] {
    color: var(--select-fg);
  }

  .day[aria-pressed='true'] .day-face {
    background: var(--select-bg);
    box-shadow: inset 0 0 0 1px var(--select-bg);
  }

  @media (hover: hover) {
    .day:not([aria-pressed='true']):hover .day-face {
      color: var(--ink);
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hairline-strong), var(--ink) 20%);
    }
  }

  .day:active .day-face {
    transform: scale(0.94);
  }

  .day:focus-visible {
    outline: none;
  }

  .day:focus-visible .day-face {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .more {
      animation-duration: 1ms;
    }

    .day:active .day-face {
      transform: none;
    }
  }
</style>
