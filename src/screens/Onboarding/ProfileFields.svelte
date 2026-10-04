<script lang="ts">
  // owner: step 3.1. Name, address-as (את / אתה) and colour: the onboarding profile step, the join
  // screen and the "my details" editor on the household screen all use it. `bind:` every field.
  import type { AddressAs, MemberColor } from '$lib/domain/types';
  import { ChoiceRow, ColorSwatchPicker, TextField } from '$components/ui';
  import { he } from '$lib/i18n/he';

  interface Props {
    name: string;
    addressAs: AddressAs | null;
    color: MemberColor;
    /** Colours other members already use (shown, but disabled). */
    taken?: MemberColor[];
    /** Show validation messages (after a submit attempt). */
    showErrors?: boolean;
    nameLabel?: string;
  }

  let {
    name = $bindable(),
    addressAs = $bindable(),
    color = $bindable(),
    taken = [],
    showErrors = false,
    nameLabel = he.onboarding.profile.nameLabel
  }: Props = $props();

  const t = he.onboarding.profile;
  const uid = $props.id();
  const nameError = $derived(showErrors && !name.trim() ? t.nameError : undefined);
  const addressError = $derived(showErrors && addressAs === null ? t.addressError : undefined);
</script>

<div class="fields">
  <TextField
    label={nameLabel}
    bind:value={name}
    error={nameError}
    autocomplete="given-name"
    enterkeyhint="done"
    maxlength={40}
    data-field="name"
  />

  <div class="group">
    <p class="label" id="{uid}-addr">{t.addressLabel}</p>
    <div class="address" role="radiogroup" aria-labelledby="{uid}-addr" data-field="addressAs">
      <ChoiceRow
        name="{uid}-address"
        value="f"
        title={t.addressF}
        subtitle={t.addressFExample}
        checked={addressAs === 'f'}
        onselect={() => (addressAs = 'f')}
      />
      <ChoiceRow
        name="{uid}-address"
        value="m"
        title={t.addressM}
        subtitle={t.addressMExample}
        checked={addressAs === 'm'}
        onselect={() => (addressAs = 'm')}
      />
    </div>
    {#if addressError}<p class="error" role="alert">{addressError}</p>{/if}
  </div>

  <div class="group">
    <p class="label" aria-hidden="true">{t.colorLabel}</p>
    <ColorSwatchPicker label={t.colorLabel} bind:value={color} {taken} />
  </div>
</div>

<style>
  .fields {
    display: grid;
    gap: var(--s5);
  }

  .group {
    display: grid;
    gap: var(--s2);
  }

  .label {
    font: var(--font-callout);
    font-weight: 600;
    color: var(--ink);
  }

  .address {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
  }

  .address :global(.choice) {
    border-radius: var(--r-md);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--sh-1);
  }

  .address :global(.choice.checked) {
    box-shadow: inset 0 0 0 2px var(--select-ring);
  }

  .address :global(.choice::before) {
    display: none;
  }

  .error {
    font: var(--font-caption);
    color: var(--danger);
  }
</style>
