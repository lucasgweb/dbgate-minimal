<script lang="ts">
  import { get_current_component } from 'svelte/internal';
  import createActivator, { isComponentActiveStore } from '../utility/createActivator';
  import { toolbarPosition } from '../stores';

  const thisInstance = get_current_component();

  export let showAlways = false;
  export const activator = showAlways ? null : createActivator('ToolStripContainer', true);

  export function activate() {
    activator?.activate();
  }

  export let scrollContent = false;
  export let hideToolStrip = false;
  export let toolstripPosition = 'auto'; // 'top' | 'bottom'

  $: isComponentActive = showAlways || ($isComponentActiveStore('ToolStripContainer', thisInstance) && !hideToolStrip);

  $: realToolstripPosition =
    toolstripPosition == 'auto' ? $toolbarPosition : toolstripPosition;

  $: realToolstripPositionFixed =
    realToolstripPosition == 'top' || realToolstripPosition == 'bottom' ? realToolstripPosition : 'top';
</script>

<div class="wrapper">
  {#if isComponentActive && realToolstripPositionFixed === 'top'}
    <div class="toolstrip">
      <slot name="toolstrip" />
    </div>
  {/if}

  <div class="content" class:scrollContent class:isComponentActive>
    <slot />
  </div>

  {#if isComponentActive && realToolstripPositionFixed === 'bottom'}
    <div class="toolstrip">
      <slot name="toolstrip" />
    </div>
  {/if}
</div>

<style>
  .wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .content {
    display: flex;
    flex: 1;
    position: relative;
    max-height: 100%;
  }

  .content.isComponentActive {
    max-height: calc(100% - 44px);
  }

  .toolstrip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    background: var(--theme-toolstrip-background);
    border-top: var(--theme-toolstrip-border);
    border-bottom: var(--theme-toolstrip-border);
    padding: 4px 8px;
    gap: 4px;
    min-height: 44px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .scrollContent {
    overflow-y: auto;
  }

  .toolstrip :global(select) {
    padding-top: 6px;
    padding-bottom: 6px;
    padding-left: 10px;
    min-width: 140px;
    font-size: 13px;
    font-weight: 500;
    border: var(--theme-toolstrip-button-border);
    border-radius: 6px;
    background-color: var(--theme-toolstrip-button-background);
    color: var(--theme-toolstrip-button-foreground);
  }
</style>
