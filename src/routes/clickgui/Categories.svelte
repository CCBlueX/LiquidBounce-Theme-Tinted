<script lang="ts">
  import { play } from "../../lib/sound";

  // The category sidebar: names with the number of enabled modules. Up and Down move between categories. The HUD
  // editor entry sits at the bottom.
  let {
    categories,
    totals,
    enabled,
    current,
    onselect,
    onedithud,
  }: {
    categories: string[];
    totals: Record<string, number>;
    enabled: Record<string, number>;
    current: string;
    onselect: (category: string) => void;
    onedithud: () => void;
  } = $props();

  let bar: HTMLDivElement;

  function select(category: string) {
    if (category === current) return;
    play("tap");
    onselect(category);
  }

  function key(event: KeyboardEvent, index: number) {
    const last = categories.length - 1;
    const next =
      event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    bar.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
    select(categories[next]);
  }
</script>

<nav class="sidebar on-glass" aria-label="Categories">
  <div role="tablist" aria-label="Categories" aria-orientation="vertical" bind:this={bar}>
    {#each categories as category, index (category)}
      {@const on = enabled[category] ?? 0}
      <button
        role="tab"
        class="tab"
        class:current={category === current}
        aria-selected={category === current}
        aria-label="{category}, {totals[category] ?? 0} modules, {on} on"
        tabindex={category === current || (!categories.includes(current) && index === 0) ? 0 : -1}
        onclick={() => select(category)}
        onkeydown={(event) => key(event, index)}
      >
        <span class="name">{category}</span>
        {#if on}<span class="count num" aria-hidden="true">{on}</span>{/if}
      </button>
    {/each}
  </div>
  <button class="tab edit" onclick={() => (play("open"), onedithud())}>Edit HUD</button>
</nav>

<style>
  .sidebar { display: flex; flex-direction: column; gap: 8px; padding: 16px 8px 12px 10px; overflow-y: auto; scrollbar-width: none; }
  [role="tablist"] { display: grid; gap: 2px; }
  .tab {
    height: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: var(--r-control);
    font-size: 13px;
    font-weight: 500;
    color: var(--label-2);
    text-align: left;
    transition: background-color var(--t-pop) var(--ease), color var(--t-pop) var(--ease);
  }
  .tab:hover { background: var(--fill); color: var(--label); }
  .tab.current { background: var(--fill-on); color: var(--label); font-weight: 600; box-shadow: inset 0 0.5px 0 rgb(255 255 255 / 0.3); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 12px; color: var(--label-2); }
  .current .count { color: var(--label); }
  .edit { margin-top: auto; flex: none; }
</style>
