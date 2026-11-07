<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { keyLabel } from "../keys";
  import { moduleStore } from "../modules.svelte";
  import { isReducedMotion, spring } from "../motion";
  import Keycap from "../ui/Keycap.svelte";

  type Row = { name: string; enabled: boolean; key: string | null; hold: boolean };

  // Everything that is on, then everything a key can turn on; modules hidden from the module list stay hidden unless
  // they carry a bind
  const rows = $derived.by(() => {
    const result: Row[] = [];
    for (const module of moduleStore.list) {
      const key = keyLabel(module.keyBind?.boundKey);
      if (!(module.enabled && !module.hidden) && !key) continue;
      result.push({ name: module.name, enabled: module.enabled, key, hold: module.keyBind?.action === "Hold" });
    }
    return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  });

  const enabledCount = $derived(rows.filter((row) => row.enabled).length);

  const move = (node: Element, fromTo: { from: DOMRect; to: DOMRect }) =>
    flip(node, fromTo, { duration: isReducedMotion() ? 0 : 320, easing: spring });
  const appear = (node: Element) => fade(node, { duration: isReducedMotion() ? 120 : 180 });
</script>

{#if rows.length}
  <section class="list glass on-glass" aria-label="Modules, {enabledCount} on" transition:fade={{ duration: 160 }}>
    {#each rows as row (row.name)}
      <div class="row" class:on={row.enabled} class:bound={!!row.key} animate:move transition:appear>
        <span class="name">{row.name}</span>
        {#if !row.enabled}<span class="off">Off</span>{/if}
        {#if row.key}
          {#if row.hold}<span class="hold">Hold</span>{/if}
          <Keycap>{row.key}</Keycap>
        {/if}
      </div>
    {/each}
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
    white-space: nowrap;
    margin-right: 6px;
  }
  .off,
  .hold {
    font-size: 12px;
    font-weight: 400;
  }
</style>
