<script lang="ts">
  import ItemIcon from "../ui/ItemIcon.svelte";
  import type { ScaffoldActivity } from "./island.svelte";

  let { scaffold }: { scaffold: ScaffoldActivity } = $props();

  const fraction = $derived(scaffold.peak > 0 ? scaffold.count / scaffold.peak : 0);
  const detail = $derived(
    scaffold.count === 0 ? "Out of blocks" : scaffold.blockName ? `Placing ${scaffold.blockName.toLowerCase()}` : "Placing",
  );
</script>

<div class="activity" role="group" aria-label="Scaffold, {scaffold.count} blocks left">
  {#if scaffold.block}<ItemIcon id={scaffold.block} size={32} label={scaffold.blockName} fallback />{/if}
  <span class="text">
    <span class="t-headline">Scaffold</span>
    <span class="t-footnote l2">{detail}</span>
  </span>
  <span class="count">
    <span class="t-headline num">{scaffold.count}</span>
    <span class="t-footnote l2">{scaffold.count === 1 ? "block left" : "blocks left"}</span>
  </span>
  <div class="bar"><i style:transform="scaleX({fraction})"></i></div>
</div>

<style>
  .activity {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 300px;
    max-width: 100%;
    height: 52px;
    padding: 0 20px 4px 12px;
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }
  .text > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    white-space: nowrap;
  }
  .bar {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 5px;
    height: 3px;
    border-radius: 2px;
    background: var(--fill-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--label);
    transform-origin: left;
    transition: transform var(--t-pop) var(--ease);
  }
</style>
