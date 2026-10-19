<script lang="ts" context="module">
  export const matchingProps = ['conid', 'database', 'sql'];
</script>

<script lang="ts">
  // execution plan of a query: a tree of plan steps with their share of time/cost (visual for PostgreSQL)
  import _ from 'lodash';
  import { onMount } from 'svelte';
  import { findEngineDriver } from 'dbgate-tools';
  import { apiCall } from '../utility/api';
  import { useConnectionInfo } from '../utility/metadataLoaders';
  import { extensions } from '../stores';
  import { _t } from '../translations';
  import FontIcon from '../icons/FontIcon.svelte';
  import LoadingInfo from '../elements/LoadingInfo.svelte';
  import ErrorInfo from '../elements/ErrorInfo.svelte';
  import FormStyledButton from '../buttons/FormStyledButton.svelte';
  import { analyseDangerousSql } from '../utility/dangerousSql';

  export let conid;
  export let database;
  export let sql;
  export let analyze = false;

  $: connection = useConnectionInfo({ conid });
  $: driver = findEngineDriver($connection, $extensions);
  $: engineName = (driver?.engine || '').split('@')[0];
  $: isPostgres = /^(postgres|cockroach|redshift)/.test(engineName);

  let loading = false;
  let errorMessage = null;
  let planJson = null;
  let tableResult = null;
  let showJson = false;
  let useAnalyze = analyze;

  // ANALYZE really executes the statement, allowed only for queries not changing data
  $: canAnalyze = isPostgres && analyseDangerousSql(sql || '', driver?.getQuerySplitterOptions('script')).modifying.length == 0;

  const cleanSql = text => (text || '').trim().replace(/;\s*$/, '');

  async function load() {
    if (!driver) return;
    loading = true;
    errorMessage = null;
    planJson = null;
    tableResult = null;
    let explainSql;
    if (isPostgres) {
      explainSql = `EXPLAIN (FORMAT JSON${useAnalyze && canAnalyze ? ', ANALYZE, BUFFERS' : ''}) ${cleanSql(sql)}`;
    } else if (engineName.startsWith('sqlite')) {
      explainSql = `EXPLAIN QUERY PLAN ${cleanSql(sql)}`;
    } else if (engineName.startsWith('mssql')) {
      loading = false;
      errorMessage = _t('explain.notSupported', {
        defaultMessage: 'The execution plan is not available for this database type yet.',
      });
      return;
    } else {
      explainSql = `EXPLAIN ${cleanSql(sql)}`;
    }
    const resp = await apiCall('database-connections/query-data', { conid, database, sql: explainSql });
    loading = false;
    if (resp?.errorMessage) {
      errorMessage = resp.errorMessage;
      return;
    }
    if (isPostgres) {
      let value = resp?.rows?.[0] ? Object.values(resp.rows[0])[0] : null;
      if (_.isString(value)) {
        try {
          value = JSON.parse(value);
        } catch (err) {}
      }
      planJson = _.isArray(value) ? value[0] : value;
      if (!planJson?.Plan) errorMessage = _t('explain.noPlan', { defaultMessage: 'The database returned no plan.' });
    } else {
      tableResult = resp;
    }
  }

  // --- PostgreSQL plan tree ---
  const metric = (node, timed) =>
    timed ? (node['Actual Total Time'] || 0) * (node['Actual Loops'] || 1) : node['Total Cost'] || 0;

  function flatten(node, timed, depth = 0, res = []) {
    const children = node.Plans || [];
    const exclusive = Math.max(0, metric(node, timed) - _.sumBy(children, child => metric(child, timed)));
    const item = { node, depth, exclusive, percent: 0 };
    res.push(item);
    for (const child of children) flatten(child, timed, depth + 1, res);
    return res;
  }

  $: timed = !!planJson && planJson.Plan?.['Actual Total Time'] != null;
  function withPercent(items) {
    const total = _.sumBy(items, 'exclusive') || 1;
    return items.map(x => ({ ...x, percent: (x.exclusive / total) * 100 }));
  }

  $: rows = planJson?.Plan ? withPercent(flatten(planJson.Plan, timed)) : [];
  $: slowest = _.orderBy(rows, 'percent', 'desc')
    .filter(x => x.percent >= 10)
    .slice(0, 3);

  function title(node) {
    let res = node['Node Type'];
    if (node['Join Type'] && node['Join Type'] != 'Inner') res += ` (${node['Join Type']})`;
    if (node['Relation Name']) {
      res += ` ${_t('explain.on', { defaultMessage: 'on' })} ${node['Relation Name']}`;
      if (node.Alias && node.Alias != node['Relation Name']) res += ` ${node.Alias}`;
    }
    if (node['Index Name']) res += ` ${_t('explain.using', { defaultMessage: 'using' })} ${node['Index Name']}`;
    return res;
  }

  function details(node) {
    if (timed) {
      return _t('explain.detailsTimed', {
        defaultMessage: '{time} ms · {rows} rows (estimated {estimated}) · {loops} loops',
        values: {
          time: ((node['Actual Total Time'] || 0) * (node['Actual Loops'] || 1)).toFixed(2),
          rows: (node['Actual Rows'] ?? 0).toLocaleString(),
          estimated: (node['Plan Rows'] ?? 0).toLocaleString(),
          loops: node['Actual Loops'] ?? 1,
        },
      });
    }
    return _t('explain.detailsCost', {
      defaultMessage: 'cost {cost} · ~{rows} rows',
      values: { cost: (node['Total Cost'] ?? 0).toLocaleString(), rows: (node['Plan Rows'] ?? 0).toLocaleString() },
    });
  }

  const CONDITION_FIELDS = [
    'Index Cond',
    'Filter',
    'Join Filter',
    'Hash Cond',
    'Merge Cond',
    'Recheck Cond',
    'Sort Key',
    'Group Key',
  ];

  function conditions(node) {
    return CONDITION_FIELDS.filter(field => node[field]).map(field => ({
      field,
      value: _.isArray(node[field]) ? node[field].join(', ') : node[field],
    }));
  }

  function hints(node) {
    const res = [];
    const rowCount = timed ? (node['Actual Rows'] || 0) * (node['Actual Loops'] || 1) : node['Plan Rows'] || 0;
    if (node['Node Type'] == 'Seq Scan' && rowCount + (node['Rows Removed by Filter'] || 0) > 10000) {
      res.push(
        node.Filter
          ? _t('explain.hintSeqScanFilter', {
              defaultMessage: 'Reads the whole table to apply the filter; an index on the filtered columns may help',
            })
          : _t('explain.hintSeqScan', { defaultMessage: 'Reads the whole table' })
      );
    }
    const removed = node['Rows Removed by Filter'] || 0;
    if (removed > 1000 && removed > 10 * (node['Actual Rows'] || 0)) {
      res.push(
        _t('explain.hintRemovedRows', {
          defaultMessage: '{count} rows read and discarded by the filter',
          values: { count: removed.toLocaleString() },
        })
      );
    }
    if (timed && node['Plan Rows'] != null && (node['Actual Rows'] || 0) > 100) {
      const ratio = Math.max(node['Actual Rows'], 1) / Math.max(node['Plan Rows'], 1);
      if (ratio > 10 || ratio < 0.1) {
        res.push(
          _t('explain.hintEstimate', {
            defaultMessage: 'Row estimate is far from reality; run ANALYZE on the table to update statistics',
          })
        );
      }
    }
    if (node['Sort Space Type'] == 'Disk') {
      res.push(_t('explain.hintSortDisk', { defaultMessage: 'Sorting used the disk (not enough work_mem)' }));
    }
    return res;
  }

  const level = percent => (percent >= 50 ? 'high' : percent >= 20 ? 'medium' : 'low');

  onMount(() => {
    const unsubscribe = connection.subscribe(value => {
      if (value && !planJson && !tableResult && !loading && !errorMessage) {
        setTimeout(load);
      }
    });
    return unsubscribe;
  });
