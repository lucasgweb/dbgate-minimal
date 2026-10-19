<script context="module" lang="ts">
  import { apiCall } from '../utility/api';
  import { showModal } from './modalTools';
  import ErrorMessageModal from './ErrorMessageModal.svelte';
  import { showSnackbarSuccess } from '../utility/snackbar';
  import _ from 'lodash';
  export async function saveScriptToDatabase({ conid, database }, sql, syncModel = true, logMessage = null) {
    const resp = await apiCall('database-connections/run-script', {
      conid,
      database,
      sql,
      logMessage,
    });

    const { errorMessage } = resp || {};
    if (errorMessage) {
      showModal(ErrorMessageModal, { title: 'Error when executing script', message: errorMessage });
    } else {
      showSnackbarSuccess('Saved to database');
      if (syncModel) apiCall('database-connections/sync-model', { conid, database });
    }
  }

  export async function runOperationOnDatabase({ conid, database }, operation, syncModel: string | boolean = true) {
    const resp = await apiCall('database-connections/run-operation', {
      conid,
      database,
      operation,
    });

    const { errorMessage } = resp || {};
    if (errorMessage) {
      showModal(ErrorMessageModal, { title: 'Error when executing operation', message: errorMessage });
    } else {
      showSnackbarSuccess('Saved to database');
      if (_.isString(syncModel)) {
        apiCall('database-connections/dispatch-database-changed-event', { event: syncModel, conid, database });
      } else if (syncModel) {
        apiCall('database-connections/sync-model', { conid, database });
      }
    }
  }
</script>

<script>
  import { writable } from 'svelte/store';
  import FormStyledButton from '../buttons/FormStyledButton.svelte';
  import FormCheckboxField from '../forms/FormCheckboxField.svelte';
  import FormProviderCore from '../forms/FormProviderCore.svelte';
  import FormSubmit from '../forms/FormSubmit.svelte';
  import TemplatedCheckboxField from '../forms/TemplatedCheckboxField.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import newQuery from '../query/newQuery';
  import SqlEditor from '../query/SqlEditor.svelte';
  import ModalBase from './ModalBase.svelte';
  import { closeCurrentModal } from './modalTools';
  import { _t } from '../translations';
  import { useConnectionInfo } from '../utility/metadataLoaders';
  import { getConnectionLabel } from 'dbgate-tools';
  import { isProductionDatabase } from '../utility/productionTools';

  export let sql;
  export let onConfirm;
  export let engine;
  export let recreates;
  export let deleteCascadesScripts;
  export let skipConfirmSettingKey = null;
  export let runAgainCheckbox = false;
  // connection of the script, production connections get a warning and cannot skip this dialog
  export let conid = null;
  export let database = null;

  $: connectionInfo = useConnectionInfo({ conid });
  $: isProduction = isProductionDatabase($connectionInfo, database);

  let dontAskAgain;

  $: isRecreated = _.sum(_.values(recreates || {})) > 0;
  const values = writable({});

  // $: console.log('recreates', recreates);

  // statement counts shown above the script, e.g. "2 × DELETE"
  const STATEMENT_KINDS = ['DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'];
  $: statementSummary = STATEMENT_KINDS.map(kind => ({
    kind,
    count: (currentScript?.match(new RegExp('^\\s*' + kind + '\\b', 'gim')) || []).length,
  })).filter(x => x.count > 0);

  $: currentScript = $values.deleteReferencesCascade
    ? [
        ...deleteCascadesScripts
          .filter(({ script, title }) => $values[`deleteReferencesFor_${title}`] !== false)
          .map(({ script, title }) => script),
        sql,
      ].join('\n')
    : sql;
</script>

