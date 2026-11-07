<script lang="ts">
  import { play } from "../sound";

  let {
    options,
    value,
    label,
    small = false,
    onchange,
  }: { options: string[]; value: string; label: string; small?: boolean; onchange?: (value: string) => void } =
    $props();

  function select(option: string) {
    if (option === value) return;
    play("tap");
    onchange?.(option);
  }

  function key(event: KeyboardEvent) {
    const index = options.indexOf(value);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    select(options[(index + step + options.length) % options.length]);
  }
</script>

<div class="seg" class:small role="radiogroup" aria-label={label} tabindex="0" onkeydown={key}>
  {#each options as option (option)}
    <button
      role="radio"
      aria-checked={option === value}
      tabindex="-1"
      class:on={option === value}
      onclick={() => select(option)}>{option}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    gap: 1px;
    border-radius: 999px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
  }
  button {
    height: 24px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    color: var(--label-2);
    transition: background-color var(--t-pop) var(--ease), color var(--t-pop) var(--ease);
  }
  button.on {
    background: var(--fill-on);
    color: #fff;
    box-shadow: inset 0 0.5px 0 rgb(255 255 255 / 0.3);
  }
  .small button { height: 24px; padding: 0 10px; font-size: 12px; }
</style>
