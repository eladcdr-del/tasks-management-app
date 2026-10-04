<script lang="ts">
  // Fab: the floating "+" (משימה חדשה). Extended = icon + label pill; collapsed = 56px circle.
  // Toggle `extended` (e.g. collapse on scroll down); the label slides away smoothly and stays
  // the accessible name either way. Positioning (inline-end, above the nav) is the shell's job.
  import Plus from '@lucide/svelte/icons/plus';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from './types';
  import { ICON_STROKE } from './types';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    label: string;
    icon?: IconComponent;
    extended?: boolean;
  }

  let {
    label,
    icon: Icon = Plus,
    extended = true,
    type = 'button',
    class: className,
    ...rest
  }: Props = $props();
</script>

<button {type} class={['fab', { extended }, className]} {...rest}>
  <Icon size={24} strokeWidth={ICON_STROKE} aria-hidden="true" class="fab-icon" />
  <span class="label">{label}</span>
</button>

<style>
  .fab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: 56px;
    min-inline-size: 56px;
    padding-inline: var(--s4);
    border-radius: var(--r-lg);
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    box-shadow: var(--sh-fab);
    transition:
      padding var(--d-slow) var(--ease-out),
      transform var(--d-fast) var(--ease-out),
      box-shadow var(--d-base) var(--ease-out);
  }

  .label {
    max-inline-size: 0;
    overflow: hidden;
    opacity: 0;
    white-space: nowrap;
    font-size: var(--fs-body);
    font-weight: 500;
    transition:
      max-inline-size var(--d-slow) var(--ease-out),
      opacity var(--d-base) var(--ease-out),
      margin var(--d-slow) var(--ease-out);
  }

  .fab :global(.fab-icon) {
    flex: none;
  }

  .extended {
    padding-inline: var(--s4-5) var(--s5);
  }

  .extended .label {
    max-inline-size: 12rem;
    margin-inline-start: var(--s2);
    opacity: 1;
  }

  .fab:active {
    transform: scale(0.95);
    box-shadow: var(--sh-fab-pressed);
  }

  .fab:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab:active {
      transform: none;
    }
  }
</style>