<FormProviderCore {values}>
  <ModalBase {...$$restProps}>
    <div slot="header">{_t('common.saveChanges', { defaultMessage: 'Save changes' })}</div>

    {#if isProduction}
      <div class="production-warning" data-testid="ConfirmSqlModal_productionWarning">
        <FontIcon icon="mdi mdi-shield-alert-outline" />
        {_t('sqlModal.productionWarning', {
          defaultMessage: '{connection} is a production connection. Check the script carefully.',
          values: { connection: getConnectionLabel($connectionInfo) },
        })}
      </div>
    {/if}

    {#if statementSummary.length > 0}
      <div class="summary">
        {#each statementSummary as item (item.kind)}
          <span class={`statement statement-${item.kind.toLowerCase()}`}>{item.count} × {item.kind}</span>
        {/each}
      </div>
    {/if}

    <div class="editor">
      <SqlEditor {engine} value={currentScript} readOnly />
    </div>

    {#if runAgainCheckbox}
      <div class="mt-2">
        <FormCheckboxField
          templateProps={{ noMargin: true }}
          label={_t('query.runAgainAfterSave', { defaultMessage: 'Run query again after saving' })}
          name="runAgainAfterSave"
          data-testid="ConfirmSqlModal_runAgainAfterSave"
        />
      </div>
    {/if}

    {#if !_.isEmpty(deleteCascadesScripts)}
      <div class="mt-2">
        <FormCheckboxField
          templateProps={{ noMargin: true }}
          label={_t('sqlModal.deleteReferencesCascade', { defaultMessage: 'Delete references CASCADE' })}
          name="deleteReferencesCascade"
          data-testid="ConfirmSqlModal_deleteReferencesCascade"
        />
      </div>
    {/if}

    {#if $values.deleteReferencesCascade}
      <div class="form-margin flex">
        <FormStyledButton
          value={_t('common.checkAll', { defaultMessage: 'Check all' })}
          on:click={() => {
            $values = _.omitBy($values, (v, k) => k.startsWith('deleteReferencesFor_'));
          }}
        />
        <FormStyledButton
          value={_t('common.uncheckAll', { defaultMessage: 'Uncheck all' })}
          on:click={() => {
            const newValues = { ...$values };
            for (const item of deleteCascadesScripts) {
              newValues[`deleteReferencesFor_${item.title}`] = false;
            }
            $values = newValues;
          }}
        />
      </div>

      <div class="form-margin flex flex-wrap">
        {#each _.sortBy(deleteCascadesScripts, 'title') as deleteTable}
          <div class="mr-1 nowrap">
            <FormCheckboxField
              defaultValue={true}
              templateProps={{ noMargin: true }}
              label={deleteTable.title}
              name={`deleteReferencesFor_${deleteTable.title}`}
            />
          </div>
        {/each}
      </div>
    {/if}

    {#if isRecreated}
      <div class="form-margin">
        <div>
          <FontIcon icon="img warn" /> {_t('sqlModal.recreateWarning', { defaultMessage: "This operation is not directly supported by SQL engine. DbGate can emulate it, but please check the generated SQL script." })}
        </div>
        <FormCheckboxField
          templateProps={{ noMargin: true }}
          label={_t('sqlModal.allowRecreate', { defaultMessage: "Allow recreate (don't use on production databases)" })}
          name="allowRecreate"
        />
      </div>
    {/if}

    {#if skipConfirmSettingKey && !isProduction}
      <div class="mt-2">
        <TemplatedCheckboxField
          label={_t('common.dontAskAgain', { defaultMessage: "Don't ask again" })}
          templateProps={{ noMargin: true }}
          checked={dontAskAgain}
          on:change={e => {
            dontAskAgain = e.detail;
            apiCall('config/update-settings', { [skipConfirmSettingKey]: e.detail });
          }}
        />
      </div>
    {/if}

    <div slot="footer" class="footer-buttons">
      <FormStyledButton
        type="button"
        outline
        value={_t('common.openScript', { defaultMessage: 'Open script' })}
        on:click={() => {
          newQuery({
            initialData: currentScript,
          });

          closeCurrentModal();
        }}
        data-testid="ConfirmSqlModal_openScriptButton"
      />
      <div class="footer-right">
        <FormStyledButton
          type="button"
          outline
          value={_t('common.cancel', { defaultMessage: 'Cancel' })}
          on:click={closeCurrentModal}
          data-testid="ConfirmSqlModal_closeButton"
        />
        <div class="execute-button" class:production={isProduction}>
        <FormSubmit
          value={_t('sqlModal.execute', { defaultMessage: 'Execute' })}
          disabled={isRecreated && !$values.allowRecreate}
          on:click={e => {
            closeCurrentModal();
            onConfirm(currentScript, $values);
          }}
          data-testid="ConfirmSqlModal_okButton"
        />
        </div>
      </div>
    </div>
  </ModalBase>
</FormProviderCore>

<style>
  .production-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--tw-color-red-500) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--tw-color-red-500) 55%, transparent);
  }

  .production-warning :global(.mdi) {
    font-size: 18px;
    color: var(--tw-color-red-400);
  }

  .execute-button.production :global(input:not(.disabled)) {
    background: var(--tw-color-red-600) !important;
    border-color: var(--tw-color-red-600) !important;
    color: white !important;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .statement {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background: var(--theme-new-object-button-background);
    border: var(--theme-modal-border);
  }

  .statement-delete,
  .statement-drop,
  .statement-truncate {
    color: var(--theme-generic-font-error);
  }

  .statement-update,
  .statement-alter {
    color: var(--theme-icon-gold);
  }

  .statement-insert,
  .statement-create {
    color: var(--theme-generic-font-success);
  }

  .editor {
    position: relative;
    height: 30vh;
    width: 100%;
    box-sizing: border-box;
    border: var(--theme-modal-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .footer-buttons {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-right {
    display: flex;
    gap: 4px;
  }

  .form-margin {
    margin: var(--dim-large-form-margin);
  }

  .flex-wrap {
    flex-wrap: wrap;
  }
</style>
