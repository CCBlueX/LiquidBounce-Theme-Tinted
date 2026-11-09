<script lang="ts">
  import type { Module } from "../../lib/api/types";
  import { bindLabel } from "../../lib/keys";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import Switch from "../../lib/ui/Switch.svelte";

  // A module in the list. The whole row selects it; the switch toggles it. Keyboard: the list moves focus between
  // rows, Enter selects and Space toggles, so the switch itself stays out of the tab order.
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

  const bind = $derived(bindLabel(module.keyBind));

  function untab(node: HTMLElement) {
    node.querySelector("button")?.setAttribute("tabindex", "-1");
  }
</script>

<div class="row" class:selected class:on={module.enabled} title={module.description}>
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
  {#if bind}<span class="bind" aria-hidden="true"><Keycap>{bind}</Keycap></span>{/if}
  <div class="controls" use:untab>
    <Switch checked={module.enabled} label={module.name} onchange={ontoggle} />
  </div>
  <span class="sr-only" id="desc-{module.name}">{module.description}</span>
</div>

<style>
  .row {
    position: relative;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 2px 0 10px;
    border-radius: var(--r-control);
    transition: background-color var(--t-hover) ease;
  }
  .row:hover { background: var(--fill); }
  .row.selected { background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.75); }
  .row:has(.hit:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
  .hit { flex: 1; min-width: 0; height: 100%; text-align: left; outline: none; }
  /* The button's hit area covers the row; the switch sits above it */
  .hit::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  .name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--label-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on .name, .selected .name { color: var(--label); font-weight: 600; }
  .bind { display: flex; min-width: 0; max-width: 50%; pointer-events: none; }
  .controls { position: relative; z-index: 1; display: flex; }
</style>
