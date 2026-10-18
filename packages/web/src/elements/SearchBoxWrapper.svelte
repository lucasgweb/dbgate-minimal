<script lang="ts">
  export let noMargin = false;
  export let altsearchbox = false;
  export let filter = null;
  export let fillFlex = false;
</script>

<div class:useMargin={!noMargin} class:altsearchbox class:hasFilter={!!filter} class:fillFlex><slot /></div>

<style>
  div {
    display: flex;
    border-bottom: var(--theme-searchbox-border);
    background-color: var(--theme-searchbox-background);
    border: var(--theme-searchbox-border);
  }

  div.altsearchbox {
    background-color: var(--theme-altsearchbox-background);
    border: var(--theme-altsearchbox-border);
  }

  div.useMargin {
    border-radius: 6px;
    margin: 6px 8px;
    padding: 2px 4px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  div.useMargin:focus-within {
    box-shadow: var(--theme-input-focus-ring);
  }
  div.hasFilter {
    background-color: var(--theme-searchbox-background-filtered);
  }

  .fillFlex {
    flex: 1;
  }
</style>
