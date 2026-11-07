<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { moduleItem } from "../../lib/icons";
  import { keyLabel } from "../../lib/keys";
  import { moduleStore } from "../../lib/modules.svelte";
  import { isReducedMotion, spring } from "../../lib/motion";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";

  type Row = { name: string; item: string; enabled: boolean; key: string | null; hold: boolean };

  // Everything that is on, then everything a key can turn on; modules hidden from the module list stay hidden unless
  // they carry a bind
  const rows = $derived.by(() => {
    const result: Row[] = [];
    for (const module of moduleStore.list) {
      const key = keyLabel(module.keyBind?.boundKey);
      if (!(module.enabled && !module.hidden) && !key) continue;
      result.push({
        name: module.name,
        item: moduleItem(module.name, module.category),
        enabled: module.enabled,
        key,
        hold: module.keyBind?.action === "Hold",
      });
    }
    return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  });

  const enabledCount = $derived(rows.filter((row) => row.enabled).length);

  const move = (node: Element, fromTo: { from: DOMRect; to: DOMRect }) =>
    flip(node, fromTo, { duration: isReducedMotion() ? 0 : 320, easing: spring });
  const appear = (node: Element) => fade(node, { duration: isReducedMotion() ? 120 : 180 });
</script>

{#if rows.length}
  <section
    class="list glass on-glass"
    aria-label="Modules, {enabledCount} on"
    transition:fade={{ duration: 160 }}
  >
    {#each rows as row (row.name)}
      <div class="row" class:on={row.enabled} animate:move transition:appear>
        <ItemIcon id={row.item} size={16} />
        <span class="name">{row.name}</span>
        {#if !row.enabled}<span class="off">Off</span>{/if}
        {#if row.key}
          <span class="bind">
            {#if row.hold}<span class="hold">Hold</span>{/if}
            <Keycap>{row.key}</Keycap>
          </span>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border-radius: var(--r-group);
    min-width: 176px;
    box-shadow: var(--specular), 0 10px 30px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 3px 0 8px;
    border-radius: var(--r-control);
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
    /* Off rows are quieter than on rows but stay readable: binds are what the player reaches for */
    color: var(--label-2);
  }
  .row.on {
    color: var(--label);
    background: var(--fill);
  }
  .row:not(.on) :global(img) {
    opacity: 0.55;
  }
  .row:not(:has(.bind)) {
    padding-right: 12px;
  }
  .name {
    flex: 1;
    white-space: nowrap;
  }
  .off {
    font-size: 12px;
    font-weight: 400;
    margin-left: 8px;
  }
  .bind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
  }
  .hold {
    font-size: 11px;
    line-height: 14px;
    font-weight: 500;
    color: var(--label-2);
  }
</style>
