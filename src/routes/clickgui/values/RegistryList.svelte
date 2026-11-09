<script lang="ts">
  import { tick } from "svelte";
  import type { Registry } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import ConfirmPopover from "../../../lib/ui/ConfirmPopover.svelte";
  import ItemIcon from "../../../lib/ui/ItemIcon.svelte";
  import { idName } from "../tree";
  import { iconKind, registry } from "./registry";

  // Entries of a registry list: item art as a grid of tiles, other registries as name chips. Two rows show until
  // the list is expanded; long lists get a filter.
  let {
    list,
    registryName,
    label,
    onchange,
  }: { list: string[]; registryName: string; label: string; onchange: (list: string[]) => void } = $props();

  const FILTER_FROM = 12;
  const ROWS = 2;

  const kind = $derived(iconKind(registryName));
  const tiles = $derived(kind !== undefined);

  // Registry entry names; ids stand in until the registry arrives or when it cannot be loaded
  let names = $state<Registry>({});
  $effect(() => {
    let live = true;
    registry(registryName).then(
      (loaded) => live && (names = loaded),
      () => {},
    );
    return () => (live = false);
  });

  const entries = $derived(list.map((id) => ({ id, name: names[id]?.name || idName(id) })));
  let query = $state("");
  const filterable = $derived(list.length >= FILTER_FROM);
  const matches = $derived.by(() => {
    const q = filterable ? query.trim().toLowerCase() : "";
    return q ? entries.filter((entry) => entry.name.toLowerCase().includes(q) || entry.id.includes(q)) : entries;
  });

  let expanded = $state(false);
  const open = $derived(expanded || (filterable && query.trim() !== ""));

  // How many entries fit in the collapsed rows, measured, since chips have different widths; entries change size
  // when names or fonts arrive, so every entry is observed
  let box = $state<HTMLDivElement>();
  let layout = $state(0);
  let fits = $state(Infinity);
  $effect(() => {
    void matches;
    if (!box) return;
    const observer = new ResizeObserver(() => layout++);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => observer.disconnect();
  });
  $effect(() => {
    void layout;
    void matches;
    if (open || !box) {
      fits = Infinity;
      return;
    }
    const items = [...box.children] as HTMLElement[];
    const rowTops = [...new Set(items.map((item) => item.offsetTop))].sort((a, b) => a - b);
    const limit = rowTops[ROWS];
    fits = limit === undefined ? Infinity : items.filter((item) => item.offsetTop < limit).length;
  });
  const hiddenCount = $derived(Number.isFinite(fits) ? Math.max(0, matches.length - fits) : 0);

  // One tab stop for the whole list; arrow keys move between entries
  let current = $state(0);
  const reachable = $derived(Math.min(matches.length, Number.isFinite(fits) ? fits : matches.length));
  const stop = $derived(Math.min(current, Math.max(0, reachable - 1)));
  let shown = $state(-1);

  function items(): HTMLElement[] {
    return [...(box?.querySelectorAll<HTMLElement>("[data-entry]") ?? [])].slice(0, reachable);
  }

  function focusAt(index: number) {
    current = index;
    tick().then(() => items()[index]?.focus());
  }

  function remove(index: number) {
    const entry = matches[index];
    if (!entry) return;
    play("tap");
    onchange(list.filter((id) => id !== entry.id));
    if (shown === index) shown = -1;
    focusAt(Math.max(0, Math.min(index, matches.length - 2)));
  }

  function key(event: KeyboardEvent, index: number) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(index);
      return;
    }
    const all = items();
    const here = all[index];
    let next: number | undefined;
    if (event.key === "ArrowRight") next = index + 1;
    else if (event.key === "ArrowLeft") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = all.length - 1;
    else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && here) {
      const down = event.key === "ArrowDown";
      const rows = [...new Set(all.map((item) => item.offsetTop))].sort((a, b) => a - b);
      const row = rows[rows.indexOf(here.offsetTop) + (down ? 1 : -1)];
      if (row === undefined) return;
      const center = here.offsetLeft + here.offsetWidth / 2;
      let best = -1;
      all.forEach((item, i) => {
        if (item.offsetTop !== row) return;
        const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
        if (best < 0 || distance < Math.abs(all[best].offsetLeft + all[best].offsetWidth / 2 - center)) best = i;
      });
      next = best;
    }
    if (next === undefined) return;
    event.preventDefault();
    if (next >= 0 && next < all.length) focusAt(next);
  }

  function toggleAll() {
    play("tap");
    expanded = !expanded;
  }

  function filterKey(event: KeyboardEvent) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      query = "";
    }
  }

  let confirming = $state(false);
  let clearButton = $state<HTMLButtonElement>();

  function clear() {
    const row = clearButton?.closest(".cg-row");
    confirming = false;
    play("confirm");
    query = "";
    expanded = false;
    onchange([]);
    tick().then(() => row?.querySelector<HTMLElement>("button[popovertarget]")?.focus());
  }

  function cancelClear() {
    confirming = false;
    clearButton?.focus();
  }

  // "Magma cream" -> "MC", "Stone" -> "St"
  function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase().slice(0, 2);
  }

  const readout = $derived(matches[shown]?.name ?? "");
