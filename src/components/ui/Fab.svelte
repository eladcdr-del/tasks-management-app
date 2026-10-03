<script lang="ts">
  // Fab: the floating "+" (משימה חדשה). Extended = icon + label pill; collapsed = 56px circle.
  // Toggle `extended` (e.g. collapse on scroll down); the label slides away smoothly and stays
  // the accessible name either way. Positioning (inline-end, above the nav) is the shell's job.
  import Plus from '@lucide/svelte/icons/plus';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from './types';

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
  <Icon size={24} strokeWidth={2.25} aria-hidden="true" />
  <span class="label">{label}</span>
</button>

<style>
  .fab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    block-size: 56px;
    min-inline-size: 56px;
    padding-inline: 16px;
    border-radius: 20px;
    background: var(--accent-strong);
    color: var(--ink-on-accent);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.16),
      0 2px 6px rgb(74 44 24 / 0.16),
      0 12px 28px -8px
        light-dark(
          color-mix(in srgb, var(--accent-strong) 70%, transparent),
          color-mix(in srgb, var(--accent-strong) 28%, transparent)
        );
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

  .extended {
    padding-inline: 18px 22px;
  }

  .extended .label {
    max-inline-size: 12rem;
    margin-inline-start: 8px;
    opacity: 1;
  }

  .fab:active {
    transform: scale(0.95);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      0 1px 3px rgb(74 44 24 / 0.2);
  }

  .fab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab:active {
      transform: none;
    }
  }
</style>
