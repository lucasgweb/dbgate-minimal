<script lang="ts">
  import { findEngineDriver } from 'dbgate-tools';
  import { currentDatabase, extensions, pinnedDatabases, pinnedTables, savedQueryDatabases, selectedWidget } from '../stores';
  import { useConnectionInfo, useFiles } from '../utility/metadataLoaders';
  import SavedQueriesList from './SavedQueriesList.svelte';

  import PinnedObjectsList from './PinnedObjectsList.svelte';
  import ErrorInfo from '../elements/ErrorInfo.svelte';
  import WidgetsInnerContainer from './WidgetsInnerContainer.svelte';

  import WidgetColumnBarItem from './WidgetColumnBarItem.svelte';
  import SqlObjectList from './SqlObjectList.svelte';
  import RedisKeysTree from './RedisKeysTree.svelte';
  import RestApiContentWidget from './RestApiContentWidget.svelte';
  import _ from 'lodash';
  import FocusedConnectionInfoWidget from './FocusedConnectionInfoWidget.svelte';
  import { _t, _tval } from '../translations';
  import FormStyledButton from '../buttons/FormStyledButton.svelte';

  export let domSqlObjectList = null;
  export let showCloudConnection;

  $: conid = $currentDatabase?.connection?._id;
  $: connection = useConnectionInfo({ conid });
  $: driver = findEngineDriver($connection, $extensions);
  $: singleDatabase = $currentDatabase?.connection?.singleDatabase;
  $: database = $currentDatabase?.name;

  const sqlFiles = useFiles({ folder: 'sql', parseFrontMatter: true });
  $: savedQueries = (($sqlFiles || []) as any[]).filter(file => {
    const remembered = $savedQueryDatabases[file.file];
    if (remembered) return remembered.conid == conid && remembered.database == database;
    return file.connectionId == conid && file.databaseName == database;
  });

  $: correctCloudStatus =
    !conid ||
    (!showCloudConnection && !conid?.startsWith('cloud://')) ||
    (showCloudConnection && conid?.startsWith('cloud://'));
</script>

<WidgetColumnBarItem
  title={_t('widget.pinned', { defaultMessage: 'Pinned' })}
  name="pinned"
  height="15%"
  skip={!_.compact($pinnedDatabases).length &&
    !$pinnedTables.some(x => x && x.conid == conid && x.database == $currentDatabase?.name)}
  positiveCondition={correctCloudStatus}
>
  <PinnedObjectsList />
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={driver?.databaseEngineTypes?.includes('document')
    ? _t('widget.collectionsContainers', { defaultMessage: 'Collections/containers' })
    : _t('widget.tablesViewsFunctions', { defaultMessage: 'Tables, views, functions' })}
  name="dbObjectsSql"
  skip={!(
    conid &&
    (database || singleDatabase) &&
    (driver?.databaseEngineTypes?.includes('sql') || driver?.databaseEngineTypes?.includes('document'))
  )}
  positiveCondition={correctCloudStatus}
>
  <SqlObjectList {conid} {database} bind:this={domSqlObjectList} />
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.savedQueries', { defaultMessage: 'Saved queries' })}
  name="savedQueries"
  height="20%"
  skip={!(conid && database && savedQueries.length > 0)}
  positiveCondition={correctCloudStatus}
>
  <SavedQueriesList files={savedQueries} />
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.keys', { defaultMessage: 'Keys' })}
  name="dbObjectsKeyValue"
  skip={!(conid && (database || singleDatabase) && driver?.databaseEngineTypes?.includes('keyvalue'))}
  positiveCondition={correctCloudStatus}
>
  <RedisKeysTree {conid} {database} treeKeySeparator={$connection?.treeKeySeparator || ':'} />
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.endpoints', { defaultMessage: 'Endpoints' })}
  name="endpoints"
  skip={!(conid && (database || singleDatabase) && driver?.databaseEngineTypes?.includes('rest'))}
  positiveCondition={correctCloudStatus}
>
  <RestApiContentWidget {conid} />
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.databaseContent', { defaultMessage: 'Database content' })}
  name="dbObjectsFocused"
  skip={conid && (database || singleDatabase)}
  positiveCondition={correctCloudStatus}
>
  <WidgetsInnerContainer>
    <FocusedConnectionInfoWidget {conid} {database} connection={$connection} />

    <ErrorInfo message={_tval('Database not selected')} icon="img alert" />
  </WidgetsInnerContainer>
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.databaseContent', { defaultMessage: 'Database content' })}
  name="dbObjectsError"
  skip={!(conid && (database || singleDatabase) && !driver)}
  positiveCondition={correctCloudStatus}
>
  <WidgetsInnerContainer>
    <FocusedConnectionInfoWidget {conid} {database} connection={$connection} />

    <ErrorInfo
      message={_t('error.driverNotFound', { defaultMessage: 'Invalid database connection, driver not found' })}
    />
  </WidgetsInnerContainer>
</WidgetColumnBarItem>

<WidgetColumnBarItem
  title={_t('widget.databaseContent', { defaultMessage: 'Database content' })}
  name="incorrectClaudStatus"
  height="15%"
  skip={correctCloudStatus}
>
  <WidgetsInnerContainer>
    <ErrorInfo
      message={showCloudConnection
        ? _t('error.selectedNotCloudConnection', { defaultMessage: 'Selected connection is not from DbGate cloud' })
        : _t('error.selectedCloudConnection', { defaultMessage: 'Selected connection is from DbGate cloud' })}
    />

    <div class="incorrect-cloud-status-wrapper">
      <FormStyledButton
        value={`Show database content`}
        skipWidth
        on:click={() => {
          $selectedWidget = conid?.startsWith('cloud://') ? 'cloud-private' : 'database';
        }}
      />
    </div>
  </WidgetsInnerContainer>
</WidgetColumnBarItem>

<style>
  .incorrect-cloud-status-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    margin-top: 10px;
  }
</style>
