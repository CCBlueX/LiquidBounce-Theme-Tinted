<script lang="ts">
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import type { ToggleActivity } from "./island.svelte";

  let { toggle }: { toggle: ToggleActivity } = $props();
</script>

<div class="activity">
  <span class="badge"><ItemIcon id={toggle.item} size={32} /></span>
  <span class="text">
    <span class="t-headline">{toggle.name}</span>
    <span class="t-footnote l2">
      {toggle.category}{#if toggle.others}{toggle.category ? " · " : ""}{toggle.others} more changed{/if}
    </span>
  </span>
  <span class="state" class:on={toggle.enabled}>{toggle.enabled ? "On" : "Off"}</span>
</div>

<style>
  .activity {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 12px 0 8px;
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
    min-width: 96px;
    padding-right: 12px;
    white-space: nowrap;
  }
  .state {
    height: 24px;
    padding: 0 10px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    background: var(--fill-2);
    color: var(--label-2);
  }
  .state.on {
    background: var(--accent-fill);
    color: #fff;
    text-shadow: none;
  }
</style>
