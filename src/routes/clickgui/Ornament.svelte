<script lang="ts">
  import { CATEGORY_ITEMS } from "../../lib/icons";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";

  // The floating category bar beside the window. Icons only; the name shows as a small glass tag on hover and
  // keyboard focus. Up and Down move between categories.
  let {
    categories,
    counts,
    current,
    onselect,
  }: { categories: string[]; counts: Record<string, number>; current: string; onselect: (category: string) => void } =
    $props();

  let hovered = $state<number | undefined>();
  let focused = $state<number | undefined>();
  const tagged = $derived(hovered ?? focused);
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

<nav class="ornament" aria-label="Categories">
  <div class="glass bar" role="tablist" aria-label="Categories" aria-orientation="vertical" bind:this={bar} in:rise={{ delay: 60 }}>
    {#each categories as category, index (category)}
      <button
        role="tab"
        class="tab"
        class:on={category === current}
        aria-selected={category === current}
        aria-label="{category}, {counts[category] ?? 0} modules"
        tabindex={category === current || (!categories.includes(current) && index === 0) ? 0 : -1}
        onclick={() => select(category)}
        onkeydown={(event) => key(event, index)}
        onpointerenter={() => (hovered = index)}
        onpointerleave={() => (hovered = undefined)}
        onfocus={(event) => (focused = event.currentTarget.matches(":focus-visible") ? index : undefined)}
        onblur={() => (focused = undefined)}
      >
        <ItemIcon id={CATEGORY_ITEMS[category] ?? "minecraft:barrier"} size={32} />
      </button>
    {/each}
  </div>
  {#if tagged !== undefined}
    {#key tagged}
      <div class="glass tag t-footnote on-glass" style:top="{10 + tagged * 56 + 26}px" aria-hidden="true">
        {categories[tagged]}<span class="l2 num">{counts[categories[tagged]] ?? 0}</span>
      </div>
    {/key}
  {/if}
</nav>

<style>
  .ornament { position: absolute; z-index: 2; right: calc(100% + 20px); top: 50%; translate: 0 -50%; }
  .bar { width: 72px; border-radius: 36px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
  .tab {
    width: 52px;
    height: 52px;
    border-radius: 26px;
    display: grid;
    place-items: center;
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .tab:hover { background: var(--fill); }
  .tab:active { transform: scale(0.94); }
  .tab.on { background: var(--fill-on); box-shadow: inset 0 0.5px 0 rgb(255 255 255 / 0.35); }
  .tag {
    position: absolute;
    left: calc(100% + 10px);
    translate: 0 -50%;
    height: 30px;
    padding: 0 12px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    animation: tag-in var(--t-pop) var(--ease);
  }
  @keyframes tag-in {
    from { opacity: 0; transform: translateX(-4px); }
  }
  :global(:root.reduce-motion) .tag { animation-name: tag-fade; }
  @keyframes tag-fade {
    from { opacity: 0; }
  }
</style>
