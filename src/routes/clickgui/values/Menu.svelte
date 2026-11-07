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
      <span class="value">{value}</span><span class="chev" aria-hidden="true">⌄</span>
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
  .trigger { max-width: min(220px, 62%); min-width: 0; }
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .chev { flex: none; font-size: 12px; color: var(--label-2); margin: -4px -2px 0 0; }
</style>