</script>

{#if list.length === 0}
  <span class="cg-hint empty">Empty</span>
{:else}
  {#if filterable}
    <input
      class="cg-field filter"
      bind:value={query}
      placeholder="Filter {list.length} entries"
      spellcheck="false"
      aria-label="Filter {label}"
      onkeydown={filterKey}
    />
  {/if}
  <div
    class="entries"
    class:tiles
    class:collapsed={!open}
    role="list"
    aria-label={label}
    bind:this={box}
  >
    {#each matches as entry, index (entry.id)}
      {@const hidden = index >= reachable}
      <div
        class="entry"
        role="listitem"
        inert={hidden}
        aria-hidden={hidden || undefined}
        onpointerenter={() => (shown = index)}
        onpointerleave={() => (shown = -1)}
      >
        {#if tiles}
          <button
            class="tile"
            data-entry
            tabindex={index === stop ? 0 : -1}
            title={entry.name}
            aria-label={entry.name}
            aria-keyshortcuts="Delete"
            onfocus={() => ((current = index), (shown = index))}
            onblur={() => (shown = -1)}
            onkeydown={(event) => key(event, index)}
          >
            <ItemIcon id={entry.id} size={kind === "effect" ? 18 : 24} {kind} fallback initials={initials(entry.name)} />
          </button>
          <button class="x" tabindex="-1" aria-label="Remove {entry.name}" onclick={() => remove(index)}>×</button>
        {:else}
          <span class="cg-chip chip">
            <button
              class="name"
              data-entry
              tabindex={index === stop ? 0 : -1}
              title={entry.name}
              aria-label={entry.name}
              aria-keyshortcuts="Delete"
              onfocus={() => (current = index)}
              onkeydown={(event) => key(event, index)}>{entry.name}</button
            >
            <button class="x" tabindex="-1" aria-label="Remove {entry.name}" onclick={() => remove(index)}>×</button>
          </span>
        {/if}
      </div>
    {:else}
      <span class="cg-hint">Nothing matches “{query}”</span>
    {/each}
  </div>
  <div class="footer">
    <span class="t-footnote readout" aria-hidden="true">{tiles ? readout : ""}</span>
    {#if hiddenCount > 0 || expanded}
      <button class="cg-pill quiet small" aria-expanded={expanded} onclick={toggleAll}>
        {expanded ? "Show less" : `Show all ${matches.length}`}
      </button>
    {/if}
    <div class="anchor">
      <button
        class="cg-pill quiet small"
        bind:this={clearButton}
        aria-haspopup="dialog"
        aria-expanded={confirming}
        onclick={() => (confirming = !confirming)}>Clear</button
      >
      {#if confirming}
        <ConfirmPopover
          title="Clear {label}?"
          text={list.length === 1 ? "The entry is removed." : `All ${list.length} entries are removed.`}
          action="Clear"
          placement="end"
          anchor={clearButton}
          onconfirm={clear}
          oncancel={cancelClear}
        />
      {/if}
    </div>
  </div>
{/if}

<style>
  .empty { display: block; margin-top: 4px; }
  .filter { width: 100%; height: 26px; margin-top: 6px; }
  /* The padding gives focus rings room inside the clip; the negative margin keeps entries on the row's insets */
  .entries {
    --pad: 3px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    position: relative;
    margin: 3px calc(-1 * var(--pad)) 0;
    padding: var(--pad);
  }
  .entries.collapsed { overflow: clip; max-height: calc(2 * var(--pad) + 24px * 2 + 4px); }
  .entries.tiles.collapsed { max-height: calc(2 * var(--pad) + 28px * 2 + 4px); }
  .entry { position: relative; min-width: 0; max-width: 100%; }
  .tile {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    transition: background-color var(--t-hover) ease;
  }
  .tile:hover { background: var(--fill-2); }
  /* The tile is the placeholder's backdrop */
  .tile :global(.initial) { background: transparent; }
  .tiles .x {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 14px;
    height: 14px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    font-size: 11px;
    line-height: 1;
    color: #fff;
    background: rgb(40 42 48 / 0.92);
    box-shadow: 0 0 0 0.5px var(--line);
    opacity: 0;
    transition: opacity var(--t-press) ease;
  }
  .entry:hover .x { opacity: 1; }
  .tiles .x:hover { background: var(--negative); }
  .chip { color: var(--label); }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; border-radius: 4px; }
  .footer { display: flex; align-items: center; gap: 4px; margin-top: 4px; min-height: 24px; }
  .readout { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--label-2); }
  .small { height: 24px; font-size: 12px; }
  .anchor { position: relative; }
</style>
