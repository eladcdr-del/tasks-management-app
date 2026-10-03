<script lang="ts">
  // Badge: small status label for task meta rows.
  //   age      – "פתוחה 3 שבועות"        (hourglass, neutral)
  //   snooze   – "נדחתה 4 פעמים"         (alarm clock, neutral)
  //   due      – "עד יום ה׳"             (calendar, neutral; tone="accent" for today)
  //   deadline – hard deadline           (lock-clock, accent)
  //   danger   – "באיחור" / "דחוף"       (alert, danger)
  // `variant="plain"` drops the fill, for calm inline meta; "soft" (default) is a tinted pill.
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import LockClock from './LockClock.svelte';
  import type { IconComponent } from './types';

  type Kind = 'age' | 'snooze' | 'due' | 'deadline' | 'danger' | 'neutral';
  type Tone = 'neutral' | 'accent' | 'danger' | 'success';

  interface Props {
    label: string;
    kind?: Kind;
    tone?: Tone;
    variant?: 'soft' | 'plain';
    /** Override the kind's icon; pass `null` for none. */
    icon?: IconComponent | null;
    class?: string;
  }

  const KIND: Record<Kind, { icon: IconComponent | null; tone: Tone }> = {
    age: { icon: Hourglass, tone: 'neutral' },
    snooze: { icon: AlarmClock, tone: 'neutral' },
    due: { icon: CalendarDays, tone: 'neutral' },
    deadline: { icon: LockClock, tone: 'accent' },
    danger: { icon: CircleAlert, tone: 'danger' },
    neutral: { icon: null, tone: 'neutral' }
  };

  let { label, kind = 'neutral', tone, variant = 'soft', icon, class: className }: Props = $props();

  const Icon = $derived(icon === undefined ? KIND[kind].icon : icon);
  const resolvedTone = $derived(tone ?? KIND[kind].tone);
</script>

<span class={['badge', resolvedTone, variant, className]} data-kind={kind}>
  {#if Icon}<Icon size={14} strokeWidth={2} aria-hidden="true" />{/if}
  <span class="text">{label}</span>
</span>

<style>
  .badge {
    --b-bg: var(--surface-2);
    --b-fg: var(--ink-2);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    block-size: 24px;
    padding-inline: 8px;
    border-radius: 8px;
    background: var(--b-bg);
    color: var(--b-fg);
    font-size: var(--fs-caption);
    font-weight: var(--fw-caption);
    line-height: var(--lh-caption);
    white-space: nowrap;
    flex: none;
  }

  .badge :global(svg) {
    flex: none;
  }

  .accent {
    --b-bg: var(--accent-soft);
    --b-fg: var(--accent-ink);
  }

  .danger {
    --b-bg: var(--danger-soft);
    --b-fg: var(--danger);
  }

  .success {
    --b-bg: color-mix(in srgb, var(--sage) 22%, var(--surface));
    --b-fg: var(--sage-ink);
  }

  .plain {
    --b-bg: transparent;
    padding-inline: 0;
    block-size: auto;
  }
</style>