</script>

<div class="wrapper">
  <div class="toolbar">
    <div class="sql" title={sql}>{cleanSql(sql).replace(/\s+/g, ' ')}</div>
    {#if canAnalyze}
      <label class="analyze" title={_t('explain.analyzeHint', { defaultMessage: 'Runs the query to measure real times' })}>
        <input
          type="checkbox"
          bind:checked={useAnalyze}
          on:change={load}
          data-testid="ExplainPlanTab_analyze"
        />
        {_t('explain.realTimes', { defaultMessage: 'Real times (ANALYZE)' })}
      </label>
    {/if}
    {#if planJson}
      <FormStyledButton
        type="button"
        outline
        skipWidth
        value={showJson ? _t('explain.showTree', { defaultMessage: 'Tree' }) : 'JSON'}
        on:click={() => (showJson = !showJson)}
      />
    {/if}
    <FormStyledButton type="button" outline skipWidth value={_t('common.refresh', { defaultMessage: 'Refresh' })} on:click={load} />
  </div>

  <div class="content">
    {#if loading}
      <LoadingInfo message={_t('explain.loading', { defaultMessage: 'Loading execution plan' })} />
    {:else if errorMessage}
      <ErrorInfo message={errorMessage} />
    {:else if planJson && showJson}
      <pre class="json">{JSON.stringify(planJson, null, 2)}</pre>
    {:else if planJson}
      <div class="summary">
        {#if timed}
          <div class="summary-item">
            <span class="summary-value">{(planJson['Execution Time'] ?? 0).toFixed(2)} ms</span>
            <span class="summary-label">{_t('explain.executionTime', { defaultMessage: 'execution' })}</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{(planJson['Planning Time'] ?? 0).toFixed(2)} ms</span>
            <span class="summary-label">{_t('explain.planningTime', { defaultMessage: 'planning' })}</span>
          </div>
        {:else}
          <div class="summary-item">
            <span class="summary-value">{(planJson.Plan['Total Cost'] ?? 0).toLocaleString()}</span>
            <span class="summary-label">{_t('explain.estimatedCost', { defaultMessage: 'estimated cost' })}</span>
          </div>
          <div class="summary-note">
            {_t('explain.estimatedNote', {
              defaultMessage: 'Estimates only. Check "Real times" to measure the query.',
            })}
          </div>
        {/if}
        {#if slowest.length > 0}
          <div class="slowest">
            <span class="summary-label">{_t('explain.slowest', { defaultMessage: 'Slowest steps' })}:</span>
            {#each slowest as item}
              <span class={`chip ${level(item.percent)}`}>{item.node['Node Type']} {item.percent.toFixed(0)}%</span>
            {/each}
          </div>
        {/if}
      </div>

      <div class="tree">
        {#each rows as item}
          <div class={`step ${level(item.percent)}`} style:padding-left={`${12 + item.depth * 22}px`}>
            <div class="step-head">
              <div class="bar" title={`${item.percent.toFixed(1)}%`}>
                <div class="bar-fill" style:width={`${Math.max(item.percent, 1)}%`} />
              </div>
              <span class="percent">{item.percent.toFixed(0)}%</span>
              <span class="step-title">{title(item.node)}</span>
              <span class="step-details">{details(item.node)}</span>
            </div>
            {#each conditions(item.node) as condition}
              <div class="condition"><span>{condition.field}:</span> <code>{condition.value}</code></div>
            {/each}
            {#each hints(item.node) as hint}
              <div class="hint"><FontIcon icon="mdi mdi-lightbulb-on-outline" /> {hint}</div>
            {/each}
          </div>
        {/each}
      </div>
    {:else if tableResult}
      <table class="plain-table">
        <thead>
          <tr>
            {#each tableResult.columns || [] as column}
              <th>{column.columnName}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each tableResult.rows || [] as row}
            <tr>
              {#each tableResult.columns || [] as column}
                <td>{row[column.columnName] ?? ''}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .wrapper {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-content-background);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: var(--theme-table-border);
  }

  .sql {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .analyze {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    cursor: pointer;
  }

  .content {
    flex: 1;
    overflow: auto;
    padding: 12px 0;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 24px;
    padding: 0 16px 12px;
    border-bottom: var(--theme-table-border);
  }

  .summary-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 600;
  }

  .summary-label,
  .summary-note {
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .slowest {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 12px;
    background: color-mix(in srgb, var(--tw-color-sky-500) 16%, transparent);
  }
  .chip.medium {
    background: color-mix(in srgb, var(--tw-color-amber-500) 20%, transparent);
  }
  .chip.high {
    background: color-mix(in srgb, var(--tw-color-red-500) 22%, transparent);
  }

  .tree {
    padding-top: 8px;
  }

  .step {
    padding-top: 6px;
    padding-bottom: 6px;
    padding-right: 16px;
  }
  .step:hover {
    background: var(--theme-table-hover-background);
  }

  .step-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .bar {
    flex-shrink: 0;
    width: 70px;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--theme-generic-font) 10%, transparent);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--tw-color-sky-500);
  }
  .step.medium .bar-fill {
    background: var(--tw-color-amber-500);
  }
  .step.high .bar-fill {
    background: var(--tw-color-red-500);
  }

  .percent {
    flex-shrink: 0;
    width: 36px;
    text-align: right;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }
  .step.high .percent {
    color: var(--tw-color-red-400);
    font-weight: 600;
  }

  .step-title {
    font-weight: 600;
    white-space: nowrap;
  }

  .step-details {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .condition,
  .hint {
    margin-left: 126px;
    margin-top: 3px;
    font-size: 12px;
  }
  .condition span {
    color: var(--theme-generic-font-grayed);
  }
  .condition code {
    font-size: 12px;
  }
  .hint {
    color: var(--tw-color-amber-400);
  }

  .json {
    margin: 0 16px;
    font-size: 12px;
    white-space: pre-wrap;
  }

  .plain-table {
    margin: 0 16px;
    border-collapse: collapse;
    font-size: 12px;
  }
  .plain-table th,
  .plain-table td {
    padding: 4px 10px;
    border: var(--theme-table-border);
    text-align: left;
    white-space: pre;
  }
</style>
