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
  /* The button is the 24px-tall hit area; the track and knob are drawn inside it */
  .switch {
    --w: 32px;
    --h: 18px;
    width: calc(var(--w) + 4px);
    height: 24px;
    position: relative;
    flex: none;
    border-radius: 12px;
  }
  .switch::before,
  .switch::after {
    content: "";
    position: absolute;
    top: 50%;
    translate: 0 -50%;
  }
  .switch::before {
    left: 2px;
    width: var(--w);
    height: var(--h);
    border-radius: calc(var(--h) / 2);
    background: var(--fill-3);
    box-shadow: inset 0 0 0 0.5px var(--line);
    transition: background-color var(--t-hover) ease;
  }
  .switch::after {
    left: 4px;
    width: calc(var(--h) - 4px);
    height: calc(var(--h) - 4px);
    border-radius: var(--h);
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition: transform var(--t-enter) var(--spring), width var(--t-press) var(--ease);
  }
  .switch.on::before { background: var(--accent); box-shadow: none; }
  .switch.on::after { transform: translateX(calc(var(--w) - var(--h))); }
  .switch:active::after { width: calc(var(--h) + 1px); }
  .switch.on:active::after { transform: translateX(calc(var(--w) - var(--h) - 5px)); }
  .small { --w: 28px; --h: 16px; }
</style>
