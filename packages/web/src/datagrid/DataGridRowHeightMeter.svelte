<script lang="ts" context="module">
  export const dataGridRowHeight = writable(0);
</script>

<script lang="ts">
  import { writable } from 'svelte/store';
  import InlineButton from '../buttons/InlineButton.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import resizeObserver from '../utility/resizeObserver';
  import { minimalMode } from '../stores';

  // extra vertical space per row in minimal mode (Beekeeper-like row height)
  const MINIMAL_MODE_EXTRA_HEIGHT = 6;

  let measuredHeight = 0;
  $: if (measuredHeight) $dataGridRowHeight = measuredHeight + 1 + ($minimalMode ? MINIMAL_MODE_EXTRA_HEIGHT : 0);

  $: console.log('dataGridRowHeight', $dataGridRowHeight);
</script>

<div>
  <table>
    <tbody>
      <tr>
        <td
          use:resizeObserver={true}
          on:resize={e => {
            // @ts-ignore
            measuredHeight = e.detail.height;
          }}
        >
          title
          <InlineButton square>
            <FontIcon icon="icon chevron-down" />
          </InlineButton>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  div {
    position: fixed;
    left: -1000px;
    top: -1000px;
    visibility: hidden;
  }
  td {
    display: flex;
  }
</style>
