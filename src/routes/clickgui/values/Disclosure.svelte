<script lang="ts">
  import type { ValueGroup } from "../../../lib/api/types";
  import { expand } from "../../../lib/motion";
  import { play } from "../../../lib/sound";
  import Switch from "../../../lib/ui/Switch.svelte";
  import type { SettingsEditor } from "../editor.svelte";
  import { contents, enabledOf, humanize, pathKey, type Item } from "../tree";
  import Rows from "./Rows.svelte";

  // A group inside a section: a row that opens its values inline, by height
  let {
    item,
    path,
    editor,
    drill,
  }: { item: Item; path: string[]; editor: SettingsEditor; drill: (names: string[]) => void } = $props();

  const group = $derived(item.node as ValueGroup);
  const key = $derived(pathKey(item.trail, group.name));
  const open = $derived(editor.expanded.has(key));
  const label = $derived(humanize(group.name));
  const enabled = $derived(enabledOf(group));
  const inner = $derived(contents(group, item.trail));
  const ownTrail = $derived([...item.trail, { node: group }]);

  function toggle() {
    play("tap");
    if (open) editor.expanded.delete(key);
    else editor.expanded.add(key);
  }
</script>

<div data-key={key} data-type={group.valueType}>
  <div class="cg-row head">
    <button class="opener" aria-expanded={open} aria-controls="group-{key}" onclick={toggle}>
      <span class="cg-label">{label}</span>
      <span class="cg-val t-callout">{inner.length === 1 ? "1 setting" : `${inner.length} settings`}</span>
      <span class="chev" class:open aria-hidden="true">›</span>
    </button>
    {#if enabled}
      <Switch checked={enabled.value} {label} small onchange={(value) => editor.set(ownTrail, enabled, value)} />
    {/if}
  </div>
  {#if open && inner.length}
    <div class="cg-inset" id="group-{key}" transition:expand>
      <Rows items={inner} level={2} {path} {editor} {drill} />
    </div>
  {/if}
</div>

<style>
  .opener {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  .chev {
    width: 12px;
    color: var(--label-3);
    font-size: 18px;
    transition: transform var(--t-pop) var(--ease);
  }
  .chev.open { transform: rotate(90deg); }
</style>
