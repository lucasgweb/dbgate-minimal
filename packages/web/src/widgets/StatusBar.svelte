<script lang="ts">
  import { _t, getSelectedLanguage } from '../translations';

  // relative time in the UI language ("há 5 minutos"), instead of moment's English fromNow()
  function formatTimeAgo(time) {
    const seconds = Math.round((new Date(time).getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    let language = 'en';
    try {
      language = getSelectedLanguage() || 'en';
    } catch {}
    const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    if (abs < 45) return _t('statusBar.justNow', { defaultMessage: 'just now' });
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    return rtf.format(Math.round(seconds / 86400), 'day');
  }
  import _ from 'lodash';
  import moment from 'moment';
  import { showModal } from '../modals/modalTools';
  import ChooseConnectionColorModal from '../modals/ChooseConnectionColorModal.svelte';

  import FontIcon from '../icons/FontIcon.svelte';

  import {
    activeTabId,
    appUpdateStatus,
    cloudSigninTokenHolder,
    currentArchive,
    currentDatabase,
    extensions,
    selectedWidget,
    visibleCommandPalette,
  } from '../stores';
  import { findEngineDriver, getConnectionLabel } from 'dbgate-tools';
  import {
    useConfig,
    useConnectionList,
    useDatabaseServerVersion,
    useDatabaseStatus,
    useRestStatus,
  } from '../utility/metadataLoaders';
  import { findCommand } from '../commands/runCommand';
  import { useConnectionColor } from '../utility/useConnectionColor';
  import { apiCall } from '../utility/api';
  import { statusBarTabInfo } from '../utility/statusBarStore';
  import { isProApp } from '../utility/proTools';

  $: databaseName = $currentDatabase && $currentDatabase.name;
  $: connection = $currentDatabase && $currentDatabase.connection;
  $: driver = findEngineDriver(connection, $extensions);
  $: isRestConnection = driver?.databaseEngineTypes?.includes('rest');
  $: dbid = connection ? { conid: connection._id, database: databaseName } : null;
  $: databaseStatus = useDatabaseStatus(dbid || {});
  $: restStatus = useRestStatus(connection ? { conid: connection._id } : {});
  $: status = isRestConnection ? restStatus : databaseStatus;
  $: serverVersion = useDatabaseServerVersion(dbid || {});
  $: config = useConfig();

  $: contextItems = $statusBarTabInfo[$activeTabId] as any[];
  $: connectionLabel = getConnectionLabel(connection, { allowExplicitDatabase: false });

  $: connectionBackground = useConnectionColor(dbid, 'statusbar', 'background: ', true);
  $: connectionButtonForeground = useConnectionColor(
    dbid ? { conid: dbid.conid } : null,
    'foreground',
    'color: ',
    true
  );
  $: databaseButtonForeground = useConnectionColor(dbid, 'foreground', 'color: ', false);

  let timerValue = 1;

  setInterval(() => {
    timerValue++;
  }, 10000);

  async function handleSyncModel() {
    if (connection && databaseName) {
      await apiCall('database-connections/sync-model', { conid: connection._id, database: databaseName });
    }
  }
</script>

<div class="main" style={$connectionBackground}>
  <div class="container">
    {#if databaseName && databaseName != '_api_database_'}
      <div class="item">
        {#if connection?.isReadOnly}
          <FontIcon icon="icon lock" padRight />
        {:else}
          <FontIcon icon="icon database" padRight />
        {/if}
        {databaseName}
      </div>
      {#if dbid && databaseName != '_api_database_'}
        <div
          class="item clickable"
          title={_t('statusBar.databaseColor', { defaultMessage: 'Database color. Overrides connection color' })}
          on:click={() => {
            showModal(ChooseConnectionColorModal, {
              ...dbid,
              header: 'Choose database color',
              text: _t('statusBar.databaseColorInfo', { defaultMessage: 'This color override connection color for specific database.' }),
            });
          }}
        >
          <div style={$databaseButtonForeground} class="colorbox">
            <FontIcon icon="icon palette" />
          </div>
        </div>
      {/if}
    {/if}
    {#if connectionLabel}
      <div class="item">
        <FontIcon icon={databaseName == '_api_database_' ? 'icon api' : 'icon server'} padRight />
        {connectionLabel}
      </div>
      {#if dbid}
        <div
          class="item clickable"
          title={_t('statusBar.connectionColor', { defaultMessage: 'Connection color. Can be overriden by database color' })}
          on:click={() => {
            showModal(ChooseConnectionColorModal, {
              conid: dbid.conid,
              header: 'Choose connection color',
              text: _t('statusBar.connectionColorInfo', { defaultMessage: 'This color serves as default color for all databases in this connection.' }),
            });
          }}
        >
          <div style={$connectionButtonForeground} class="colorbox">
            <FontIcon icon="icon palette" />
          </div>
        </div>
      {/if}
    {/if}
    {#if connection && connection.user}
      <div class="item">
        <FontIcon icon="icon account" padRight />
        {connection.user}
      </div>
    {/if}
    {#if connection && $status}
      <div class="item clickable" on:click={() => visibleCommandPalette.set(findCommand('database.changeState'))}>
        {#if $status.name == 'pending'}
          <FontIcon icon="icon loading" padRight /> {_t('statusBar.loading', { defaultMessage: 'Loading' })}
        {:else if $status.name == 'checkStructure'}
          <FontIcon icon="icon loading" padRight /> {_t('statusBar.checkingModel', { defaultMessage: 'Checking model' })}
        {:else if $status.name == 'loadStructure'}
          <FontIcon icon="icon loading" padRight /> {_t('statusBar.loadingModel', { defaultMessage: 'Loading model' })}
        {:else if $status.name == 'ok'}
          <FontIcon icon="img ok-statusbar" padRight /> {_t('statusBar.connected', { defaultMessage: 'Connected' })}
        {:else if $status.name == 'error'}
          <FontIcon icon="img error-statusbar" padRight /> {_t('statusBar.error', { defaultMessage: 'Error' })}
        {/if}
      </div>
    {/if}
    {#if !connection}
      <div class="item">
        <FontIcon icon="icon disconnected" padRight /> {_t('statusBar.notConnected', { defaultMessage: 'Not connected' })}
      </div>
    {/if}
    {#if $serverVersion}
      <div class="item flex" title={$serverVersion.version}>
        <FontIcon icon="icon version" padRight />
        <div class="version">
          {$serverVersion.versionText || $serverVersion.version}
        </div>
      </div>
    {/if}
    {#if $status?.analysedTime}
      <div
        class="item flex clickable"
        title={_t('statusBar.modelRefreshInfo', {
          defaultMessage: 'Last {databaseName} model refresh: {time}\nClick to refresh DB model',
          values: { databaseName, time: moment($status?.analysedTime).format('HH:mm:ss') },
        })}
        on:click={handleSyncModel}
      >
        <FontIcon icon="icon history" padRight />
        <div class="version ml-1">
          {formatTimeAgo($status?.analysedTime) + (timerValue ? '' : '')}
        </div>
      </div>
    {/if}
    {#if isProApp() && $currentArchive && $currentArchive != 'default'}
      <div
        class="item flex clickable"
        title={_t('statusBar.currentArchive', { defaultMessage: 'Current archive' })}
        on:click={() => {
          $selectedWidget = 'archive';
        }}
      >
        <FontIcon icon="icon archive" padRight />
        {$currentArchive}
      </div>
    {/if}
  </div>
  <div class="container">
    {#each contextItems || [] as item}
      <div class="item" class:clickable={item.clickable} on:click={item.onClick} title={item.title || null}>
        {#if item.icon}
          <FontIcon icon={item.icon} padRight />
        {/if}
        {item.text}
      </div>
    {/each}

    {#if $config?.isUserLoggedIn && $config?.login}
      <div class="item clickable" on:click={() => visibleCommandPalette.set(findCommand('app.loggedUserCommands'))}>
        <FontIcon icon="icon users" padRight />
        {$config?.login}
      </div>
    {/if}

    {#if $cloudSigninTokenHolder?.email}
      <div class="item">
        <FontIcon icon="icon cloud" padRight />
        {$cloudSigninTokenHolder?.email}
      </div>
    {/if}

    {#if $appUpdateStatus}
      <div class="item">
        <FontIcon icon={$appUpdateStatus.icon} padRight />
        {$appUpdateStatus.message}
      </div>
    {/if}
  </div>
</div>

<style>
  .main {
    display: flex;
    color: var(--theme-statusbar-foreground);
    align-items: stretch;
    justify-content: space-between;
    cursor: default;
    flex: 1;
  }
  .container {
    display: flex;
    align-items: stretch;
  }
  .item {
    padding: 0px 10px;
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .version {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background-color: var(--theme-statusbar-background-hover);
  }

  .colorbox {
    padding: 0px 5px;
    border-radius: 4px;
    color: var(--theme-statusbar-button-foreground);
    background: var(--theme-statusbar-button-background);
  }
</style>
