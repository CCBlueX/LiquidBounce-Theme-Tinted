<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { on, onReconnect } from "../../../lib/api/events";
  import { globalSettings } from "../../../lib/api/routes";
  import type { ChoiceGroup, ConfigurableGroup, ToggleableGroup, ValueGroup } from "../../../lib/api/types";
  import { expand, slideIn } from "../../../lib/motion";
  import { play } from "../../../lib/sound";
  import Switch from "../../../lib/ui/Switch.svelte";
  import { SettingsEditor } from "../editor.svelte";
  import { contents, enabledOf, isGroup, locate, pathKey, type Item, type SettingsArea, type Trail } from "../tree";
  import Chooser from "../values/Chooser.svelte";
  import Pane from "../values/Pane.svelte";
  import Rows from "../values/Rows.svelte";
  import { changes, clientRoot, loadClient, loadHud, NOTES, tintedRoot, title, type AreaRoot } from "./areas";

  // Tinted's own values, then the client's global settings, each top-level group as a titled section. Groups nested
  // deeper than a section shows inline open as pages with a back control, as in the inspector.
  let {
    reveal,
  }: {
    /** Value to scroll to and highlight, by its names from the area's root; a new object for every request. */
    reveal?: { area: SettingsArea; names: string[] };
  } = $props();

  const editors: Record<SettingsArea, SettingsEditor> = {
    tinted: new SettingsEditor("HUD"),
    client: new SettingsEditor(globalSettings.put),
  };
  onDestroy(() => {
    editors.tinted.dispose();
    editors.client.dispose();
  });

  let hud = $state<ToggleableGroup | undefined>();
  let client = $state<ConfigurableGroup | undefined>();
  let failed = $state<Record<SettingsArea, boolean>>({ tinted: false, client: false });
  let stack = $state<{ area: SettingsArea; names: string[] }[]>([]);
  let scroller: HTMLDivElement;
  let scrolled = $state(false);

  const roots = $derived<Record<SettingsArea, AreaRoot | undefined>>({
    tinted: hud && tintedRoot(hud),
    client: client && clientRoot(client),
  });
  const trees = $derived<Record<SettingsArea, ValueGroup | undefined>>({ tinted: hud, client });

  async function load(area: SettingsArea) {
    try {
      if (area === "tinted") hud = await loadHud();
      else client = await loadClient();
      failed[area] = false;
    } catch {
      failed[area] = true;
      play("error");
    }
  }

  // Values that change elsewhere (or show and hide after an edit) arrive as valueChanged; reload once things settle
  const timers: Partial<Record<SettingsArea, number>> = {};
  function scheduleRefresh(area: SettingsArea) {
    clearTimeout(timers[area]);
    timers[area] = window.setTimeout(() => (editors[area].pending > 0 ? scheduleRefresh(area) : load(area)), 400);
  }

  $effect(() => {
    load("tinted");
    load("client");
    const off = on("valueChanged", (event) => {
      const area = changes(event.value.key);
      if (area) scheduleRefresh(area);
    });
    const offReconnect = onReconnect(() => {
      scheduleRefresh("tinted");
      scheduleRefresh("client");
    });
    return () => {
      off();
      offReconnect();
      clearTimeout(timers.tinted);
      clearTimeout(timers.client);
    };
  });

  const page = $derived.by(() => {
    const top = stack.at(-1);
    const tree = top && trees[top.area];
    if (!top || !tree) return undefined;
    const found = locate(tree, top.names);
    return found ? { ...found, ...top } : undefined;
  });

  // A drilled-in group can disappear after a reload (hidden by another value); fall back to its parent
  $effect(() => {
    const top = stack.at(-1);
    if (top && trees[top.area] && !page) stack = stack.slice(0, -1);
  });

  function drillIn(area: SettingsArea) {
    return (names: string[]) => {
      stack = [...stack, { area, names }];
      scroller?.scrollTo({ top: 0 });
      tick().then(() => scroller?.querySelector<HTMLElement>(".back")?.focus({ preventScroll: true }));
    };
  }

  function back() {
    play("tap");
    const left = stack.at(-1);
    stack = stack.slice(0, -1);
    scroller?.scrollTo({ top: 0 });
    // Focus returns to the row that opened the page, which scrolls it back into view
    tick().then(() => {
      const scope = left && scroller?.querySelector(`[data-area="${left.area}"]`);
      const row = left && scope?.querySelector<HTMLElement>(`button[data-key="${CSS.escape(left.names.join("/"))}"]`);
      (row ?? scroller?.querySelector<HTMLElement>(".back, button, input, [tabindex='0']"))?.focus();
    });
  }

  const parentTitle = $derived.by(() => {
    if (!page) return "Settings";
    const base = roots[page.area]?.base.length ?? 0;
    return page.names.length - base > 1 ? title(page.names[page.names.length - 2]) : "Settings";
  });

  /** Opens whatever holds the value at `names` (from the area root) and scrolls it into view. */
  async function show(area: SettingsArea, names: string[]) {
    const root = roots[area];
    if (!root) return;
    const nextStack: typeof stack = [];
    let level = 0;
    let group = root.group;
    let trail: Trail = root.trail;
    for (let i = 0; i < names.length - 1; i++) {
      const item = contents(group, trail).find((candidate) => candidate.node.name === names[i] && isGroup(candidate.node));
      if (!item) break;
      const child = item.node as ValueGroup;
      // Same rules as the sections here and Rows: sections, inline groups, inline choices, then a page
      if (level === 0) level = 1;
      else if (child.valueType === "CHOICE" && level <= 2) level++;
      else if (level === 1) {
        editors[area].expanded.add(pathKey(item.trail, child.name));
        level = 2;
      } else {
        nextStack.push({ area, names: [...root.base, ...names.slice(0, i + 1)] });
        level = 0;
      }
      group = child;
      trail = item.trail;
    }
    stack = nextStack;
    await tick();
    // Sections still opening by height have their final layout only after the transition starts
    await new Promise((done) => requestAnimationFrame(done));
    const scope = scroller?.querySelector(`[data-area="${area}"]`);
    for (let length = names.length; length > 0; length--) {
      const key = [...root.base, ...names.slice(0, length)].join("/");
      const target = scope?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
      if (!target) continue;
      target.scrollIntoView({ block: "center" });
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
      target.querySelector<HTMLElement>("button, input, [tabindex='0']")?.focus({ preventScroll: true });
      break;
    }
  }

  let shownFor: typeof reveal;
  $effect(() => {
    if (reveal && reveal !== shownFor && roots[reveal.area]) {
      shownFor = reveal;
      show(reveal.area, reveal.names);
    }
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && stack.length && !document.querySelector(":popover-open")) {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
  }
</script>

{#snippet section(item: Item, area: SettingsArea, base: string[])}
  {@const group = item.node as ValueGroup}
  {@const label = title(group.name)}
  {@const enabled = enabledOf(group)}
  {@const inner = contents(group, item.trail)}
  {@const editor = editors[area]}
  {@const note = area === "client" ? NOTES[group.name] : undefined}
  <section class="sec" data-key={pathKey(item.trail, group.name)} data-type={group.valueType}>
    <div class="title">
      <div class="grow">
        <h3 class="t-footnote">{label}</h3>
        {#if note}<p class="t-footnote l2 note">{note}</p>{/if}
      </div>
      {#if enabled}
        <Switch checked={enabled.value} {label} small onchange={(value) => editor.set([...item.trail, { node: group }], enabled, value)} />
      {/if}
    </div>
    {#if !enabled || enabled.value}
      {#if group.valueType === "CHOICE" || inner.length}
        <div class="cg-group" transition:expand>
          {#if group.valueType === "CHOICE"}
            {@const choice = group as ChoiceGroup}
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
          <Rows items={inner} level={1} path={[...base, group.name]} {editor} drill={drillIn(area)} />
        </div>
      {:else if !enabled}
        <p class="off t-footnote">No settings</p>
      {/if}
    {:else}
      <p class="off t-footnote" transition:expand>Off · {inner.length === 1 ? "1 setting" : `${inner.length} settings`}</p>
    {/if}
  </section>
{/snippet}

{#snippet areaBlock(area: SettingsArea, heading: string, missing: string)}
  {@const root = roots[area]}
  <div class="area" data-area={area}>
    <h2 class="t-title3">{heading}</h2>
    {#if failed[area]}
      <div class="failed">
        <p class="t-callout l2">{missing}</p>
        <button class="cg-pill" onclick={() => load(area)}>Try again</button>
      </div>
    {:else if root}
      {@const items = contents(root.group, root.trail)}
      {@const leaves = items.filter((item) => !isGroup(item.node))}
      {#if leaves.length}
        <div class="cg-group sec">
          <Rows items={leaves} level={1} path={root.base} editor={editors[area]} drill={drillIn(area)} />
        </div>
      {/if}
      {#each items.filter((item) => isGroup(item.node)) as item (item.node.name + item.node.valueType)}
        {@render section(item, area, root.base)}
      {/each}
    {:else if area === "tinted" && hud}
      <p class="t-callout l2 failed">Tinted's settings were not found in the HUD module.</p>
    {/if}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Esc goes back a page from any control inside) -->
<div
  class="scroll on-glass"
  class:scrolled
  bind:this={scroller}
  onscroll={() => (scrolled = scroller.scrollTop > 0)}
  onkeydown={keydown}
  role="region"
  aria-label="Settings"
>
  <div class="column">
    {#key stack.length}
      {#if page}
        {@const group = page.group}
        {@const enabled = enabledOf(group)}
        {@const heading = title(group.name)}
        {@const base = roots[page.area]?.base.length ?? 0}
        <div class="page" data-area={page.area} in:slideIn={{ x: 8, duration: 180 }}>
          <button class="back" onclick={back} aria-label="Back to {parentTitle}">
            <span aria-hidden="true">‹</span>{parentTitle}
          </button>
          <div class="page-title">
            <div>
              <h3 class="t-title3">{heading}</h3>
              {#if page.names.length - base > 1}
                <p class="t-footnote l2">{page.names.slice(base, -1).map(title).join(" › ")}</p>
              {/if}
            </div>
            {#if enabled}
              <Switch checked={enabled.value} label={heading} onchange={(value) => editors[page.area].set([...page.trail, { node: group }], enabled, value)} />
            {/if}
          </div>
          {#if group.valueType === "CHOICE"}
            {@const choice = group as ChoiceGroup}
            <div class="cg-group mode">
              <div class="cg-row">
                <span class="cg-label">Mode</span>
                <Chooser
                  options={Object.keys(choice.choices)}
                  value={choice.active}
                  label="{heading} mode"
                  onchange={(active) => editors[page.area].choose(page.trail, choice, active)}
                />
              </div>
            </div>
          {/if}
          <Pane group={page.group} trail={page.trail} path={page.names} editor={editors[page.area]} drill={drillIn(page.area)} />
        </div>
      {:else}
        <div class="page" in:slideIn={{ x: -8, duration: 180 }}>
          {@render areaBlock("tinted", "Tinted", "Tinted's settings could not be loaded from the client.")}
          {@render areaBlock("client", "Client", "The client's settings could not be loaded.")}
        </div>
      {/if}
    {/key}
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 3px 16px 40px;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, transparent 0, #000 8px, #000 calc(100% - 48px), transparent calc(100% - 8px));
  }
  .scroll.scrolled { mask-image: linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 48px), transparent calc(100% - 8px)); }
  .column { max-width: 600px; margin: 0 auto; }
  .area + .area { margin-top: 28px; }
  .area > h2 { margin: 0 4px 2px; }
  .sec { margin-top: 12px; }
  .title { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; margin: 0 2px 4px 4px; }
  .grow { flex: 1; min-width: 0; }
  h3 { font-weight: 600; color: var(--label-2); }
  .note { margin-top: 1px; }
  .off { padding: 0 4px; color: var(--label-3); }
  .failed { display: grid; gap: 8px; justify-items: start; padding: 8px 4px; }
  .page { padding-top: 4px; }
  .page-title h3 { color: var(--label); font-weight: inherit; }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px 0 6px;
    margin-left: -2px;
    border-radius: 13px;
    color: var(--label-2);
    font-size: 13px;
    font-weight: 500;
  }
  .back:hover { background: var(--fill); color: var(--label); }
  .back span { font-size: 18px; margin-top: -2px; }
  .page-title { display: flex; align-items: center; justify-content: space-between; margin: 4px 4px 8px; gap: 8px; }
  .mode { margin-bottom: 4px; }
  .scroll :global(.flash) { animation: flash 1.4s var(--ease); border-radius: var(--r-group); }
  @keyframes flash {
    0%, 30% { background-color: var(--accent-tint); }
  }
</style>
