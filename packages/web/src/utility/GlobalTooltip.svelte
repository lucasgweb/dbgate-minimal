<script lang="ts">
  // Replaces native browser tooltips (title attribute) with a themed, rounded tooltip.
  // The title is moved to data-tooltip on hover, so the native tooltip doesn't show.
  import { onMount } from 'svelte';

  const SHOW_DELAY = 450;
  const OFFSET = 8;

  let text = '';
  let visible = false;
  let left = 0;
  let top = 0;
  let placement = 'bottom';
  let domTooltip: HTMLDivElement;
  let currentTarget: HTMLElement = null;
  let showTimer = null;

  function findTarget(node): HTMLElement {
    let el = node instanceof Element ? node : null;
    while (el && el !== document.body) {
      if (el.hasAttribute('title') || el.hasAttribute('data-tooltip')) return el as HTMLElement;
      el = el.parentElement;
    }
    return null;
  }

  function takeOverTitle(el: HTMLElement) {
    const title = el.getAttribute('title');
    if (title != null) {
      if (title.trim()) {
        el.setAttribute('data-tooltip', title);
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', title);
      }
      el.removeAttribute('title');
    }
    return el.getAttribute('data-tooltip');
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    visible = false;
    currentTarget = null;
  }

  async function position(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    left = rect.left + rect.width / 2;
    top = rect.bottom + OFFSET;
    placement = 'bottom';
    visible = true;
    await Promise.resolve();
    if (!domTooltip) return;
    const tip = domTooltip.getBoundingClientRect();
    if (top + tip.height > window.innerHeight - 4) {
      top = rect.top - OFFSET - tip.height;
      placement = 'top';
    }
    const half = tip.width / 2;
    left = Math.min(Math.max(left, half + 6), window.innerWidth - half - 6);
  }

  function handleMouseOver(e: MouseEvent) {
    const el = findTarget(e.target);
    if (el === currentTarget) return;
    hide();
    if (!el) return;
    const value = takeOverTitle(el);
    if (!value) return;
    currentTarget = el;
    showTimer = setTimeout(() => {
      if (currentTarget !== el || !document.body.contains(el)) return;
      text = el.getAttribute('data-tooltip');
      position(el);
    }, SHOW_DELAY);
  }

  function handleMouseOut(e: MouseEvent) {
    if (!currentTarget) return;
    const related = e.relatedTarget as Node;
    if (related && currentTarget.contains(related)) return;
    hide();
  }

  onMount(() => {
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.removeEventListener('wheel', hide, true);
      window.removeEventListener('blur', hide);
      clearTimeout(showTimer);
    };
  });
</script>

{#if visible && text}
  <div
    class="tooltip"
    class:top={placement == 'top'}
    style={`left:${left}px;top:${top}px`}
    bind:this={domTooltip}
    role="tooltip"
  >
    {text}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 100000;
    transform: translateX(-50%);
    max-width: 320px;
    padding: 5px 9px;
    border-radius: 6px;
    border: var(--theme-modal-border);
    background: var(--theme-modal-background);
    color: var(--theme-generic-font);
    box-shadow: var(--theme-modal-shadow);
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-line;
    pointer-events: none;
    animation: tooltip-in 0.12s ease-out;
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translate(-50%, -2px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
