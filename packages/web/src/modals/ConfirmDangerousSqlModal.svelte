<script lang="ts">
  // confirmation before running UPDATE/DELETE without WHERE, or any change on a production connection
  import { onMount } from 'svelte';
  import FormStyledButton from '../buttons/FormStyledButton.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import ModalBase from './ModalBase.svelte';
  import { closeCurrentModal } from './modalTools';
  import { _t } from '../translations';

  export let unsafe = [];
  export let modifying = [];
  export let isProduction = false;
  export let connectionLabel = '';
  export let database = '';
  export let onConfirm;

  const MAX_SHOWN = 5;

  // on production the database name has to be typed to confirm
  let typedName = '';
  let domCancel;
  let domInput;

  $: shownStatements = (unsafe.length > 0 ? unsafe : modifying).slice(0, MAX_SHOWN);
  $: hiddenCount = (unsafe.length > 0 ? unsafe : modifying).length - shownStatements.length;
  $: canConfirm = !isProduction || typedName.trim() == database;

  function confirm() {
    if (!canConfirm) return;
    closeCurrentModal();
    onConfirm();
  }

  function shorten(text) {
    const oneLine = text.replace(/\s+/g, ' ');
    return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
  }

  onMount(() => {
    // never confirm by accident with Enter
    if (isProduction) domInput?.focus();
    else domCancel?.querySelector('input')?.focus();
  });
</script>

<ModalBase {...$$restProps}>
  <svelte:fragment slot="header">
    {isProduction
      ? _t('dangerousSql.headerProduction', { defaultMessage: 'Run on production database?' })
      : _t('dangerousSql.header', { defaultMessage: 'Run without WHERE?' })}
  </svelte:fragment>

  <div class="warning" class:production={isProduction}>
    <span class="warning-icon">
      <FontIcon icon={isProduction ? 'mdi mdi-shield-alert-outline' : 'mdi mdi-alert-circle-outline'} />
    </span>
    <div>
      {#if unsafe.length > 0}
        <div>
          {_t('dangerousSql.unsafeMessage', {
            defaultMessage:
              'This query changes ALL rows of the table: UPDATE / DELETE without WHERE or TRUNCATE.',
          })}
        </div>
      {/if}
      {#if isProduction}
        <div>
          {_t('dangerousSql.productionMessage', {
            defaultMessage: '{connection} / {database} is marked as a production connection.',
            values: { connection: connectionLabel, database },
          })}
        </div>
      {/if}
    </div>
  </div>

  <div class="statements">
    {#each shownStatements as statement}
      <div class="statement">
        <span class="kind">{statement.kind}</span>
        <code>{shorten(statement.text)}</code>
      </div>
    {/each}
    {#if hiddenCount > 0}
      <div class="more">
        {_t('dangerousSql.moreStatements', { defaultMessage: '+ {count} more', values: { count: hiddenCount } })}
      </div>
    {/if}
  </div>

  {#if isProduction}
    <label class="confirm-name">
      <span>
        {_t('dangerousSql.typeDatabaseName', {
          defaultMessage: 'Type {database} to confirm',
          values: { database },
        })}
      </span>
      <input
        type="text"
        bind:value={typedName}
        bind:this={domInput}
        spellcheck="false"
        placeholder={database}
        on:keydown={e => {
          if (e.key == 'Enter') confirm();
        }}
        data-testid="ConfirmDangerousSqlModal_databaseName"
      />
    </label>
  {/if}

  <div slot="footer" class="footer-buttons">
    <div bind:this={domCancel}>
      <FormStyledButton
        type="button"
        outline
        value={_t('common.cancel', { defaultMessage: 'Cancel' })}
        on:click={closeCurrentModal}
        data-testid="ConfirmDangerousSqlModal_cancelButton"
      />
    </div>
    <div class="danger">
      <FormStyledButton
        type="button"
        value={_t('dangerousSql.runAnyway', { defaultMessage: 'Run anyway' })}
        disabled={!canConfirm}
        on:click={confirm}
        data-testid="ConfirmDangerousSqlModal_runButton"
      />
    </div>
  </div>
</ModalBase>

<style>
  .warning {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--tw-color-amber-500) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--tw-color-amber-500) 45%, transparent);
    line-height: 1.5;
  }
  .warning-icon {
    font-size: 18px;
    line-height: 1.2;
    color: var(--tw-color-amber-400);
  }
  .warning.production .warning-icon {
    color: var(--tw-color-red-400);
  }
  .warning.production {
    background: color-mix(in srgb, var(--tw-color-red-500) 14%, transparent);
    border-color: color-mix(in srgb, var(--tw-color-red-500) 55%, transparent);
  }

  .statements {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .statement {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .kind {
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: var(--theme-generic-font-error);
    background: color-mix(in srgb, var(--tw-color-red-500) 14%, transparent);
  }

  code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .more {
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .confirm-name {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
  }
  .confirm-name span {
    font-size: 13px;
  }
  .confirm-name input {
    height: 40px;
    box-sizing: border-box;
  }

  .footer-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }

  .danger :global(input:not(.disabled)) {
    background: var(--tw-color-red-600) !important;
    border-color: var(--tw-color-red-600) !important;
    color: white !important;
  }
  .danger :global(input:not(.disabled):hover) {
    background: var(--tw-color-red-500) !important;
  }
</style>
