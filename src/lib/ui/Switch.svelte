<script lang="ts">
  import { play } from "../sound";

  let {
    checked = false,
    label,
    small = false,
    onchange,
  }: { checked?: boolean; label: string; small?: boolean; onchange?: (checked: boolean) => void } = $props();

  function toggle(event: Event) {
    event.stopPropagation();
    play(checked ? "toggleOff" : "toggleOn");
    onchange?.(!checked);
  }
</script>

<button
  class="switch"
  class:on={checked}
  class:small
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={toggle}
></button>

<style>
  .switch {
    width: 44px;
    height: 26px;
    border-radius: 13px;
    background: var(--fill-3);
    box-shadow: inset 0 0 0 0.5px var(--line);
    position: relative;
    flex: none;
    transition: background-color var(--t-pop) var(--ease);
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: #fff;
    box-shadow: 0 2px 5px rgb(0 0 0 / 0.25);
    transition: transform var(--t-enter) var(--spring);
  }
  .switch.on { background: var(--accent); box-shadow: none; }
  .switch.on::after { transform: translateX(18px); }
  .switch:active::after { width: 26px; }
  .switch.on:active::after { transform: translateX(14px); }
  .small { width: 36px; height: 22px; border-radius: 11px; }
  .small::after { width: 18px; height: 18px; border-radius: 9px; }
  .small.on::after { transform: translateX(14px); }
  .small:active::after { width: 22px; }
  .small.on:active::after { transform: translateX(10px); }
</style>
