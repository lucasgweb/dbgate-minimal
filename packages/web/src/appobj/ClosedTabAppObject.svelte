<script lang="ts" context="module">
  import { _t } from '../translations';
  export const extractKey = data => data.tabid;

  export const createMatcher =
    filter =>
    ({ title }) =>
      filterName(filter, title);
</script>

<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import { openedTabs } from '../stores';
  import { setSelectedTabFunc } from '../utility/common';
  import moment from 'moment';

  import AppObjectCore from './AppObjectCore.svelte';
  import { trackObjectTree } from './appObjectTools';
  import { filterName } from 'dbgate-tools';

  export let data;

  const handleDelete = () => {
    trackObjectTree('delete', 'closed_tab');
    openedTabs.update(tabs => tabs.filter(x => x.tabid != data.tabid));
  };
  const handleDeleteOlder = () => {
    trackObjectTree('delete_older', 'closed_tab');
    openedTabs.update(tabs => tabs.filter(x => !x.closedTime || x.closedTime >= data.closedTime));
  };

  const onClick = () => {
    openedTabs.update(files =>
      setSelectedTabFunc(
        files.map(x => ({
          ...x,
          closedTime: x.tabid == data.tabid ? undefined : x.closedTime,
        })),
        data.tabid
      )
    );
  };

  function createMenu() {
    return [
      { text: _t('closedTab.delete', { defaultMessage: 'Delete' }), onClick: handleDelete },
      { text: _t('closedTab.deleteOlder', { defaultMessage: 'Delete older' }), onClick: handleDeleteOlder },
    ];
  }
</script>

<AppObjectCore
  {...$$restProps}
  {data}
  title={`${data.title} ${moment(data.closedTime).fromNow()}`}
  icon={data.icon}
  isBold={!!data.selected}
  on:click={onClick}
  isBusy={data.busy}
  menu={createMenu}
>
  {#if data.props && data.props.database}
    <div class="info">
      <FontIcon icon="icon database" />
      {data.props.database}
    </div>
  {/if}
  {#if data.contentPreview}
    <div class="info">
      {data.contentPreview}
    </div>
  {/if}
</AppObjectCore>

<style>
  .info {
    margin-left: 30px;
    color: var(--theme-generic-font-grayed);
  }
</style>
