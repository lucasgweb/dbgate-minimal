<script>
  import FontIcon from '../icons/FontIcon.svelte';
  import DropDownButton from '../buttons/DropDownButton.svelte';
  import splitterDrag from '../utility/splitterDrag';
  import _ from 'lodash';

  import ColumnLabel from '../elements/ColumnLabel.svelte';
  import { isTypeDateTime } from 'dbgate-tools';
  import { openDatabaseObjectDetail } from '../appobj/DatabaseObjectAppObject.svelte';
  import { copyTextToClipboard } from '../utility/clipboard';
  import VirtualForeignKeyEditorModal from '../tableeditor/VirtualForeignKeyEditorModal.svelte';
  import { showModal } from '../modals/modalTools';
  import DefineDictionaryDescriptionModal from '../modals/DefineDictionaryDescriptionModal.svelte';
  import { sleep } from '../utility/common';
  import { isProApp } from '../utility/proTools';
  import { minimalMode } from '../stores';
  import { _t } from '../translations';
  import contextMenu from '../utility/contextMenu';

  export let column;
  export let conid = undefined;
  export let database = undefined;
  export let setSort = undefined;
  export let addToSort = undefined;
  export let clearSort = undefined;
  export let grouping = undefined;
  export let order = undefined;
  export let orderIndex = undefined;
  export let isSortDefined = false;
  export let allowDefineVirtualReferences = false;
  export let setGrouping;
  export let seachInColumns = '';
  export let onReload = undefined;
  export let driver = null;

  // in minimal mode the column menu is opened by right click instead of the dropdown button
  function headerContextMenu(node, enabled) {
    let handle = enabled ? contextMenu(node, getMenu) : null;
    return {
      update(value) {
        if (value && !handle) handle = contextMenu(node, getMenu);
        if (!value && handle) {
          handle.destroy();
          handle = null;
        }
      },
      destroy() {
        handle?.destroy();
      },
    };
  }

  function handleSortToggle() {
    if (!order) setSort('ASC');
    else if (order == 'ASC') setSort('DESC');
    else clearSort?.();
  }


  const openReferencedTable = () => {
    openDatabaseObjectDetail('TableDataTab', null, {
      schemaName: column.foreignKey.refSchemaName,
      pureName: column.foreignKey.refTableName,
      conid,
      database,
      objectTypeField: 'tables',
    });
  };

  const handleDefineVirtualForeignKey = () => {
    showModal(VirtualForeignKeyEditorModal, {
      schemaName: column.schemaName,
      pureName: column.pureName,
      conid,
      database,
      columnName: column.columnName,
    });
  };

  const handleCustomizeDescriptions = () => {
    showModal(DefineDictionaryDescriptionModal, {
      conid,
      database,
      schemaName: column.foreignKey.refSchemaName,
      pureName: column.foreignKey.refTableName,
      onConfirm: async () => {
        await sleep(100);
        onReload?.();
      },
    });
  };

  function getMenu() {
    return [
      setSort && { onClick: () => setSort('ASC'), text: 'Sort ascending' },
      setSort && { onClick: () => setSort('DESC'), text: 'Sort descending' },
      isSortDefined && addToSort && !order && { onClick: () => addToSort('ASC'), text: 'Add to sort - ascending' },
      isSortDefined && addToSort && !order && { onClick: () => addToSort('DESC'), text: 'Add to sort - descending' },
      order && clearSort && { onClick: () => clearSort(), text: 'Clear sort criteria' },
      { onClick: () => copyTextToClipboard(column.columnName), text: 'Copy column name' },

      column.foreignKey && [{ divider: true }, { onClick: openReferencedTable, text: column.foreignKey.refTableName }],

      isProApp() &&
        setGrouping &&
        !driver?.dialect?.disableGroupingForDataType?.(column.dataType) && [
          { divider: true },
          { onClick: () => setGrouping('GROUP'), text: 'Group by' },
          { onClick: () => setGrouping('MAX'), text: 'MAX' },
          { onClick: () => setGrouping('MIN'), text: 'MIN' },
          { onClick: () => setGrouping('SUM'), text: 'SUM' },
          { onClick: () => setGrouping('AVG'), text: 'AVG' },
          { onClick: () => setGrouping('COUNT'), text: 'COUNT' },
          { onClick: () => setGrouping('COUNT DISTINCT'), text: 'COUNT DISTINCT' },
        ],

      isProApp() &&
        isTypeDateTime(column.dataType) && [
          { divider: true },
          { onClick: () => setGrouping('GROUP:YEAR'), text: 'Group by YEAR' },
          { onClick: () => setGrouping('GROUP:MONTH'), text: 'Group by MONTH' },
          { onClick: () => setGrouping('GROUP:DAY'), text: 'Group by DAY' },
        ],

      { divider: true },

      isProApp() &&
        allowDefineVirtualReferences && { onClick: handleDefineVirtualForeignKey, text: 'Define virtual foreign key' },
      column.foreignKey &&
        isProApp() && {
          onClick: handleCustomizeDescriptions,
          text: 'Customize description',
        },
    ];
  }
