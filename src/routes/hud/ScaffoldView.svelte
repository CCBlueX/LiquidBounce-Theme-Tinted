<script lang="ts">
  import { moduleItem } from "../../lib/icons";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import type { ScaffoldActivity } from "./island.svelte";

  let { scaffold }: { scaffold: ScaffoldActivity } = $props();

  const fraction = $derived(scaffold.peak > 0 ? scaffold.count / scaffold.peak : 0);
  const detail = $derived(
    scaffold.count === 0 ? "Out of blocks" : scaffold.blockName ? `Placing ${scaffold.blockName.toLowerCase()}` : "Placing",
  );
</script>

<div class="activity" aria-label="Scaffold, {scaffold.count} blocks left">
  <div class="top">
    <span class="badge"><ItemIcon id={scaffold.block ?? moduleItem("Scaffold", "World")} size={32} /></span>
    <span class="text">
      <span class="t-headline">Scaffold</span>
      <span class="t-footnote l2">{detail}</span>
    </span>
    <span class="count">
      <span class="t-title2 num">{scaffold.count}</span>
      <span class="t-footnote l2">{scaffold.count === 1 ? "block left" : "blocks left"}</span>
    </span>
  </div>
  <div class="bar"><i style:transform="scaleX({fraction})"></i></div>
</div>

<style>
  .activity {
    width: 360px;
    padding: 8px 20px 14px 8px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--fill-2);
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    white-space: nowrap;
  }
  .count {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    white-space: nowrap;
  }
  .bar {
    height: 4px;
    margin: 6px 0 0 12px;
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
