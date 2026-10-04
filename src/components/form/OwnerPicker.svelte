<script lang="ts">
  // owner: step 3.3. "מי": אני / each other member / ללא. Never pre-selects or suggests anyone
  // (vision: the app does not decide who does what). Members keep the household's stable order.
  import type { Member } from '$lib/domain/types';
  import { Chip, MemberChip } from '$components/ui';
  import { he } from '$lib/i18n/he';

  interface Props {
    value: string | null;
    members: readonly Member[];
    meUid: string | null;
    label?: string;
    onChange: (uid: string | null) => void;
  }

  let { value, members, meUid, label = he.taskDetail.pick.me, onChange }: Props = $props();

  const me = $derived(members.find((m) => m.uid === meUid) ?? null);
  const others = $derived(members.filter((m) => m.uid !== meUid));
  const t = he.taskDetail.pick;
</script>

<div class="opts" role="group" aria-label={label}>
  {#if me}
    <MemberChip
      person={{ ...me, displayName: t.me }}
      selected={value === me.uid}
      onclick={() => onChange(me.uid)}
      data-owner="me"
    />
  {/if}
  {#each others as m (m.uid)}
    <MemberChip
      person={m}
      selected={value === m.uid}
      onclick={() => onChange(m.uid)}
      data-owner={m.uid}
    />
  {/each}
  <Chip label={t.nobody} selected={value === null} onclick={() => onChange(null)} />
</div>

<style>
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }
</style>
