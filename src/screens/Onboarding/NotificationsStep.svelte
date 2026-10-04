<script lang="ts">
  // owner: step 5.1. #/onboarding/notifications, the last onboarding step: a warm explanation of
  // the four notification types, then "הפעלה" (permission prompt + device registration, see
  // platform/push.ts) or "אחר כך". Both continue to Home (replace, so Back never returns here).
  // Where push cannot be turned on from here (granted already, blocked, unsupported) a single
  // "המשך" is offered instead; in the demo and before Firebase is configured the buttons stay, and
  // "הפעלה" simply continues (Settings explains why).
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import HandHeart from '@lucide/svelte/icons/hand-heart';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CalendarHeart from '@lucide/svelte/icons/calendar-heart';
  import { Button } from '$components/ui';
  import { he } from '$lib/i18n/he';
  import { enablePush, pushSupport } from '$lib/platform/push';
  import { router } from '$lib/router/router.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';

  const t = he.onboardingNotifications;
  const icons = {
    requests: HandHeart,
    reminders: AlarmClock,
    partnerDone: CircleCheck,
    weekly: CalendarHeart
  } as const;

  const support = pushSupport();
  const canAsk = support === 'default' || support === 'demo' || support === 'not-configured';
  const note =
    support === 'granted'
      ? he.notifications.status.granted
      : support === 'denied'
        ? he.notifications.status.denied
        : support === 'unsupported'
          ? he.notifications.status.unsupported
          : support === 'demo'
            ? he.notifications.status.demo
            : null;

  let busy = $state(false);

  const done = () => router.navigate('#/', { replace: true });

  async function enable() {
    if (busy) return;
    busy = true;
    try {
      await enablePush();
    } finally {
      busy = false;
      done();
    }
  }
</script>

<OnboardingFrame screen="onboarding-notifications" title={t.title} lead={t.lead}>
  {#snippet hero()}
    <div class="icon" aria-hidden="true"><BellRing size={40} strokeWidth={1.5} /></div>
  {/snippet}

  <ul class="types">
    {#each t.items as item (item.key)}
      {@const Icon = icons[item.key]}
      <li>
        <span class="type-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
        <span>{item.text}</span>
      </li>
    {/each}
  </ul>

  {#if note}<p class="note" data-push-note={support}>{note}</p>{/if}

  {#snippet actions()}
    {#if canAsk}
      <Button size="lg" block loading={busy} onclick={enable} data-enable>{t.enable}</Button>
      <Button variant="ghost" size="lg" block onclick={done} data-later>{t.later}</Button>
      <p class="hint">{t.laterHint}</p>
    {:else}
      <Button size="lg" block onclick={done} data-continue>{t.continue}</Button>
    {/if}
  {/snippet}
</OnboardingFrame>

<style>
  .icon {
    display: grid;
    place-items: center;
    inline-size: 80px;
    block-size: 80px;
    border-radius: var(--r-xl);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .types {
    display: grid;
    gap: var(--s3);
    padding: var(--card-pad);
    border-radius: var(--r-lg);
    background: var(--surface-2);
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--s3);
    font: var(--font-callout);
    color: var(--ink);
  }

  .type-icon {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--accent-ink);
  }

  .note {
    font: var(--font-callout);
    color: var(--ink-2);
  }

  .hint {
    font: var(--font-caption);
    color: var(--ink-3);
    text-align: center;
  }
</style>
