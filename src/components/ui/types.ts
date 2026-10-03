// Shared prop types for the design-system components (step 1.4).
import type { Component } from 'svelte';
import type { LucideProps } from '@lucide/svelte';
import type { MemberColor } from '$lib/domain/types';

/**
 * Any icon component with Lucide's props: `import Car from '@lucide/svelte/icons/car'`.
 * (Deep imports keep the dev server from loading the whole icon set.) LockClock fits too.
 */
export type IconComponent = Component<LucideProps>;

/** The minimum a person needs for Avatar / MemberChip (a Member satisfies it). */
export interface AvatarPerson {
  displayName: string;
  photoURL?: string | null;
  color: MemberColor;
}

/** Standard stroke for icons across the app (Blueprint §1: Lucide, stroke 1.75). */
export const ICON_STROKE = 1.75;
