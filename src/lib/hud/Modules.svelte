<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { bindLabel } from "../keys";
  import { moduleStore } from "../modules.svelte";
  import { isReducedMotion, spring } from "../motion";
  import Keycap from "../ui/Keycap.svelte";
  import { slotOf } from "./layout.svelte";

  const ROW = 22;
  const PADDING = 8;

  type Row = { name: string; enabled: boolean; key: string | null; hold: boolean };

  const slot = slotOf();
  slot?.claim("y", 2);

  // Everything that is on, then everything a key can turn on; modules hidden from the module list stay hidden unless
  // they carry a bind
  const rows = $derived.by(() => {
    const result: Row[] = [];
    for (const module of moduleStore.list) {
      const key = bindLabel(module.keyBind);
      if (!(module.enabled && !module.hidden) && !key) continue;
      result.push({ name: module.name, enabled: module.enabled, key, hold: module.keyBind?.action === "Hold" });
    }
    return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  });

  const enabledCount = $derived(rows.filter((row) => row.enabled).length);

  // Rows past the room the list has end in one summary row; binds go before modules that are on
  const capacity = $derived(Math.max(1, Math.floor(((slot?.height ?? Infinity) - PADDING) / ROW)));
  const cut = $derived(rows.length > capacity ? capacity - 1 : rows.length);
  const hiddenOn = $derived(rows.slice(cut).filter((row) => row.enabled).length);
  const hiddenBinds = $derived(rows.length - cut - hiddenOn);

  const move = (node: Element, fromTo: { from: DOMRect; to: DOMRect }) =>
    flip(node, fromTo, { duration: isReducedMotion() ? 0 : 320, easing: spring });
  const appear = (node: Element) => fade(node, { duration: isReducedMotion() ? 120 : 180 });
</script>

{#if rows.length}
  <section class="list glass on-glass" aria-label="Modules, {enabledCount} on" transition:fade={{ duration: 160 }}>
    {#each rows.slice(0, cut) as row (row.name)}
      <div class="row" class:on={row.enabled} class:bound={!!row.key} animate:move transition:appear>
        <span class="name">{row.name}</span>
        {#if !row.enabled}<span class="off">Off</span>{/if}
        {#if row.key}
          {#if row.hold}<span class="hold">Hold</span>{/if}
          <span class="key"><Keycap>{row.key}</Keycap></span>
        {/if}
      </div>
    {/each}
    {#if cut < rows.length}
      <div class="row more">
        {[hiddenOn && `${hiddenOn} more on`, hiddenBinds && `${hiddenBinds} ${hiddenOn ? "binds" : "more binds"}`]
          .filter(Boolean)
          .join(" · ")}
      </div>
    {/if}
  </section>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
    border-radius: var(--r-group);
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 4px 0 10px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
    /* Off rows are quieter than on rows but stay readable: binds are what the player reaches for */
    color: var(--label-2);
  }
  .row.on {
    color: var(--label);
    font-weight: 600;
  }
  .row:not(.bound) {
    padding-right: 10px;
  }
  .name {
    flex: 1;
    min-width: 0;
    max-width: 180px;
    margin-right: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .key {
    display: flex;
    max-width: 112px;
  }
  .off,
  .hold,
  .more {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
</style>
