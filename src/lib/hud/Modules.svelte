<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { bindLabel } from "../keys";
  import { moduleStore } from "../modules.svelte";
  import { isReducedMotion, spring } from "../motion";
  import { settings } from "../settings.svelte";
  import Keycap from "../ui/Keycap.svelte";
  import { slotOf } from "./layout.svelte";

  const ROW = 22;
  const PADDING = 8;
  // Its key opens the ClickGUI, so it is never on and its bind is no state worth a row
  const UNLISTED = new Set(["ClickGUI"]);

  type Row = { name: string; enabled: boolean; key: string | null; hold: boolean };

  const slot = slotOf();
  slot?.claim("y", 2);

  // Modules the player reaches for get rows: those on with a bind or (Toggled) switched lately, then the binds
  // of modules that are off. Modules that are simply always on only add to the count row. Hidden modules never show.
  const groups = $derived.by(() => {
    const { show, bindsWhenOff } = settings.moduleList;
    const on: Row[] = [];
    const off: Row[] = [];
    let quiet = 0;
    for (const module of moduleStore.list) {
      if (module.hidden || UNLISTED.has(module.name)) continue;
      const key = bindLabel(module.keyBind);
      const row = { name: module.name, enabled: module.enabled, key, hold: module.keyBind?.action === "Hold" };
      if (module.enabled) {
        if (show === "All" || key || (show === "Toggled" && moduleStore.toggled.has(module.name))) on.push(row);
        else quiet++;
      } else if (key && bindsWhenOff) {
        off.push(row);
      }
    }
    const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
    return { rows: [...on.sort(byName), ...off.sort(byName)], quiet, enabled: on.length + quiet };
  });

  // Rows past the setting's cap or the room the list has end in the count row, binds of modules that are off first
  const capacity = $derived(
    Math.max(1, Math.min(settings.moduleList.maxRows, Math.floor(((slot?.height ?? Infinity) - PADDING) / ROW))),
  );
  const cut = $derived.by(() => {
    const { rows, quiet } = groups;
    return rows.length + (quiet ? 1 : 0) > capacity ? capacity - 1 : rows.length;
  });
  const moreOn = $derived(groups.quiet + groups.rows.slice(cut).filter((row) => row.enabled).length);
  const moreBinds = $derived(groups.rows.length - cut - (moreOn - groups.quiet));
  const summary = $derived(
    [moreOn && `${moreOn} more on`, moreBinds && `${moreBinds} more ${moreBinds === 1 ? "bind" : "binds"}`]
      .filter(Boolean)
      .join(" · "),
  );

  const move = (node: Element, fromTo: { from: DOMRect; to: DOMRect }) =>
    flip(node, fromTo, { duration: isReducedMotion() ? 0 : 320, easing: spring });
  const appear = (node: Element) => fade(node, { duration: isReducedMotion() ? 120 : 180 });
</script>

{#if cut || summary}
  <section class="list glass on-glass" aria-label="Modules, {groups.enabled} on" transition:fade={{ duration: 160 }}>
    {#each groups.rows.slice(0, cut) as row (row.name)}
      <div class="row" class:on={row.enabled} class:bound={!!row.key} animate:move transition:appear>
        <span class="name">{row.name}</span>
        {#if !row.enabled}<span class="off">Off</span>{/if}
        {#if row.key}
          {#if row.hold}<span class="hold">Hold</span>{/if}
          <span class="key"><Keycap>{row.key}</Keycap></span>
        {/if}
      </div>
    {/each}
    {#if summary}
      <div class="row more">{summary}</div>
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
