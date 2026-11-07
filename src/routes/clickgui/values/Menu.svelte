<script lang="ts">
  import { play } from "../../../lib/sound";
  import PopoverMenu from "../../../lib/ui/PopoverMenu.svelte";

  // A pull-down for choosing one of many options
  let {
    options,
    value,
    label,
    onchange,
  }: { options: string[]; value: string; label: string; onchange: (value: string) => void } = $props();

  function choose(option: string) {
    if (option === value) return;
    play("tap");
    onchange(option);
  }
</script>

<PopoverMenu {label} class="cg-pop glass">
  {#snippet trigger(props)}
    <button class="cg-pill trigger" {...props} aria-label="{label}: {value}">
      {value}<span class="chev" aria-hidden="true">⌄</span>
    </button>
  {/snippet}
  {#snippet children(pick)}
    {#each options as option (option)}
      <button class="cg-option" role="menuitemradio" aria-checked={option === value} tabindex="-1" onclick={() => pick(() => choose(option))}>
        <span class="check" aria-hidden="true">{option === value ? "✓" : ""}</span>
        <span class="grow">{option}</span>
      </button>
    {/each}
  {/snippet}
</PopoverMenu>

<style>
  .trigger { max-width: 220px; }
  .chev { font-size: 12px; color: var(--label-2); margin-top: -4px; }
</style>
