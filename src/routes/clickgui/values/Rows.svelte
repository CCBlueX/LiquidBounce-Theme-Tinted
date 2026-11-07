<script lang="ts">
  import type { ChoiceGroup, ValueGroup } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import type { SettingsEditor } from "../editor.svelte";
  import { contents, enabledOf, humanize, isGroup, pathKey, type Item } from "../tree";
  import Chooser from "./Chooser.svelte";
  import Disclosure from "./Disclosure.svelte";
  import Rows from "./Rows.svelte";
  import ValueRow from "./ValueRow.svelte";

  // Rows of one group. Inside a section (level 1) child groups open inline; one level further down they become
  // drill-in rows, so the pane never nests deeper than two insets. A CHOICE shows its chooser with the active
  // mode's values right below it.
  let {
    items,
    level,
    path,
    editor,
    drill,
  }: { items: Item[]; level: number; path: string[]; editor: SettingsEditor; drill: (names: string[]) => void } = $props();

  function summary(group: ValueGroup): string {
    if (group.valueType === "CHOICE") return group.active;
    const count = contents(group, []).length;
    const settings = count === 1 ? "1 setting" : `${count} settings`;
    const enabled = enabledOf(group);
    return enabled ? `${enabled.value ? "On" : "Off"} · ${settings}` : settings;
  }
</script>

{#each items as item (pathKey(item.trail, item.node.name))}
  {@const node = item.node}
  {#if !isGroup(node)}
    <ValueRow {item} {editor} />
  {:else if node.valueType === "CHOICE" && level <= 2}
    {@const choice = node as ChoiceGroup}
    {@const inner = contents(choice, item.trail)}
    <div class="choice" data-key={pathKey(item.trail, node.name)} data-type="CHOICE">
      <div class="cg-row">
        <span class="cg-label">{humanize(node.name)}</span>
        <Chooser
          options={Object.keys(choice.choices)}
          value={choice.active}
          label={humanize(node.name)}
          onchange={(active) => editor.choose(item.trail, choice, active)}
        />
      </div>
      {#if inner.length}
        <div class="cg-inset">
          <Rows items={inner} level={level + 1} path={[...path, node.name]} {editor} {drill} />
        </div>
      {/if}
    </div>
  {:else if level === 1 && node.valueType !== "CHOICE"}
    <Disclosure {item} path={[...path, node.name]} {editor} {drill} />
  {:else}
    <button
      class="cg-row drill"
      data-key={pathKey(item.trail, node.name)}
      data-type={node.valueType}
      onclick={() => {
        play("tap");
        drill([...path, node.name]);
      }}
    >
      <span class="cg-label">{humanize(node.name)}</span>
      <span class="cg-val t-callout">{summary(node)}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
  {/if}
{/each}

<style>
  .drill { width: 100%; text-align: left; border-radius: inherit; }
  .drill:hover { background: rgb(255 255 255 / 0.04); }
  .chev { color: var(--label-3); font-size: 18px; margin-left: -4px; }
</style>
