<script lang="ts">
  // owner: step 3.3. קטגוריה: the eight default categories with their icons. Tapping the
  // selected one clears it (a category is optional).
  import type { CategoryId } from '$lib/domain/types';
  import { DEFAULT_CATEGORIES } from '$lib/domain/categories';
  import { Chip, categoryIcon } from '$components/ui';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: CategoryId | null;
    onChange: (id: CategoryId | null) => void;
  }

  let { value, onChange }: Props = $props();
</script>

<div class="opts" role="group" aria-label={he.taskDetail.category}>
  {#each DEFAULT_CATEGORIES as c (c.id)}
    <Chip
      label={c.label}
      icon={categoryIcon(c.id)}
      selected={value === c.id}
      onclick={() => onChange(value === c.id ? null : c.id)}
      data-category={c.id}
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
