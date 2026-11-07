<script lang="ts">
  import type { Module } from "../../lib/api/types";
  import { moduleItem } from "../../lib/icons";
  import { keyLabel } from "../../lib/keys";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import Switch from "../../lib/ui/Switch.svelte";

  // A module in the grid. The whole card selects it; the switch toggles it. Keyboard: the grid moves focus between
  // cards, Enter selects and Space toggles, so the switch itself stays out of the tab order.
  let {
    module,
    selected,
    focusable,
    onselect,
    ontoggle,
    onkeydown,
  }: {
    module: Module;
    selected: boolean;
    focusable: boolean;
    onselect: () => void;
    ontoggle: (enabled: boolean) => void;
    onkeydown: (event: KeyboardEvent) => void;
  } = $props();

  const bind = $derived(keyLabel(module.keyBind.boundKey));

  function untab(node: HTMLElement) {
    node.querySelector("button")?.setAttribute("tabindex", "-1");
  }
</script>

<div class="card" class:selected class:bound={bind}>
  <ItemIcon id={moduleItem(module.name, module.category)} size={48} />
  <button
    class="hit"
    tabindex={focusable ? 0 : -1}
    data-module={module.name}
    aria-current={selected ? "true" : undefined}
    aria-label="{module.name}, {module.enabled ? 'on' : 'off'}{bind ? `, bound to ${bind}` : ''}"
    aria-describedby="desc-{module.name}"
    onclick={onselect}
    {onkeydown}
  >
    <span class="name">{module.name}</span>
  </button>
  <div class="controls" use:untab>
    <Switch checked={module.enabled} label={module.name} small onchange={ontoggle} />
  </div>
  <p class="desc" id="desc-{module.name}">{module.description}</p>
  <!-- A bound module gives its description's second line to the keycap, so the bind is visible at a glance -->
  {#if bind}<span class="bind" aria-hidden="true"><Keycap>{bind}</Keycap></span>{/if}
</div>

<style>
  .card {
    position: relative;
    height: 104px;
    border-radius: var(--r-card);
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    padding: 16px 16px 16px 14px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    grid-template-rows: 22px 1fr;
    column-gap: 14px;
    row-gap: 4px;
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .card:hover { background: var(--fill-2); }
  .card:active:not(:has(.controls:active)) { transform: scale(0.985); }
  .card.selected { background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.75); }
  .card:has(.hit:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card > :global(img) { grid-row: 1 / 3; align-self: start; margin-top: 4px; }
  .hit { min-width: 0; text-align: left; outline: none; }
  /* The button's hit area covers the card; the switch sits above it */
  .hit::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  .name {
    display: block;
    font-size: 15px;
    line-height: 22px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .controls { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; margin-top: -1px; height: 22px; }
  :global(:root.contrast-more) .desc { color: var(--label); }
  .bound { grid-template-rows: 22px 16px 22px; row-gap: 5px; }
  .bound .desc { -webkit-line-clamp: 1; line-clamp: 1; }
  .bind { grid-column: 2 / 4; display: flex; pointer-events: none; }
  .desc {
    grid-column: 2 / 4;
    align-self: start;
    font-size: 12px;
    line-height: 16px;
    /* --label-2 measured 2.8:1 on a card over the sky; white at 0.8 is the agreed step up */
    color: rgb(255 255 255 / 0.8);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    pointer-events: none;
  }
</style>
