<script lang="ts">
  import type { ChoiceGroup, ValueGroup } from "../../../lib/api/types";
  import { expand } from "../../../lib/motion";
  import Switch from "../../../lib/ui/Switch.svelte";
  import type { SettingsEditor } from "../editor.svelte";
  import { contents, enabledOf, humanize, isGroup, pathKey, type Item, type Trail } from "../tree";
  import Chooser from "./Chooser.svelte";
  import Rows from "./Rows.svelte";

  // Everything inside one group as the pane shows it: plain values first in one box, then each child group as a
  // titled section. Used for the module root and for every drilled-in group.
  let {
    group,
    trail,
    path,
    editor,
    drill,
    generalTitle,
  }: {
    group: ValueGroup;
    trail: Trail;
    path: string[];
    editor: SettingsEditor;
    drill: (names: string[]) => void;
    /** Title of the box of plain values; none in drilled-in groups, where the header already names them. */
    generalTitle?: string;
  } = $props();

  const items = $derived(contents(group, trail));
  const leaves = $derived(items.filter((item) => !isGroup(item.node)));
  const groups = $derived(items.filter((item) => isGroup(item.node)));
</script>

{#snippet sectionTitle(text: string, item: Item)}
  {@const section = item.node as ValueGroup}
  {@const enabled = enabledOf(section)}
  <div class="title">
    <h3 class="t-footnote">{text}</h3>
    {#if enabled}
      <Switch checked={enabled.value} label={text} small onchange={(value) => editor.set([...item.trail, { node: section }], enabled, value)} />
    {/if}
  </div>
{/snippet}

{#if leaves.length}
  <section class="sec">
    {#if generalTitle && groups.length}<div class="title"><h3 class="t-footnote">{generalTitle}</h3></div>{/if}
    <div class="cg-group">
      <Rows items={leaves} level={1} {path} {editor} {drill} />
    </div>
  </section>
{/if}

{#each groups as item (item.node.name + item.node.valueType)}
  {@const section = item.node as ValueGroup}
  {@const label = humanize(section.name)}
  {@const enabled = enabledOf(section)}
  {@const inner = contents(section, item.trail)}
  <section class="sec" data-key={pathKey(item.trail, section.name)} data-type={section.valueType}>
    {@render sectionTitle(label, item)}
    {#if !enabled || enabled.value}
      {#if section.valueType === "CHOICE" || inner.length}
        <div class="cg-group" transition:expand>
          {#if section.valueType === "CHOICE"}
            {@const choice = section as ChoiceGroup}
            <div class="cg-row">
              <span class="cg-label">Mode</span>
              <Chooser
                options={Object.keys(choice.choices)}
                value={choice.active}
                label="{label} mode"
                onchange={(active) => editor.choose(item.trail, choice, active)}
              />
            </div>
          {/if}
          <Rows items={inner} level={1} path={[...path, section.name]} {editor} {drill} />
        </div>
      {/if}
    {:else}
      <p class="off t-footnote" transition:expand>Off · {inner.length === 1 ? "1 setting" : `${inner.length} settings`}</p>
    {/if}
  </section>
{/each}

<style>
  .sec { margin-top: 12px; }
  .sec:first-child { margin-top: 2px; }
  .title { display: flex; align-items: center; justify-content: space-between; min-height: 24px; margin: 0 2px 4px 4px; }
  h3 { font-weight: 600; color: var(--label-2); }
  .off { padding: 0 4px; color: var(--label-3); }
</style>
