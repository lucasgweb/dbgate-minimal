<script lang="ts">
  import InplaceInput from './InplaceInput.svelte';
  import InplaceSelect from './InplaceSelect.svelte';

  export let inplaceEditorState;
  export let dispatchInsplaceEditor;
  export let onSetValue;
  export let width;
  export let cellValue;
  export let options;
  export let canSelectMultipleOptions;
  export let driver;
  export let dataEditorTypesBehaviourOverride = null;
</script>

<td class="editor">
  <div class="inplaceeditor-container">
    {#if options}
      <InplaceSelect
        {inplaceEditorState}
        {dispatchInsplaceEditor}
        {cellValue}
        {onSetValue}
        {options}
        {canSelectMultipleOptions}
        {driver}
        {dataEditorTypesBehaviourOverride}
      />
    {:else}
      <InplaceInput
        {width}
        {inplaceEditorState}
        {dispatchInsplaceEditor}
        {cellValue}
        {onSetValue}
        {driver}
        {dataEditorTypesBehaviourOverride}
      />
    {/if}
  </div>
</td>

<style>
  td.editor {
    position: relative;
  }
  :global(.minimal-mode) td.editor {
    padding: 0;
  }
  :global(.minimal-mode) .inplaceeditor-container {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
  }
</style>
