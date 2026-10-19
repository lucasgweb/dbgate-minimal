<script>
  import FontIcon from '../icons/FontIcon.svelte';
  import { closeModal, getActiveModalId } from './modalTools';
  import clickOutside from '../utility/clickOutside';
  import keycodes from '../utility/keycodes';
  import { onMount } from 'svelte';
  import { currentDropDownMenu } from '../stores';

  export let fullScreen = false;
  export let noPadding = false;
  export let simple = false;
  export let simplefix = false;
  export let modalId;
  export let fixedHeight = false;
  export let disableClose = false;
  // medium - forms, large - dialogs with SQL, tables or editors
  export let size = 'medium';

  function handleCloseModal() {
    if (disableClose) return;
    if (modalId == getActiveModalId()) {
      closeModal(modalId);
    }
  }

  function handleClickOutside() {
    if ($currentDropDownMenu) return;
    handleCloseModal();
  }

  function handleEscape(e) {
    if (e.keyCode == keycodes.escape) {
      handleCloseModal();
    }
  }

  onMount(() => {
    const oldFocus = document.activeElement;
    return () => {
      if (oldFocus) oldFocus.focus();
    };
  });
</script>

<!-- The Modal -->
<div id="myModal" class="bglayer">
  <!-- Modal content -->
  <div
    class="window"
    class:fullScreen
    class:simple
    class:simplefix
    class:fixedHeight
    class:large={size == 'large'}
    use:clickOutside
    on:clickOutside={handleClickOutside}
    data-testid="ModalBase_window"
  >
    {#if $$slots.header}
      <div class="header" class:fullScreen>
        <div><slot name="header" /></div>
        {#if !disableClose}
          <div class="close" on:click={handleCloseModal}>
            <FontIcon icon="icon close" />
          </div>
        {/if}
      </div>
    {/if}

    <div class="content" class:noPadding class:fullScreen>
      <slot />
    </div>

    {#if $$slots.footer}
      <div class="footer" class:fullScreen>
        <slot name="footer" />
      </div>
    {/if}
  </div>
</div>

<svelte:window on:keydown={handleEscape} />

<style>
  .bglayer {
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(0, 0, 0); /* Fallback color */
    background-color: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    /* centers every dialog; margin: auto on the window keeps tall dialogs scrollable from the top */
    display: flex;
  }

  .window {
    background-color: var(--theme-content-background);
    border: var(--theme-modal-border);
    overflow: auto;
    outline: none;
    display: flex;
    flex-direction: column;
  }

  .window:not(.fullScreen):not(.simple):not(.simplefix) {
    border-radius: 12px;
    box-shadow: var(--theme-modal-shadow);
    margin: auto;
    max-height: 70vh;
    width: min(560px, calc(100vw - 32px));
  }

  .window.large:not(.fullScreen):not(.simple):not(.simplefix) {
    width: min(900px, calc(100vw - 32px));
  }

  .window:not(.fullScreen):not(.simple):not(.simplefix).fixedHeight {
    height: 70vh;
  }

  .window.fullScreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .window.simple {
    border-radius: 12px;
    box-shadow: var(--theme-modal-shadow);
    margin: auto;
    width: min(420px, calc(100vw - 32px));
  }

  .window.simplefix {
    border-radius: 12px;
    box-shadow: var(--theme-modal-shadow);
    margin: auto;
    max-width: min(750px, calc(100vw - 32px));
  }

  .close {
    font-size: 12pt;
    padding: 5px 10px;
    border-radius: 10px;
  }

  .close:hover {
    background-color: var(--theme-modal-close-hover-background);
  }

  .header {
    font-size: 12pt;
    font-weight: 600;
    padding: 10px 12px 10px 20px;
    display: flex;
    justify-content: space-between;
    background-color: var(--theme-modal-header-background);
    align-items: center;
  }

  .header.fullScreen {
    border-bottom: var(--theme-modal-border);
  }

  .content {
    max-height: 100%;
    overflow-y: auto;
    flex-grow: 1;
    background: var(--theme-modal-background);
  }

  .content:not(.fullScreen) {
    border-bottom: var(--theme-modal-border);
    border-top: var(--theme-modal-border);
  }

  .content:not(.noPadding):not(.fullScreen) {
    padding: 20px;
  }

  /* form fields are aligned with the header and footer, not indented by their own margin */
  .content:not(.noPadding):not(.fullScreen) > :global(.largeFormMarker) {
    margin-left: 0;
    margin-right: 0;
  }

  .content:not(.noPadding):not(.fullScreen) > :global(.largeFormMarker:first-child) {
    margin-top: 0;
  }

  .content:not(.noPadding):not(.fullScreen) > :global(.largeFormMarker:last-child) {
    margin-bottom: 0;
  }

  .content.fullScreen {
    display: flex;
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    bottom: 100px;
  }

  /* buttons on the right, the first one (main action) is the rightmost; buttons have 4px margin */
  .footer:not(.fullScreen) {
    border-bottom: var(--theme-modal-border);
    padding: 12px 16px;
    background: var(--theme-modal-footer-background);
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap;
    align-items: center;
  }

  .footer:not(.fullScreen) > :global(div:not([class])) {
    flex: 1;
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap;
    align-items: center;
  }

  /* footers with their own layout */
  .footer:not(.fullScreen) > :global(div[class]) {
    flex: 1;
  }

  .footer.fullScreen {
    position: fixed;
    height: 100px;
    left: 0;
    right: 0;
    bottom: 0px;
    border-top: var(--theme-modal-border);
    background: var(--theme-modal-footer-background);
  }
</style>