</script>

<div class="header" use:headerContextMenu={$minimalMode}>
  <div class="label">
    {#if grouping}
      <span class="grouping">
        {grouping == 'COUNT DISTINCT' ? 'distinct' : grouping.toLowerCase()}
      </span>
    {/if}
    <ColumnLabel
      {...column}
      filter={seachInColumns}
      iconOverride={$minimalMode && column.isPrimaryKey ? 'mdi mdi-key-variant color-icon-blue' : undefined}
    />

    {#if _.isString(column.displayedDataType || column.dataType)}
      <span class="data-type" title={column.dataType}>
        {(column.displayedDataType || column.dataType).toLowerCase()}
      </span>
    {/if}
  </div>
  {#if $minimalMode && setSort}
    <span
      class="sort-toggle buttonLike"
      class:active={!!order}
      title={_t('columnHeader.toggleSort', { defaultMessage: 'Sort' })}
      on:click|stopPropagation={handleSortToggle}
      data-testid={`ColumnHeaderControl_sort_${column?.uniqueName}`}
    >
      <FontIcon icon={order == 'DESC' ? 'mdi mdi-menu-down' : 'mdi mdi-menu-up'} />
      {#if order && orderIndex > 0}
        <span class="sort-index">{orderIndex + 1}</span>
      {/if}
    </span>
  {/if}
  {#if order == 'ASC' && !$minimalMode}
    <span class="icon">
      <FontIcon icon="img sort-asc" />
      {#if orderIndex >= 0}
        <span class="color-icon-green order-index">{orderIndex + 1}</span>
      {/if}
    </span>
  {/if}
  {#if order == 'DESC' && !$minimalMode}
    <span class="icon">
      <FontIcon icon="img sort-desc" />
      {#if orderIndex >= 0}
        <span class="color-icon-green order-index">{orderIndex + 1}</span>
      {/if}
    </span>
  {/if}
  <span class="menu-button">
    <DropDownButton
      menu={getMenu}
      narrow
      data-testid={`ColumnHeaderControl_dropdown_${column?.uniqueName}`}
      circleHover
    />
  </span>
  <div class="horizontal-split-handle resizeHandleControl" use:splitterDrag={'clientX'} on:resizeSplitter />
</div>

<style>
  .header {
    display: flex;
    flex-wrap: nowrap;
  }
  .menu-button {
    display: flex;
  }
  .sort-toggle {
    display: flex;
    align-items: center;
    align-self: center;
    padding: 0 2px;
    font-size: 16px;
    border-radius: 4px;
    cursor: pointer;
    color: #5f5f5f;
    transition: color 0.15s ease;
  }
  .sort-toggle:hover {
    color: var(--theme-generic-font);
  }
  .sort-toggle.active {
    color: var(--theme-generic-font-hover);
  }
  .sort-index {
    font-size: 10px;
    margin-left: -2px;
  }
  :global(.minimal-mode) .menu-button {
    display: none;
  }
  :global(.minimal-mode) .label {
    font-weight: 600;
    padding-left: 8px;
  }
  :global(.minimal-mode) .label :global(.notNull) {
    font-weight: inherit;
  }
  :global(.minimal-mode) .data-type {
    font-size: 12px;
    font-weight: normal;
    margin-left: 6px;
    color: var(--theme-generic-font-grayed);
    vertical-align: baseline;
  }
  .order-index {
    font-size: 10pt;
    margin-left: -3px;
    margin-right: 2px;
    top: -1px;
    position: relative;
  }
  .label {
    flex: 1;
    min-width: 10px;
    padding: 2px;
    margin: auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    margin-left: 3px;
    align-self: center;
    font-size: 18px;
  }
  .grouping {
    color: var(--theme-datagrid-cell-foreground-value-green);
    white-space: nowrap;
  }
  .data-type {
    color: var(--theme-generic-font-grayed);
  }
</style>
