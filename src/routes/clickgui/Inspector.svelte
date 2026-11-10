<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { on, onReconnect } from "../../lib/api/events";
  import { modules } from "../../lib/api/routes";
  import type { BindValue, ChoiceGroup, InputBind, Module, ToggleableGroup, ValueGroup } from "../../lib/api/types";
  import { keepEscape } from "../../lib/escape.svelte";
  import { slideIn } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import Switch from "../../lib/ui/Switch.svelte";
  import { SettingsEditor } from "./editor.svelte";
  import { contents, enabledOf, humanize, isGroup, locate, pathKey, type Trail } from "./tree";
  import Chooser from "./values/Chooser.svelte";
  import Pane from "./values/Pane.svelte";

  // The selected module: header with state and bind, then its full settings tree. Groups nested deeper than the
  // pane shows inline open as pages with a back control.
  let {
    module,
    reveal,
    ontoggle,
    onbind,
  }: {
    module: Module;
    /** Value to scroll to and highlight, by the names on its way down from the module root. */
    reveal?: string[];
    ontoggle: (enabled: boolean) => void;
    onbind: (bind: InputBind) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const editor = new SettingsEditor(module.name);
  onDestroy(() => editor.dispose());

  let tree = $state<ToggleableGroup | undefined>();
  let failed = $state(false);
  let stack = $state<string[][]>([]);
  let root = $state<HTMLDivElement>();
  keepEscape(() => stack.length > 0 && !!root?.contains(document.activeElement));
  let scroller: HTMLDivElement;
  // Rows that scroll up under the header fade out over a longer stretch, and the header gets its hairline
  let scrolled = $state(false);

  async function load() {
    try {
      tree = await modules.settings(module.name);
      failed = false;
    } catch {
      failed = true;
      play("error");
    }
  }

  // Values that change elsewhere (or show and hide after an edit) arrive as valueChanged; reload once things settle
  let refreshTimer: number | undefined;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => (editor.pending > 0 ? scheduleRefresh() : load()), 400);
  }

  $effect(() => {
    load();
    const prefix = `liquidbounce.module.${module.name.charAt(0).toLowerCase()}${module.name.slice(1)}.`;
    const off = on("valueChanged", (event) => {
      if (event.value.key?.startsWith(prefix)) scheduleRefresh();
    });
    const offReconnect = onReconnect(scheduleRefresh);
    return () => {
      off();
      offReconnect();
      clearTimeout(refreshTimer);
    };
  });

  const bindNode = $derived(
    tree?.value.find((node): node is BindValue => node.name === "Bind" && node.valueType === "BIND"),
  );

  // The card in the grid shows the Bind row's value, rollbacks included
  $effect(() => {
    const bind = bindNode?.value;
    if (!bind) return;
    const shown = module.keyBind;
    const modifiers = bind.modifiers ?? [];
    if (bind.boundKey !== shown.boundKey || bind.action !== shown.action || modifiers.join() !== (shown.modifiers ?? []).join()) {
      onbind({ boundKey: bind.boundKey, action: bind.action, modifiers });
    }
  });

  const page = $derived.by(() => {
    if (!tree) return undefined;
    const names = stack.at(-1);
    if (!names) return { group: tree as ValueGroup, trail: [] as Trail, names: [] as string[] };
    const found = locate(tree, names);
    return found ? { ...found, names } : undefined;
  });

  // A drilled-in group can disappear after a reload (hidden by another value); fall back to its parent
  $effect(() => {
    if (tree && stack.length && !page) stack = stack.slice(0, -1);
  });

  function drill(names: string[]) {
    stack = [...stack, names];
    scroller?.scrollTo({ top: 0 });
    // The row that opened the page leaves with the old page; focus goes to the way back
    tick().then(() => scroller?.querySelector<HTMLElement>(".back")?.focus({ preventScroll: true }));
  }

  function back() {
    play("tap");
    const left = stack.at(-1);
    stack = stack.slice(0, -1);
    scroller?.scrollTo({ top: 0 });
    // Focus returns to the row that opened the page, which scrolls it back into view
    tick().then(() => {
      const row = left && scroller?.querySelector<HTMLElement>(`button[data-key="${CSS.escape(left.join("/"))}"]`);
      (row ?? scroller?.querySelector<HTMLElement>(".back, button, input, [tabindex='0']"))?.focus();
    });
  }

  const parentTitle = $derived(
    stack.length > 1 ? humanize(stack[stack.length - 2].at(-1) ?? module.name) : module.name,
  );

  /** Opens whatever holds the value at `names` and scrolls it into view. */
  async function show(names: string[]) {
    if (!tree) return;
    const nextStack: string[][] = [];
    let level = 0;
    let group: ValueGroup = tree;
    let trail: Trail = [];
    for (let i = 0; i < names.length - 1; i++) {
      const item = contents(group, trail).find((candidate) => candidate.node.name === names[i] && isGroup(candidate.node));
      if (!item) break;
      const child = item.node as ValueGroup;
      // Same rules as Pane and Rows: sections, inline groups, inline choices, then a page
      if (level === 0) level = 1;
      else if (child.valueType === "CHOICE" && level <= 2) level++;
      else if (level === 1) {
        editor.expanded.add(pathKey(item.trail, child.name));
        level = 2;
      } else {
        nextStack.push(names.slice(0, i + 1));
        level = 0;
      }
      group = child;
      trail = item.trail;
    }
    stack = nextStack;
    await tick();
    // Sections still opening by height have their final layout only after the transition starts
    await new Promise((done) => requestAnimationFrame(done));
    for (let length = names.length; length > 0; length--) {
      const target = scroller?.querySelector<HTMLElement>(`[data-key="${CSS.escape(names.slice(0, length).join("/"))}"]`);
      if (!target) continue;
      target.scrollIntoView({ block: "center" });
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
      target.querySelector<HTMLElement>("button, input, [tabindex='0']")?.focus({ preventScroll: true });
      break;
    }
  }

  let shownFor: string[] | undefined;
  $effect(() => {
    if (tree && reveal && reveal !== shownFor) {
      shownFor = reveal;
      show(reveal);
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Esc goes back a page from any control inside) -->
<div class="inspector" bind:this={root} onkeydown={keydown} role="region" aria-label="{module.name} settings">
  <header class="top on-glass" class:scrolled>
    <div class="grow">
      <h2 class="t-title3">{module.name}</h2>
      <p class="t-footnote l2 desc" title={module.description}>{module.description}</p>
    </div>
    <Switch checked={module.enabled} label={module.name} onchange={ontoggle} />
  </header>

  <div class="scroll on-glass" class:scrolled bind:this={scroller} onscroll={() => (scrolled = scroller.scrollTop > 0)}>
    {#if failed}
      <div class="failed">
        <p class="t-callout l2">The settings of {module.name} could not be loaded.</p>
        <button class="cg-pill" onclick={load}>Try again</button>
      </div>
    {:else if page}
      {#key stack.length}
        <div class="page" in:slideIn={{ x: stack.length ? 8 : -8, duration: 180 }}>
          {#if stack.length}
            {@const group = page.group}
            {@const enabled = enabledOf(group)}
            {@const title = humanize(group.name)}
            <button class="back" onclick={back} aria-label="Back to {parentTitle}">
              <span aria-hidden="true">‹</span>{parentTitle}
            </button>
            <div class="page-title">
              <div>
                <h3 class="t-title3">{title}</h3>
                {#if page.names.length > 1}
                  <p class="t-footnote l2">{page.names.slice(0, -1).map(humanize).join(" › ")}</p>
                {/if}
              </div>
              {#if enabled}
                <Switch checked={enabled.value} label={title} onchange={(value) => editor.set([...page.trail, { node: group }], enabled, value)} />
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
                    label="{title} mode"
                    onchange={(active) => editor.choose(page.trail, choice, active)}
                  />
                </div>
              </div>
            {/if}
          {/if}
          <Pane
            group={page.group}
            trail={page.trail}
            path={page.names}
            {editor}
            {drill}
            generalTitle={stack.length ? undefined : "General"}
          />
        </div>
      {/key}
    {/if}
  </div>
</div>

<style>
  .inspector { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .top { position: relative; display: flex; align-items: center; gap: 8px; padding: 14px 12px 8px 16px; }
  .top::after {
    content: "";
    position: absolute;
    left: 16px;
    right: 12px;
    bottom: 0;
    height: 0.5px;
    background: var(--line);
    opacity: 0;
    transition: opacity var(--t-pop) var(--ease);
  }
  .top.scrolled::after { opacity: 1; }
  .grow { flex: 1; min-width: 0; }
  h2 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .desc { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 12px 32px;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, transparent 0, #000 8px, #000 calc(100% - 32px), transparent);
  }
  .scroll.scrolled { mask-image: linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 32px), transparent); }
  .page { padding-top: 4px; }
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
  .failed { display: grid; gap: 8px; justify-items: start; padding: 8px 4px; }
  .inspector :global(.flash) { animation: flash 1.4s var(--ease); border-radius: var(--r-group); }
  @keyframes flash {
    0%, 30% { background-color: var(--accent-tint); }
  }
</style>
