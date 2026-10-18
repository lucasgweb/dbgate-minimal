<script lang="ts">
  // Beekeeper-like quick filter: column | operator | value, translated to a DbGate filter expression
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';

  export let display;
  export let columns = [];

  const OPERATORS = [
    { value: 'equals', prefix: '=', label: _t('filterBar.equals', { defaultMessage: 'equals' }) },
    { value: 'notEquals', prefix: '<>', label: _t('filterBar.notEquals', { defaultMessage: 'not equals' }) },
    { value: 'contains', prefix: '+', label: _t('filterBar.contains', { defaultMessage: 'contains' }) },
    { value: 'notContains', prefix: '~', label: _t('filterBar.notContains', { defaultMessage: 'does not contain' }) },
    { value: 'startsWith', prefix: '^', label: _t('filterBar.startsWith', { defaultMessage: 'starts with' }) },
    { value: 'endsWith', prefix: '$', label: _t('filterBar.endsWith', { defaultMessage: 'ends with' }) },
    { value: 'gt', prefix: '>', label: '>' },
    { value: 'ge', prefix: '>=', label: '>=' },
    { value: 'lt', prefix: '<', label: '<' },
    { value: 'le', prefix: '<=', label: '<=' },
    { value: 'isNull', expression: 'NULL', label: _t('filterBar.isNull', { defaultMessage: 'is null' }) },
    { value: 'isNotNull', expression: 'NOT NULL', label: _t('filterBar.isNotNull', { defaultMessage: 'is not null' }) },
  ];

  let columnName = null;
  let operator = 'equals';
  let value = '';
  let appliedColumn = null;

  $: if (!columnName && columns?.length > 0) columnName = columns[0].uniqueName;
  $: operatorDef = OPERATORS.find(x => x.value == operator);
  $: needsValue = !operatorDef?.expression;
  $: isApplied = !!appliedColumn && !!display?.config?.filters?.[appliedColumn];

  function quoteValue(text: string) {
    if (/^[^\s,'"]+$/.test(text)) return text;
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function apply() {
    if (!display || !columnName) return;
    if (needsValue && value.trim() == '') {
      clear();
      return;
    }
    const expression = operatorDef.expression ?? `${operatorDef.prefix}${quoteValue(value.trim())}`;
    if (appliedColumn && appliedColumn != columnName) display.removeFilter(appliedColumn);
    display.setFilter(columnName, expression);
    appliedColumn = columnName;
  }

  function clear() {
    if (appliedColumn && display) display.removeFilter(appliedColumn);
    appliedColumn = null;
    value = '';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key == 'Enter') {
      e.preventDefault();
      apply();
    }
    if (e.key == 'Escape') {
      clear();
    }
  }
</script>

<div class="filter-bar" data-testid="DataGridFilterBar">
  <span class="bar-icon"><FontIcon icon="icon filter" /></span>
  <select class="column" bind:value={columnName} on:change={() => isApplied && apply()}>
    {#each columns as col (col.uniqueName)}
      <option value={col.uniqueName}>{col.headerText || col.columnName || col.uniqueName}</option>
    {/each}
  </select>
  <select class="operator" bind:value={operator} on:change={() => (!needsValue || value.trim()) && apply()}>
    {#each OPERATORS as op (op.value)}
      <option value={op.value}>{op.label}</option>
    {/each}
  </select>
  <input
    type="text"
    class="value"
    bind:value
    disabled={!needsValue}
    placeholder={needsValue ? _t('filterBar.enterValue', { defaultMessage: 'Enter value and press Enter' }) : ''}
    on:keydown={handleKeyDown}
  />
  {#if isApplied}
    <button class="bar-button" on:click={clear} title={_t('filterBar.clear', { defaultMessage: 'Clear filter' })}>
      <FontIcon icon="icon close" />
    </button>
  {/if}
  <button class="bar-button apply" on:click={apply} title={_t('filterBar.apply', { defaultMessage: 'Apply filter' })}>
    <FontIcon icon="icon arrow-right" />
  </button>
</div>

<style>
  .filter-bar {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 40px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    background: var(--theme-datagrid-background);
    border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  .bar-icon {
    color: var(--theme-generic-font-grayed);
    padding: 0 4px;
  }

  select,
  input {
    height: 28px;
    box-sizing: border-box;
    font-size: 13px;
    border: 1px solid transparent;
    border-radius: 6px;
    background-color: var(--theme-input-background);
    color: var(--theme-input-foreground);
    box-shadow: none;
  }

  select {
    padding: 0 10px;
  }

  select:hover,
  input:hover:not(:disabled) {
    border: var(--theme-input-border-hover);
  }

  select:focus,
  input:focus {
    outline: none;
    border: var(--theme-input-border-focus);
  }

  .column {
    width: 180px;
  }

  .operator {
    width: 150px;
  }

  .value {
    flex: 1;
    min-width: 80px;
    padding: 0 10px;
  }

  .value:disabled {
    opacity: 0.4;
  }

  .bar-button {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    cursor: pointer;
  }

  .bar-button:hover {
    background: var(--theme-sidebar-background-hover);
    color: var(--theme-generic-font);
  }
</style>
