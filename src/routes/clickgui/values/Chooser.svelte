<script lang="ts">
  import Segmented from "../../../lib/ui/Segmented.svelte";
  import Menu from "./Menu.svelte";

  // Up to three short options sit side by side; anything longer opens a menu
  let {
    options,
    value,
    label,
    onchange,
  }: { options: string[]; value: string; label: string; onchange: (value: string) => void } = $props();

  const segmented = $derived(options.length <= 3 && options.join("").length <= 22);
</script>

{#if options.length === 0}
  <span class="cg-val">None</span>
{:else if segmented}
  <Segmented {options} {value} {label} small {onchange} />
{:else}
  <Menu {options} {value} {label} {onchange} />
{/if}
