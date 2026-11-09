<script lang="ts" module>
  export type ClickGuiView = "modules" | "marketplace" | "settings";
</script>

<script lang="ts">
  import { play } from "../../lib/sound";

  // The category sidebar: names with the number of enabled modules, then Marketplace and Settings at the bottom. Up
  // and Down move between all of them. The HUD editor entry sits below.
  let {
    categories,
    totals,
    enabled,
    current,
    view,
    marketplace,
    onselect,
    onview,
    onedithud,
  }: {
    categories: string[];
    totals: Record<string, number>;
    enabled: Record<string, number>;
    current: string;
    view: ClickGuiView;
    /** The client has the marketplace routes. */
    marketplace: boolean;
    onselect: (category: string) => void;
    onview: (view: Exclude<ClickGuiView, "modules">) => void;
    onedithud: () => void;
  } = $props();

  let bar: HTMLDivElement;

  const places = $derived<{ view: Exclude<ClickGuiView, "modules">; label: string }[]>([
    ...(marketplace ? [{ view: "marketplace" as const, label: "Marketplace" }] : []),
    { view: "settings", label: "Settings" },
  ]);

  function select(category: string) {
    if (category === current && view === "modules") return;
    play("tap");
    onselect(category);
  }

  function open(next: Exclude<ClickGuiView, "modules">) {
    if (view === next) return;
    play("tap");
    onview(next);
  }

  function key(event: KeyboardEvent, index: number) {
    const last = categories.length + places.length - 1;
    const next =
      event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    bar.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
    if (next < categories.length) select(categories[next]);
    else open(places[next - categories.length].view);
  }
</script>

<nav class="sidebar on-glass" aria-label="Categories">
  <div role="tablist" aria-label="Categories" aria-orientation="vertical" bind:this={bar}>
    {#each categories as category, index (category)}
      {@const on = enabled[category] ?? 0}
      {@const isCurrent = view === "modules" && category === current}
      <button
        role="tab"
        class="tab"
        class:current={isCurrent}
        aria-selected={isCurrent}
        aria-label="{category}, {totals[category] ?? 0} modules, {on} on"
        tabindex={isCurrent || (view === "modules" && !categories.includes(current) && index === 0) ? 0 : -1}
        onclick={() => select(category)}
        onkeydown={(event) => key(event, index)}
      >
        <span class="name">{category}</span>
        {#if on}<span class="count num" aria-hidden="true">{on}</span>{/if}
      </button>
    {/each}
    {#each places as place, index (place.view)}
      <button
        role="tab"
        class="tab"
        class:first={index === 0}
        class:current={view === place.view}
        aria-selected={view === place.view}
        tabindex={view === place.view ? 0 : -1}
        onclick={() => open(place.view)}
        onkeydown={(event) => key(event, categories.length + index)}
      >
        <span class="name">{place.label}</span>
      </button>
    {/each}
  </div>
  <button class="tab edit" onclick={() => (play("open"), onedithud())}>Edit HUD</button>
</nav>

<style>
  .sidebar { display: flex; flex-direction: column; gap: 2px; padding: 16px 8px 12px 10px; overflow-y: auto; scrollbar-width: none; }
  [role="tablist"] { flex: 1 0 auto; display: flex; flex-direction: column; gap: 2px; }
  .tab {
    flex: none;
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
    transition: background-color var(--t-hover) ease, color var(--t-hover) ease;
  }
  .tab:hover { background: var(--fill); color: var(--label); }
  .tab.current { background: var(--fill-on); color: var(--label); font-weight: 600; box-shadow: inset 0 0.5px 0 rgb(255 255 255 / 0.3); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 12px; color: var(--label-2); }
  .current .count { color: var(--label); }
  /* Marketplace and Settings sit right above Edit HUD, apart from the categories */
  .first { margin-top: auto; }
  .edit { flex: none; }
</style>
