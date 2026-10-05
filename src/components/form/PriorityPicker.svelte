<script lang="ts">
  // owner: step 3.3. עדיפות: רגילה / חשובה / דחופה (single choice; "רגילה" is the default).
  import Flag from '@lucide/svelte/icons/flag';
  import type { Priority } from '$lib/domain/types';
  import { Chip } from '$components/ui';
  import { PRIORITY_LABELS } from '$lib/i18n/format';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: Priority;
    onChange: (p: Priority) => void;
  }

  let { value, onChange }: Props = $props();
  const ORDER: Priority[] = ['normal', 'high', 'urgent'];
</script>

<div class="opts" role="group" aria-label={he.taskDetail.priority}>
  {#each ORDER as p (p)}
    <Chip
      label={PRIORITY_LABELS[p]}
      icon={p === 'normal' ? undefined : Flag}
      selected={value === p}
      onclick={() => onChange(p)}
      data-priority={p}
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
