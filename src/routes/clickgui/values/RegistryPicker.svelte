<script lang="ts">
  import type { Registry } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import ItemIcon from "../../../lib/ui/ItemIcon.svelte";
  import { idName } from "../tree";
  import { iconKind, registry } from "./registry";

  // "Add" button with a searchable popover of a registry's entries
  let {
    registryName,
    label,
    exclude = [],
    buttonText = "Add",
    onpick,
  }: { registryName: string; label: string; exclude?: string[]; buttonText?: string; onpick: (id: string) => void } =
    $props();

  const id = $props.id();
  const LIMIT = 60;
  let pop: HTMLDivElement;
  let entries = $state<[string, string][] | undefined>();
  let failed = $state(false);
  let query = $state("");
  const kind = $derived(iconKind(registryName));

  const matches = $derived.by(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    const skip = new Set(exclude);
    return entries.filter(([key, name]) => !skip.has(key) && (!q || name.toLowerCase().includes(q) || key.includes(q)));
  });

  async function toggled(event: ToggleEvent) {
    if (event.newState !== "open") return play("close");
    play("open");
    query = "";
    pop.querySelector("input")?.focus();
    if (entries) return;
    failed = false;
    try {
      const loaded: Registry = await registry(registryName);
      entries = Object.entries(loaded)
        .map(([key, entry]): [string, string] => [key, entry.name || idName(key)])
        .sort((a, b) => a[1].localeCompare(b[1]));
    } catch {
      failed = true;
      play("error");
    }
  }

  function pick(key: string) {
    pop.hidePopover();
    play("confirm");
    onpick(key);
  }

  function key(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...pop.querySelectorAll<HTMLElement>("input, .cg-option")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }
</script>

<button class="cg-pill quiet" popovertarget="registry-{id}" style:anchor-name="--registry-{id}" aria-label="{buttonText} to {label}">
  {buttonText}
</button>

<div
  id="registry-{id}"
  class="cg-pop glass picker"
  popover="auto"
  role="dialog"
  tabindex="-1"
  aria-label="{buttonText} to {label}"
  bind:this={pop}
  style:position-anchor="--registry-{id}"
  ontoggle={toggled}
  onkeydown={key}
>
  <input class="cg-field search" bind:value={query} placeholder="Filter" aria-label="Filter {label}" spellcheck="false" />
  {#if failed}
    <p class="t-footnote l2 note">This list could not be loaded from the client.</p>
  {:else if !entries}
    <p class="t-footnote l3 note">Loading</p>
  {:else if matches.length === 0}
    <p class="t-footnote l2 note">Nothing matches “{query}”</p>
  {:else}
    {#each matches.slice(0, LIMIT) as [entryId, name] (entryId)}
      <button class="cg-option" onclick={() => pick(entryId)}>
        {#if kind}<ItemIcon id={entryId} size={kind === "effect" ? 18 : 16} {kind} />{/if}
        <span class="grow">{name}</span>
      </button>
    {/each}
    {#if matches.length > LIMIT}
      <p class="t-footnote l3 note">{matches.length - LIMIT} more, type to narrow</p>
    {/if}
  {/if}
</div>

<style>
  .picker { width: 260px; }
  .search { width: 100%; margin-bottom: 6px; height: 30px; }
  .note { padding: 8px 10px; }
</style>
