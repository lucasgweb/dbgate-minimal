<script lang="ts">
  // Beekeeper-like quick filters: rows of column | operator | value, all combined with AND,
  // translated to DbGate filter expressions (conditions on the same column are joined with a space = AND)
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
    // any other DbGate filter expression (e.g. set by "Filter selected value"), kept as typed
    { value: 'raw', prefix: '', label: _t('filterBar.expression', { defaultMessage: 'expression' }) },
  ];

  let nextId = 1;
  const newRow = (columnName = null, operator = 'equals', value = '') => ({
    id: nextId++,
    columnName: columnName ?? columns?.[0]?.uniqueName ?? null,
    operator,
    value,
  });

  let rows = [newRow()];
  let appliedColumns: string[] = [];
  let lastSignature = null;

  $: if (columns?.length > 0) {
    for (const row of rows) if (!row.columnName) row.columnName = columns[0].uniqueName;
  }
  $: hasApplied = appliedColumns.some(col => !!display?.config?.filters?.[col]);

  // the bar always shows the active filters, also those applied elsewhere (column menu, "Filter selected value"...)
  $: syncFromConfig(display?.config?.filters);

  function activeFilters(filters) {
    return Object.fromEntries(Object.entries(filters || {}).filter(([, value]) => !!value));
  }

  const signatureOf = filters => JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));

  function unquote(text: string) {
    const quoted = text.match(/^"((?:\\.|[^"\\])*)"$/);
    if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
    return /\s/.test(text) ? null : text;
  }

  function parseExpression(expression: string) {
    const text = expression.trim();
    if (/^not\s+null$/i.test(text)) return { operator: 'isNotNull', value: '' };
    if (/^null$/i.test(text)) return { operator: 'isNull', value: '' };
    const prefixed = OPERATORS.filter(x => x.prefix).sort((a, b) => b.prefix.length - a.prefix.length);
    for (const op of prefixed) {
      if (!text.startsWith(op.prefix)) continue;
      const value = unquote(text.substring(op.prefix.length));
      if (value != null) return { operator: op.value, value };
    }
    return { operator: 'raw', value: text };
  }

  function syncFromConfig(filters) {
    const active = activeFilters(filters);
    const signature = signatureOf(active);
    if (signature == lastSignature) return;
    lastSignature = signature;
    const parsed = Object.entries(active).map(([columnName, expression]) => {
      const { operator, value } = parseExpression(String(expression));
      return newRow(columnName, operator, value);
    });
    rows = parsed.length > 0 ? parsed : [newRow()];
    appliedColumns = Object.keys(active);
  }

  const operatorOf = row => OPERATORS.find(x => x.value == row.operator);
  const needsValue = row => !operatorOf(row)?.expression;

  function quoteValue(text: string) {
    if (/^[^\s,'"]+$/.test(text)) return text;
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function rowExpression(row) {
    const op = operatorOf(row);
    if (!row.columnName || !op) return null;
    if (op.expression) return op.expression;
    const value = String(row.value ?? '').trim();
    if (!value) return null;
    if (op.value == 'raw') return value;
    return `${op.prefix}${quoteValue(value)}`;
  }

  function apply() {
    if (!display) return;
    const filters = {};
    for (const row of rows) {
      const expression = rowExpression(row);
      if (!expression) continue;
      filters[row.columnName] = filters[row.columnName] ? `${filters[row.columnName]} ${expression}` : expression;
    }
    const current = Object.keys(activeFilters(display.config?.filters));
    const removed = [...new Set([...appliedColumns, ...current])].filter(col => !(col in filters));
    // the rows typed here are the new state: don't rebuild them when the config change comes back
    lastSignature = signatureOf(filters);
    display.setFilters({ ...Object.fromEntries(removed.map(col => [col, ''])), ...filters });
    appliedColumns = Object.keys(filters);
    // empty rows are dropped once the filter is applied
    const filled = rows.filter(row => rowExpression(row));
    rows = filled.length > 0 ? filled : [newRow()];
  }

  // collapsed: one line with a summary of the active filters
  let collapsed = false;
  const columnLabel = name => {
    const col = columns?.find(x => x.uniqueName == name);
    return col?.headerText || col?.columnName || name;
  };
  $: summary = rows
    .filter(row => rowExpression(row))
    .map(row => {
      const op = operatorOf(row);
      return [columnLabel(row.columnName), op?.value == 'raw' ? ':' : op?.label, op?.expression ? '' : row.value]
        .filter(Boolean)
        .join(' ');
    });

  function clearAll() {
    const current = [...new Set([...appliedColumns, ...Object.keys(activeFilters(display?.config?.filters))])];
    lastSignature = signatureOf({});
    if (display && current.length > 0) {
      display.setFilters(Object.fromEntries(current.map(col => [col, ''])));
    }
    appliedColumns = [];
    rows = [newRow()];
  }

  function addRow() {
    rows = [...rows, newRow()];
  }

  function removeRow(id) {
    rows = rows.filter(x => x.id != id);
    if (rows.length == 0) rows = [newRow()];
    apply();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key == 'Enter') {
      e.preventDefault();
      apply();
    }
    if (e.key == 'Escape') {
      clearAll();
    }
  }
</script>

<div class="filter-bar" data-testid="DataGridFilterBar">
  {#if collapsed}
    <div class="filter-row">
      <button
        class="bar-button toggle"
        on:click={() => (collapsed = false)}
        title={_t('filterBar.expand', { defaultMessage: 'Expand filters' })}
      >
        <FontIcon icon="icon filter" />
        <FontIcon icon="icon chevron-down" />
      </button>
      <button class="summary" on:click={() => (collapsed = false)}>
        {#if summary.length > 0}
          {#each summary as item}
            <span class="chip">{item}</span>
          {/each}
          <span class="count">({summary.length})</span>
        {:else}
          <span class="no-filter">{_t('filterBar.noFilter', { defaultMessage: 'No filter' })}</span>
        {/if}
      </button>
      {#if hasApplied}
        <button class="clear-button" on:click={clearAll}>{_t('filterBar.clearAll', { defaultMessage: 'Clear filters' })}</button>
      {/if}
    </div>
  {:else}
  {#each rows as row, index (row.id)}
    <div class="filter-row">
      {#if index == 0}
        <!-- same place in both states, so it doesn't move when collapsing -->
        <button
          class="bar-button toggle"
          on:click={() => (collapsed = true)}
          title={_t('filterBar.collapse', { defaultMessage: 'Collapse filters' })}
        >
          <FontIcon icon="icon filter" />
          <FontIcon icon="icon chevron-up" />
        </button>
      {:else}
        <span class="bar-icon"><span class="and">{_t('filterBar.and', { defaultMessage: 'and' })}</span></span>
      {/if}
      <select class="column" bind:value={row.columnName}>
        {#each columns as col (col.uniqueName)}
          <option value={col.uniqueName}>{col.headerText || col.columnName || col.uniqueName}</option>
        {/each}
      </select>
      <select class="operator" bind:value={row.operator}>
        {#each OPERATORS as op (op.value)}
          <option value={op.value}>{op.label}</option>
        {/each}
      </select>
      <input
        type="text"
        class="value"
        bind:value={row.value}
        disabled={!needsValue(row)}
        placeholder={needsValue(row) ? _t('filterBar.enterValue', { defaultMessage: 'Enter value and press Enter' }) : ''}
        on:keydown={handleKeyDown}
      />
      <!-- remove this filter (kept as an empty slot when there is nothing to remove, so buttons stay aligned) -->
      {#if rows.length > 1 || rowExpression(row)}
        <button
          class="bar-button"
          on:click={() => removeRow(row.id)}
          title={_t('filterBar.removeFilter', { defaultMessage: 'Remove filter' })}
        >
          <FontIcon icon="icon close" />
        </button>
      {:else}
        <span class="bar-button-slot" />
      {/if}
      {#if index == rows.length - 1}
        <button class="bar-button" on:click={addRow} title={_t('filterBar.addFilter', { defaultMessage: 'Add filter' })}>
          <FontIcon icon="icon plus-thick" />
        </button>
        <button class="bar-button apply" on:click={apply} title={_t('filterBar.apply', { defaultMessage: 'Apply filter' })}>
          <FontIcon icon="icon arrow-right" />
        </button>
        {#if hasApplied}
          <button class="clear-button" on:click={clearAll}>{_t('filterBar.clearAll', { defaultMessage: 'Clear filters' })}</button>
        {/if}
      {/if}
    </div>
  {/each}
  {/if}
</div>

<style>
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    box-sizing: border-box;
    background: var(--theme-datagrid-background);
    border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bar-icon {
    width: 44px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    color: var(--theme-generic-font-grayed);
  }

  .and {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
    flex: 0 1 360px;
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

  .bar-button.toggle {
    width: 44px;
    gap: 1px;
  }

  .bar-button-slot {
    width: 28px;
    flex-shrink: 0;
  }

  .clear-button {
    height: 28px;
    padding: 0 10px;
    flex-shrink: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .clear-button:hover {
    background: var(--theme-sidebar-background-hover);
    color: var(--theme-generic-font);
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 28px;
    padding: 0 6px;
    overflow: hidden;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .summary:hover {
    background: var(--theme-sidebar-background-hover);
  }

  .chip {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--theme-input-background);
    border: 1px solid color-mix(in srgb, var(--theme-input-border-focus-color) 45%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }

  .count,
  .no-filter {
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
  }

  .bar-button:hover {
    background: var(--theme-sidebar-background-hover);
    color: var(--theme-generic-font);
  }
</style>
