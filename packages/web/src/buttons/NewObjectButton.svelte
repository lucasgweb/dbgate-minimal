<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import { isProApp } from '../utility/proTools';
  import { _t } from '../translations';

  export let icon;
  export let title;
  export let description;
  export let enabled;
  export let colorClass;
  export let disabledMessage = undefined;
  export let isProFeature;

  $: disabled = !enabled;
</script>

<div
  class="new-object-button"
  on:click
  class:enabled
  class:disabled
  data-testid={$$props['data-testid']}
  title={disabled
    ? isProFeature && !isProApp()
      ? _t('common.featurePremium', { defaultMessage: 'This feature is available only in DbGate Premium' })
      : disabledMessage
    : undefined}
>
  <div class="icon">
    <FontIcon {icon} colorClass={enabled ? colorClass : null} />
  </div>
  <span class="title">{title}</span>
  {#if description}
    <div class="description">{description}</div>
  {/if}
</div>

<style>
  .new-object-button {
  min-height: 120px;
  padding: 16px 12px 14px;

  background-color: var(--theme-new-object-button-background);
  border: var(--theme-inlinebutton-bordered-border);
  border-radius: 10px;

  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.new-object-button.enabled {
  cursor: pointer;
}

.new-object-button.enabled:hover {
  border-color: var(--theme-input-border-focus-color);
  transform: translateY(-1px);
}

.icon {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 10px;
  color: var(--theme-generic-font);
}

.title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.description {
  font-size: 11.5px;
  color: var(--theme-generic-font-grayed);
  line-height: 1.35;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.new-object-button.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.new-object-button.disabled .icon,
.new-object-button.disabled .title,
.new-object-button.disabled .description {
  color: var(--theme-generic-font);
}
</style>
