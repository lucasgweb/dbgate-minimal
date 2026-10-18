<script lang="ts">
  // Shown in the content area when no tab is open: quick actions and the most used shortcuts (Beekeeper-like)
  import FontIcon from '../icons/FontIcon.svelte';
  import runCommand from '../commands/runCommand';
  import { commandsCustomized } from '../stores';
  import { formatKeyText } from '../utility/common';
  import { _t } from '../translations';

  const ACTIONS = [
    { command: 'new.query', icon: 'icon file', label: _t('emptyTabs.newQuery', { defaultMessage: 'New query' }) },
    { command: 'database.search', icon: 'icon table', label: _t('emptyTabs.openTable', { defaultMessage: 'Open table' }) },
    { command: 'new.connection', icon: 'icon new-connection', label: _t('emptyTabs.newConnection', { defaultMessage: 'New connection' }) },
  ];

  const SHORTCUTS = [
    { command: 'query.execute', label: _t('emptyTabs.runQuery', { defaultMessage: 'Run query' }) },
    { command: 'query.executeCurrent', label: _t('emptyTabs.runCurrent', { defaultMessage: 'Run current statement' }) },
    { keyText: 'Ctrl+Space', label: _t('emptyTabs.autocomplete', { defaultMessage: 'Autocomplete' }) },
    { command: 'query.formatCode', label: _t('emptyTabs.formatCode', { defaultMessage: 'Format code' }) },
    { command: 'new.query', label: _t('emptyTabs.newQuery', { defaultMessage: 'New query' }) },
    { command: 'database.search', label: _t('emptyTabs.openTable', { defaultMessage: 'Open table' }) },
    { command: 'tabs.closeTab', label: _t('emptyTabs.closeTab', { defaultMessage: 'Close tab' }) },
    { command: 'tabs.reopenClosedTab', label: _t('emptyTabs.reopenTab', { defaultMessage: 'Reopen closed tab' }) },
    { command: 'commandPalette.show', label: _t('emptyTabs.commandPalette', { defaultMessage: 'Command palette' }) },
    { command: 'app.toggleMinimalMode', label: _t('emptyTabs.minimalMode', { defaultMessage: 'Minimal mode' }) },
  ];

  function keysOf(item): string[] {
    const keyText = item.keyText ?? $commandsCustomized[item.command]?.keyText;
    if (!keyText) return [];
    return keyText
      .split('|')
      .map(x => formatKeyText(x.trim()))
      .filter(Boolean);
  }
</script>

<div class="wrapper">
  <div class="panel">
    <div class="actions">
      {#each ACTIONS.filter(x => $commandsCustomized[x.command]?.enabled !== false) as action (action.command)}
        <button class="action" on:click={() => runCommand(action.command)} data-testid={`EmptyTabs_${action.command}`}>
          <FontIcon icon={action.icon} />
          <span>{action.label}</span>
        </button>
      {/each}
    </div>

    <div class="shortcuts">
      {#each SHORTCUTS as item (item.label)}
        {@const keys = keysOf(item)}
        {#if keys.length > 0}
          <div class="shortcut-label">{item.label}</div>
          <div class="shortcut-keys">
            {#each keys as key, index}
              {#if index > 0}<span class="or">{_t('emptyTabs.or', { defaultMessage: 'or' })}</span>{/if}
              {#each key.split('+') as part}
                <kbd>{part}</kbd>
              {/each}
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .wrapper {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    overflow-y: auto;
  }

  .panel {
    margin: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .action {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    border: var(--theme-modal-border);
    border-radius: 8px;
    background: var(--theme-new-object-button-background);
    color: var(--theme-generic-font);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }

  .action:hover {
    border-color: var(--theme-input-border-focus-color);
  }

  .action :global(.mdi) {
    font-size: 18px;
    color: var(--theme-icon-blue);
  }

  .shortcuts {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 16px;
    row-gap: 10px;
    align-items: center;
  }

  .shortcut-label {
    text-align: right;
    color: var(--theme-generic-font-grayed);
    font-size: 13px;
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    min-width: 22px;
    padding: 2px 6px;
    border: var(--theme-modal-border);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--theme-new-object-button-background);
    color: var(--theme-generic-font);
    font-family: inherit;
    font-size: 12px;
    text-align: center;
  }

  .or {
    margin: 0 4px;
    color: var(--theme-generic-font-grayed);
    font-size: 12px;
  }
</style>
