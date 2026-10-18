<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let unsaved = false;

  let mousein = false;
</script>

<span
  class="close-button tabCloseButton"
  class:unsaved
  on:click
  on:mouseenter={() => {
    mousein = true;
  }}
  on:mouseleave={() => {
    mousein = false;
  }}
>
  <FontIcon icon={unsaved && !mousein ? 'icon unsaved' : 'icon close'} />
</span>

<style>
  .close-button {
    margin-left: 6px;
    padding: 0 2px;
    border-radius: 4px;
    color: var(--theme-generic-font-grayed);
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .close-button:hover {
    color: var(--theme-tabs-panel-foreground);
    background-color: color-mix(in srgb, currentColor 15%, transparent);
  }
</style>
