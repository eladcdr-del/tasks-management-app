<script lang="ts">
  /*
   * TreatHistory ("צ׳ופרים שהרווחנו"): the earned treats, newest first, each with when it was
   * redeemed, who took part (treats earned since goal modes know) and its jar number. A quiet "⋮"
   * on each row offers "מחיקה מההיסטוריה"; a confirmation names the treat, then `onDelete(id)`
   * (household.deleteTreat: gone at once, with an undo). A removed row fades and folds away and the
   * rows below close the gap; an undone one unfolds back. Reduced motion: a short crossfade only.
   * Focus never drops to the page: after a delete it moves to the next row's "⋮" (else the
   * previous one, else the section heading).
   */
  import { untrack } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import Gift from '@lucide/svelte/icons/gift';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { AvatarStack, Dialog, SectionHeader } from '$components/ui';
  import type { EarnedTreat, ISODate, Member } from '$lib/domain/types';
  import { formatDate } from '$lib/i18n/format';
  import { textDir } from '$lib/i18n/textDir';
  import { he } from '$lib/i18n/he';
  import { easeOut, REDUCED_MAX, reducedMotion } from '$lib/platform/motion';
  import RowMenu from './RowMenu.svelte';
  import { refocusWhenLost } from './refocus';

  interface Props {
    /** Newest round first. */
    treats: readonly EarnedTreat[];
    /** The household's members, in their order (who took part). */
    members: readonly Member[];
    today: ISODate;
    onDelete: (id: string) => void;
  }

  let { treats, members, today, onDelete }: Props = $props();
  const t = he.jar;

  let listEl: HTMLUListElement | undefined = $state();
  let headingEl: HTMLElement | undefined = $state();
  /** The treat whose deletion is being confirmed. */
  let asking = $state<EarnedTreat | null>(null);
  /** Keeps the dialog's words while it animates out. */
  let shown = $state<EarnedTreat | null>(null);
  $effect.pre(() => {
    if (asking) shown = untrack(() => asking);
  });

  /** Who took part in an earned treat, in the household's order. */
  const tookPart = (e: EarnedTreat): Member[] =>
    members.filter((m) => (e.counts?.[m.uid] ?? 0) > 0);

  function confirm() {
    const target = asking;
    asking = null;
    if (!target) return;
    const i = treats.findIndex((x) => x.id === target.id);
    const neighbour = treats[i + 1] ?? treats[i - 1] ?? null;
    onDelete(target.id);
    refocusWhenLost(() =>
      neighbour
        ? (listEl?.querySelector<HTMLElement>(`[data-treat="${neighbour.id}"] [data-row-menu]`) ??
          null)
        : (headingEl ?? null)
    );
  }

  /** A row folds away (or back): its content fades first, then its height closes. */
  function row(node: Element) {
    if (reducedMotion.current) return fade(node, { duration: REDUCED_MAX });
    const s = slide(node, { duration: 320, easing: easeOut });
    return {
      ...s,
      css: (k: number, u: number) =>
        `${s.css?.(k, u) ?? ''};opacity:${Math.max(0, (k - 0.4) / 0.6)};`
    };
  }

  /** The whole section folds away with its last treat. */
  function section(node: Element) {
    return reducedMotion.current
      ? fade(node, { duration: REDUCED_MAX })
      : slide(node, { duration: 320, easing: easeOut });
  }
</script>

{#if treats.length > 0}
  <section class="history" aria-labelledby="jar-history" transition:section>
    <div bind:this={headingEl} tabindex="-1" class="heading">
      <SectionHeader id="jar-history" title={t.history} count={treats.length} />
    </div>
    <ul class="treats" bind:this={listEl}>
      {#each treats as e (e.id)}
        {@const who = tookPart(e)}
        <li class="treat-row" data-treat={e.id} transition:row>
          <div class="row-inner">
            <span class="badge" aria-hidden="true"><Gift size={18} /></span>
            <span class="treat-text">
              <span class="treat-name" dir={textDir(e.treat)}>{e.treat}</span>
              <span class="treat-meta">
                {#if e.redeemedAt !== null}
                  {t.redeemedOn(formatDate(e.redeemedAt, { today }))}
                {:else}
                  {t.filledOn(formatDate(e.filledAt, { today }))} · {t.waiting}
                {/if}
              </span>
            </span>
            <span class="treat-end">
              {#if who.length > 0}
                <AvatarStack
                  people={who}
                  size="xs"
                  max={4}
                  backdrop="var(--surface)"
                  label={t.tookPart(who.map((m) => m.displayName).join(', '))}
                />
              {/if}
              <span class="round">{t.round(Number(e.id) || 0)}</span>
            </span>
            <RowMenu
              label={t.removeTreat.menu(e.treat)}
              items={[
                {
                  id: 'delete',
                  label: t.removeTreat.action,
                  icon: Trash2,
                  danger: true,
                  onSelect: () => (asking = e)
                }
              ]}
            />
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<Dialog
  open={asking !== null}
  title={shown ? t.removeTreat.title(shown.treat) : ''}
  message={t.removeTreat.body}
  tone="danger"
  userText
  confirmLabel={t.removeTreat.confirm}
  onConfirm={confirm}
  onCancel={() => (asking = null)}
/>

<style>
  .history {
    display: grid;
    gap: var(--s3);
  }

  .heading {
    border-radius: var(--r-sm);
  }

  .heading:focus {
    outline: none;
  }

  .heading:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .treats {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: var(--r-lg);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
    overflow: hidden;
  }

  /* The row itself carries no padding or border, so folding it (height only) is smooth. */
  .treat-row {
    position: relative;
  }

  .treat-row + .treat-row::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--card-pad) + 40px + var(--s3)) var(--card-pad);
    border-block-start: 1px solid var(--line);
  }

  .row-inner {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding-block: var(--s3);
    padding-inline: var(--card-pad);
  }

  .badge {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .treat-text {
    display: grid;
    flex: 1;
    gap: 2px;
    min-inline-size: 0;
  }

  .treat-name {
    font: var(--font-body);
    font-weight: 500;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .treat-meta {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  .treat-end {
    display: grid;
    justify-items: end;
    gap: 4px;
    flex: none;
  }

  .round {
    font: var(--font-caption);
    color: var(--ink-3);
  }
</style>
