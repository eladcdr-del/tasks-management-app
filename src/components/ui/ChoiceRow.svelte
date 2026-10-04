<script lang="ts">
  /*
   * ChoiceRow: one option of a single-choice list (RequestSheet member list, theme, "את / אתה").
   * A native radio inside a <label>, so the browser provides radio semantics, Space and the arrow
   * keys between rows of the same `name`, and a single Tab stop. Wrap the rows in a container with
   * role="radiogroup" and an aria-label. The checked row shows an ink radio (selection is ink).
   *
   *   <div role="radiogroup" aria-label="למי לשלוח?">
   *     {#each members as m (m.uid)}
   *       <ChoiceRow name="who" title={m.displayName} userText checked={who === m.uid}
   *                  onselect={() => (who = m.uid)}>
   *         {#snippet leading()}<Avatar … decorative />{/snippet}
   *       </ChoiceRow>
   *     {/each}
   *   </div>
   */
  import type { Snippet } from 'svelte';
  import { textDir } from '$lib/i18n/textDir';

  interface Props {
    /** Radio group name: rows with the same name form one group. */
    name: string;
    title: string;
    subtitle?: string;
    checked?: boolean;
    value?: string;
    disabled?: boolean;
    leading?: Snippet;
    onselect?: () => void;
    /** Title is user-entered (a member name): direction via textDir(). */
    userText?: boolean;
    class?: string;
  }

  let {
    name,
    title,
    subtitle,
    checked = false,
    value,
    disabled = false,
    leading,
    onselect,
    userText = false,
    class: className
  }: Props = $props();

  const uid = $props.id();
</script>

<label class={['choice', 'hc-list-row', { checked, disabled, 'has-lead': !!leading }, className]}>
  <input
    type="radio"
    class="visually-hidden"
    {name}
    {value}
    {checked}
    {disabled}
    aria-describedby={subtitle ? `${uid}-s` : undefined}
    onchange={(e) => e.currentTarget.checked && onselect?.()}
  />
  {#if leading}<span class="lead">{@render leading()}</span>{/if}
  <span class="main">
    <span class="title" dir={userText ? textDir(title) : undefined}>{title}</span>
    {#if subtitle}<span class="subtitle" id="{uid}-s">{subtitle}</span>{/if}
  </span>
  <span class="radio" aria-hidden="true"><span class="dot"></span></span>
</label>

<style>
  .choice {
    --pad: var(--row-pad, var(--s4));
    --row-inset: var(--pad);
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s3);
    min-block-size: 56px;
    padding-block: var(--s2);
    padding-inline: var(--pad);
    color: var(--ink);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-fast) var(--ease-out);
  }

  .has-lead {
    --row-inset: calc(var(--pad) + 36px + var(--s3));
  }

  /* Same hairline as ListRow (rows of both kinds may sit together). */
  :global(.hc-list-row + .hc-list-row::before) {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--row-inset) var(--pad);
    border-block-start: 1px solid var(--line);
  }

  .choice:active:not(.disabled) {
    background: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  @media (hover: hover) {
    .choice:hover:not(.disabled) {
      background: color-mix(in srgb, var(--surface-2) 45%, transparent);
    }
  }

  .lead {
    display: grid;
    place-items: center;
    flex: none;
    min-inline-size: 36px;
  }

  .main {
    display: grid;
    gap: var(--s0-5);
    flex: 1;
    min-inline-size: 0;
  }

  .title {
    font: var(--font-body);
    font-weight: 500;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .subtitle {
    font: var(--font-caption);
    font-weight: 400;
    color: var(--ink-2);
  }

  /* The radio: a ring of --field-edge (≥ 3:1); checked = an ink ring with an ink dot. */
  .radio {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 1.375em;
    block-size: 1.375em;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1.5px var(--field-edge);
    transition: box-shadow var(--d-fast) var(--ease-out);
  }

  .dot {
    inline-size: 50%;
    block-size: 50%;
    border-radius: var(--r-pill);
    background: var(--select-bg);
    scale: 0;
    transition: scale var(--d-base) var(--ease-spring);
  }

  .checked .radio {
    box-shadow: inset 0 0 0 2px var(--select-ring);
  }

  .checked .dot {
    scale: 1;
  }

  .choice:has(input:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
    border-radius: var(--r-md);
  }

  .disabled {
    cursor: default;
    opacity: 0.5;
  }

  /* Rows inside a rounded card: round the first/last press highlight with it. */
  .choice:first-child {
    border-start-start-radius: inherit;
    border-start-end-radius: inherit;
  }

  .choice:last-child {
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
  }
</style>
