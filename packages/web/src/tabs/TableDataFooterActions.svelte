<script lang="ts">
  // table actions shown in the grid footer in minimal mode (instead of the toolbar above the grid)
  import ToolStripButton from '../buttons/ToolStripButton.svelte';
  import ToolStripCommandButton from '../buttons/ToolStripCommandButton.svelte';
  import ToolStripCommandSplitButton from '../buttons/ToolStripCommandSplitButton.svelte';
  import ToolStripExportButton from '../buttons/ToolStripExportButton.svelte';
  import { _t } from '../translations';

  export let refreshLabel = null;
  export let autoRefreshMenu = [];
  export let hasRowSelection = false;
  export let changedCount = 0;
  export let quickExportHandlerRef;
  export let openStructure;
  export let openSql;
  export let handleMoreOptions;
</script>

<div class="actions">
  <ToolStripCommandButton command="dataGrid.insertNewRow" hideDisabled data-testid="TableDataTab_insertNewRow" />
  {#if hasRowSelection}
    <ToolStripCommandButton
      command="dataGrid.deleteSelectedRows"
      hideDisabled
      data-testid="TableDataTab_deleteSelectedRows"
    />
  {/if}
  <ToolStripCommandButton command="dataGrid.revertAllChanges" hideDisabled data-testid="TableDataTab_revertAllChanges" />
  {#if changedCount > 0}
    <div class="save-button">
      <ToolStripCommandButton
        command="tableData.save"
        buttonLabel={_t('tableData.saveChanges', {
          defaultMessage: 'Save {count} changes',
          values: { count: changedCount },
        })}
        data-testid="TableDataTab_save"
      />
    </div>
  {/if}

  <div class="separator" />

  <ToolStripButton icon="icon structure" on:click={openStructure}
    >{_t('datagrid.structure', { defaultMessage: 'Structure' })}</ToolStripButton
  >
  <ToolStripButton icon="img sql-file" on:click={openSql}>SQL</ToolStripButton>
  <ToolStripExportButton {quickExportHandlerRef} />
  <ToolStripCommandSplitButton
    buttonLabel={refreshLabel}
    commands={['dataGrid.refresh', ...autoRefreshMenu]}
    hideDisabled
    data-testid="TableDataTab_refreshGrid"
  />
  <ToolStripButton
    icon="icon dots-vertical"
    title={_t('tableData.moreOptions', { defaultMessage: 'More options' })}
    on:click={handleMoreOptions}
    data-testid="TableDataTab_moreOptions"
  />
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 100%;
    font-size: 12px;
  }

  /* compact toolbar buttons so they fit in the footer */
  .actions :global(.button) {
    align-self: center;
    margin: 0;
  }
  .actions :global(.inner) {
    padding: 3px 8px;
  }

  .actions > .separator:first-child {
    display: none;
  }
  .separator {
    width: 1px;
    height: 16px;
    margin: 0 6px;
    background: var(--theme-toolstrip-border-color, #303030);
  }

  .save-button :global(.inner) {
    background: var(--theme-formbutton-background) !important;
    border: var(--theme-formbutton-border) !important;
    color: var(--theme-formbutton-foreground);
  }
  .save-button :global(.inner:hover) {
    background: var(--theme-formbutton-background-hover) !important;
  }
  .save-button :global(.icon) {
    color: var(--theme-formbutton-foreground);
  }
</style>
