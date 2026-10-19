<script lang="ts">
  import _ from 'lodash';

  import SearchBoxWrapper from '../elements/SearchBoxWrapper.svelte';
  import SearchInput from '../elements/SearchInput.svelte';
  import WidgetsInnerContainer from '../widgets/WidgetsInnerContainer.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { onMount } from 'svelte';
  import openNewTab from '../utility/openNewTab';
  import CloseSearchButton from '../buttons/CloseSearchButton.svelte';
  import { apiCall, apiOff, apiOn } from '../utility/api';
  import { _t } from '../translations';
  import { trackUsage } from '../utility/usageAnalytics';
  import { getConnectionInfo } from '../utility/metadataLoaders';
  import { currentDatabase } from '../stores';
  import { copyTextToClipboard } from '../utility/clipboard';
  import { showSnackbarSuccess } from '../utility/snackbar';

  let filter = '';
  let search = '';
  // show only queries run on the current database
  let onlyCurrentDatabase = false;

  let historyItems = [];

  $: conid = $currentDatabase?.connection?._id;
  $: database = $currentDatabase?.name;

  async function reloadItems() {
    const resp = await apiCall('query-history/read', {
      filter: search,
      limit: 200,
      ...(onlyCurrentDatabase && conid ? { conid, database } : {}),
    });
    historyItems = resp || [];
  }

  $: {
    search;
    onlyCurrentDatabase;
    conid;
    database;
    reloadItems();
  }

  /** The executed SQL is never sent, only that a history item was opened. */
  async function trackHistoryOpen(item) {
    let engine;
    try {
      engine = (await getConnectionInfo({ conid: item.conid }))?.engine;
    } catch {
      // Analytics must not depend on metadata loading.
    }
    trackUsage({ feature: 'query_history', action: 'open', engine });
  }

  function openItem(item) {
    trackHistoryOpen(item);
    openNewTab(
      {
        title: _t('database.queryDesigner', { defaultMessage: 'Query #' }),
        icon: 'icon sql-file',
        tabComponent: 'QueryTab',
        focused: true,
        props: {
          conid: item.conid,
          database: item.database,
        },
      },
      { editor: item.sql }
    );
  }

  function formatDate(time) {
    if (!time) return '';
    const date = new Date(time);
    const now = new Date();
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (minutes < 1) return _t('history.justNow', { defaultMessage: 'just now' });
    if (minutes < 60) return _t('history.minutesAgo', { defaultMessage: '{count} min ago', values: { count: minutes } });
    const time24 = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() == now.toDateString()) return time24;
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    if (date.toDateString() == yesterday.toDateString()) {
      return `${_t('history.yesterday', { defaultMessage: 'yesterday' })} ${time24}`;
    }
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })} ${time24}`;
  }

  const setDebouncedFilter = _.debounce(value => (search = value), 300);

  $: setDebouncedFilter(filter);

  onMount(() => {
    apiOn('query-history-changed', reloadItems);
    return () => {
      apiOff('query-history-changed', reloadItems);
    };
  });
</script>

<SearchBoxWrapper {filter}>
  <SearchInput
    placeholder={_t('history.searchQueryHistory', { defaultMessage: 'Search query history' })}
    {filter}
    bind:value={filter}
  />
  <CloseSearchButton
    bind:filter
    on:click={() => {
      search = '';
    }}
  />
</SearchBoxWrapper>
{#if conid && database}
  <label class="only-current" data-testid="QueryHistoryList_onlyCurrentDatabase">
    <input type="checkbox" bind:checked={onlyCurrentDatabase} />
    {_t('history.onlyCurrentDatabase', { defaultMessage: 'Only {database}', values: { database } })}
  </label>
{/if}
<WidgetsInnerContainer>
  {#each historyItems as item}
    <div class="wrapper" title={item.sql} on:click={() => openItem(item)}>
      <div class="sql">{item.sql}</div>
      <div class="info">
        <span class="database">
          <FontIcon icon="icon database" />
          {item.database || '-'}
        </span>
        <span class="date">{formatDate(item.date)}</span>
        <span
          class="copy"
          title={_t('common.copy', { defaultMessage: 'Copy' })}
          on:click|stopPropagation={() => {
            copyTextToClipboard(item.sql);
            showSnackbarSuccess(_t('history.copied', { defaultMessage: 'SQL copied to clipboard' }));
          }}
        >
          <FontIcon icon="icon copy" />
        </span>
      </div>
    </div>
  {:else}
    <div class="empty">
      {search
        ? _t('history.noMatch', { defaultMessage: 'No query matches the search' })
        : _t('history.empty', { defaultMessage: 'Executed queries will appear here' })}
    </div>
  {/each}
</WidgetsInnerContainer>

<style>
  .only-current {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 6px;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
    cursor: pointer;
  }

  .wrapper {
    padding: 6px 10px;
    cursor: pointer;
  }
  .wrapper:hover {
    background-color: var(--theme-content-background-hover);
  }

  .sql {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--theme-generic-font-grayed);
  }

  .database {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    white-space: nowrap;
  }

  .copy {
    visibility: hidden;
    padding: 0 2px;
  }
  .wrapper:hover .copy {
    visibility: visible;
  }
  .copy:hover {
    color: var(--theme-generic-font);
  }

  .empty {
    padding: 20px 10px;
    text-align: center;
    color: var(--theme-generic-font-grayed);
    font-size: 12px;
  }
</style>
