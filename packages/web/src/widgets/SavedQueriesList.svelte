<script lang="ts">
  // saved SQL files belonging to the current database (see savedQueryDatabases and SQL front matter)
  import _ from 'lodash';
  import SavedFileAppObject from '../appobj/SavedFileAppObject.svelte';
  import WidgetsInnerContainer from './WidgetsInnerContainer.svelte';

  export let files = [];
</script>

<WidgetsInnerContainer>
  {#each _.sortBy(files, x => x.file.toLowerCase()) as file (file.file)}
    <SavedFileAppObject data={file} />
  {/each}
</WidgetsInnerContainer>
