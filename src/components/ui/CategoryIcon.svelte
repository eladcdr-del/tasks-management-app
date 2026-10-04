<script lang="ts" module>
  // The ONE place that turns a category into an icon. The Lucide names come from the category table
  // (src/lib/domain/categories.ts, `Category.icon`); this maps them to deep-imported components
  // (deep imports keep the dev server from loading the whole icon set).
  import Car from '@lucide/svelte/icons/car';
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import Wrench from '@lucide/svelte/icons/wrench';
  import HeartPulse from '@lucide/svelte/icons/heart-pulse';
  import Receipt from '@lucide/svelte/icons/receipt';
  import Repeat2 from '@lucide/svelte/icons/repeat-2';
  import Gift from '@lucide/svelte/icons/gift';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import type { CategoryId } from '$lib/domain/types';
  import { getCategory } from '$lib/domain/categories';
  import type { IconComponent } from './types';

  const BY_LUCIDE_NAME: Record<string, IconComponent> = {
    car: Car,
    'shopping-bag': ShoppingBag,
    wrench: Wrench,
    'heart-pulse': HeartPulse,
    receipt: Receipt,
    'repeat-2': Repeat2,
    gift: Gift,
    'circle-dot': CircleDot
  };

  /** The icon component for a category (unknown names fall back to "other"'s circle-dot). */
  export function categoryIcon(id: CategoryId): IconComponent {
    return BY_LUCIDE_NAME[getCategory(id).icon] ?? CircleDot;
  }
</script>

<script lang="ts">
  // <CategoryIcon id="car" />: decorative by default (the category name sits next to it); pass
  // `label` to give it an accessible name. Sized in em unless `size` is given.
  import { ICON_STROKE } from './types';

  interface Props {
    id: CategoryId;
    /** px number or any CSS length; default 1.125em (grows with the text next to it). */
    size?: number | string;
    /** Accessible name when the icon stands alone. */
    label?: string;
    class?: string;
  }

  let { id, size = 'var(--icon-sm)', label, class: className }: Props = $props();

  const Icon = $derived(categoryIcon(id));
  const length = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<Icon
  strokeWidth={ICON_STROKE}
  class={['category-icon', className]}
  style="inline-size: {length}; block-size: {length};"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  data-category={id}
/>
