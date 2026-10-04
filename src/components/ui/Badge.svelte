<script lang="ts">
  /*
   * Badge: a small status label for task meta rows. Colour semantics (Blueprint §3, Phase 1 council
   * amendments) are carried by TREATMENT, not by tint:
   *   overdue  – "באיחור של יומיים"      solid danger fill, white text, alert icon
   *   urgent   – "דחוף"                  solid danger fill, white text, flag icon
   *   due      – "עד היום"               neutral sand pill + ring, ink calendar icon
   *   deadline – "מועד אחרון: יום ד׳"     neutral sand pill + ring, ink LockClock icon
   *   age      – "פתוחה 3 שבועות"        quiet inline meta (hourglass)
   *   snooze   – "נדחתה 4 פעמים"         quiet inline meta (alarm clock)
   *   neutral  – anything else; `tone` success / warn / danger for a tinted pill
   * `variant` overrides the kind's default: "soft" = pill, "plain" = inline text + icon.
   * Labels wrap and icons are sized in em, so the badge grows with the system font size.
   */
  import type { HTMLAttributes } from 'svelte/elements';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Flag from '@lucide/svelte/icons/flag';
  import LockClock from './LockClock.svelte';
  import { textDir } from '$lib/i18n/textDir';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  type Kind = 'overdue' | 'urgent' | 'danger' | 'due' | 'deadline' | 'age' | 'snooze' | 'neutral';
  type Tone = 'neutral' | 'danger' | 'success' | 'warn';
  type Treatment = 'solid' | 'due' | 'quiet' | 'tint';

  interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    label: string;
    kind?: Kind;
    /** Tint for `kind="neutral"` pills (success: "בוצעה"). Ignored by the state kinds. */
    tone?: Tone;
    variant?: 'soft' | 'plain';
    /** Override the kind's icon; pass `null` for none. */
    icon?: IconComponent | null;
    /** The label is (or contains) user-entered text: direction via textDir(). */
    userText?: boolean;
  }

  const KIND: Record<Kind, { icon: IconComponent | null; treatment: Treatment }> = {
    overdue: { icon: CircleAlert, treatment: 'solid' },
    urgent: { icon: Flag, treatment: 'solid' },
    danger: { icon: CircleAlert, treatment: 'solid' },
    due: { icon: CalendarDays, treatment: 'due' },
    deadline: { icon: LockClock, treatment: 'due' },
    age: { icon: Hourglass, treatment: 'quiet' },
    snooze: { icon: AlarmClock, treatment: 'quiet' },
    neutral: { icon: null, treatment: 'tint' }
  };

  let {
    label,
    kind = 'neutral',
    tone = 'neutral',
    variant,
    icon,
    userText = false,
    class: className,
    ...rest
  }: Props = $props();

  const Icon = $derived(icon === undefined ? KIND[kind].icon : icon);
  const treatment = $derived(KIND[kind].treatment);
  const plain = $derived(variant === 'plain' || (variant === undefined && treatment === 'quiet'));
</script>

<span
  class={['badge', treatment, treatment === 'tint' && `tone-${tone}`, { plain }, className]}
  data-kind={kind}
  {...rest}
>
  {#if Icon}<Icon class="b-icon" strokeWidth={ICON_STROKE} aria-hidden="true" />{/if}
  <span class="text" dir={userText ? textDir(label) : undefined}>{label}</span>
</span>

<style>
  .badge {
    --b-bg: var(--surface-2);
    --b-fg: var(--ink-2);
    --b-icon: currentColor;
    --b-edge: transparent;
    display: inline-flex;
    align-items: center;
    gap: var(--s1);
    min-block-size: 1.85em; /* 24px at 13px, grows with the text */
    max-inline-size: 100%;
    padding-block: 0.15em;
    padding-inline: 0.6em;
    border-radius: var(--r-xs);
    background: var(--b-bg);
    color: var(--b-fg);
    box-shadow: inset 0 0 0 1px var(--b-edge);
    font-size: var(--fs-caption);
    font-weight: var(--fw-caption);
    line-height: var(--lh-caption);
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .badge :global(.b-icon) {
    flex: none;
    inline-size: var(--icon-xs);
    block-size: var(--icon-xs);
    color: var(--b-icon);
  }

  .text {
    min-inline-size: 0;
  }

  /* overdue / urgent: the one thing that shouts. */
  .solid {
    --b-bg: var(--danger-solid);
    --b-fg: var(--on-danger);
    font-weight: 600;
  }

  /* due today / hard deadline: calm, neutral, unmistakably a date. */
  .due {
    --b-bg: var(--due-bg);
    --b-fg: var(--due-fg);
    --b-icon: var(--due-icon);
    --b-edge: var(--due-edge);
  }

  .badge[data-kind='deadline'] {
    --b-bg: var(--deadline-bg);
    --b-fg: var(--deadline-fg);
    --b-icon: var(--deadline-icon);
    --b-edge: var(--deadline-edge);
  }

  .tone-success {
    --b-bg: var(--success-soft);
    --b-fg: var(--sage-ink);
  }

  .tone-warn {
    --b-bg: var(--warn-soft);
    --b-fg: var(--warn-ink);
  }

  .tone-danger {
    --b-bg: var(--danger-soft);
    --b-fg: var(--danger);
  }

  /* Inline meta: no pill. A due/deadline label stays ink; the rest is secondary text. */
  .plain {
    --b-bg: transparent;
    --b-edge: transparent;
    min-block-size: 0;
    padding: 0;
  }

  .plain.solid {
    --b-fg: var(--danger);
  }

  .plain.quiet,
  .plain.tint {
    --b-icon: var(--ink-2);
  }
</style>
