<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let icon = 'icon form';
  export let secondary = false;
</script>

<div
  on:click|stopPropagation|preventDefault
  on:mousedown|stopPropagation|preventDefault
  on:mouseup|stopPropagation|preventDefault
  class="showFormButtonMarker"
  class:secondary
>
  <FontIcon {icon} />
</div>

<style>
  div {
    position: absolute;
    right: 0px;
    top: 1px;
    color: var(--theme-generic-font-grayed);
    background-color: var(--theme-toolstrip-button-background-active);
    border: var(--theme-toolstrip-button-border);
  }

  .secondary {
    margin-right: 20px;
  }

  div:hover {
    color: var(--theme-generic-font);
    top: 1px;
    right: 0px;
    cursor: pointer;
  }

  /* minimal mode: no boxed button on every row; a plain icon shown on hover or on the selected cell */
  :global(.minimal-mode) div {
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    padding: 0 3px;
    border: none;
    border-radius: 4px;
    background-color: transparent;
    line-height: 1.4;
    opacity: 0;
    transition: opacity 0.1s ease, background-color 0.1s ease;
  }
  :global(.minimal-mode) div.secondary {
    right: 24px;
    margin-right: 0;
  }
  :global(.minimal-mode td:hover) div,
  :global(.minimal-mode td.isSelected) div {
    opacity: 1;
  }
  :global(.minimal-mode) div:hover {
    top: 50%;
    right: 4px;
    background-color: var(--theme-sidebar-background-hover);
  }
  :global(.minimal-mode) div.secondary:hover {
    right: 24px;
  }
</style>
