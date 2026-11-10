<script lang="ts">
  import "../../lib/ui/values.css";
  import { onMount, tick, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { request } from "../../lib/api/client";
  import { on, onReconnect } from "../../lib/api/events";
  import { modules } from "../../lib/api/routes";
  import { onScreenChange, readLocation } from "../../lib/api/screen";
  import type { Module, ScreenInfo } from "../../lib/api/types";
  import { escapeKept, keepEscape, screenOpened } from "../../lib/escape.svelte";
  import HudEditor from "../../lib/hud/Editor.svelte";
  import { easeOut, flipDuration, rise, slideIn } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import { typingFocus } from "../../lib/typing";
  import SearchField from "../../lib/ui/SearchField.svelte";
  import Segmented from "../../lib/ui/Segmented.svelte";
  import Categories, { type ClickGuiView } from "./Categories.svelte";
  import Inspector from "./Inspector.svelte";
  import MarketDetail from "./marketplace/MarketDetail.svelte";
  import MarketplaceView from "./marketplace/MarketplaceView.svelte";
  import { marketState } from "./marketplace/market.svelte";
  import ModuleRow from "./ModuleRow.svelte";
  import SettingsView from "./settings/SettingsView.svelte";
  import { areaEntries } from "./settings/areas";
  import { moduleScore, settingEntries, settingScore, type SettingHit, type SettingsArea } from "./tree";

  const STORAGE_KEY = "tinted.clickgui";
  const SETTING_RESULTS = 40;

  let list = $state<Module[]>([]);
  let categories = $state<string[]>([]);
  let failed = $state(false);
  let category = $state("");
  let selectedName = $state<string | undefined>();
  let filter = $state("All");
  let query = $state("");
  let reveal = $state<string[] | undefined>();
  let autofocus = $state(false);
  let ready = $state(false);
  let focusName = $state<string | undefined>();
  let searchBox = $state<HTMLDivElement>();
  let grid = $state<HTMLDivElement>();
  let frame = $state<HTMLDivElement>();
  let editingHud = $state(false);
  keepEscape(() => query !== "");
  let view = $state<ClickGuiView>("modules");
  let settingsReveal = $state<{ area: SettingsArea; names: string[] }>();

  const totals = $derived(
    list.reduce<Record<string, number>>((all, module) => {
      all[module.category] = (all[module.category] ?? 0) + 1;
      return all;
    }, {}),
  );
  const enabledCounts = $derived(
    list.reduce<Record<string, number>>((all, module) => {
      if (module.enabled) all[module.category] = (all[module.category] ?? 0) + 1;
      return all;
    }, {}),
  );
  // In the Marketplace the search field searches the marketplace
  const showMarket = $derived(view === "marketplace" && marketState.available === true);
  const searching = $derived(query.trim() !== "" && !showMarket);
  const showSettings = $derived(view === "settings" && !searching);
  const inCategory = $derived(list.filter((module) => module.category === category));
  const visible = $derived.by(() => {
    const base = searching
      ? list
          .map((module) => ({ module, score: moduleScore(module, query) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score || a.module.name.localeCompare(b.module.name))
          .map((entry) => entry.module)
      : inCategory;
    return filter === "Enabled" ? base.filter((module) => module.enabled) : base;
  });
  const selected = $derived(list.find((module) => module.name === selectedName));
  const focusTarget = $derived(
    visible.find((module) => module.name === focusName)?.name ??
      visible.find((module) => module.name === selectedName)?.name ??
      visible[0]?.name,
  );

  // A focused card that leaves the list (filtered out, search cleared) takes focus with it; the card it was, or the
  // one now in its place, gets it back
  let cardNames: string[] = [];
  let refocusAt: number | undefined;
  $effect.pre(() => {
    void visible;
    const active = document.activeElement;
    refocusAt = active instanceof HTMLElement && grid?.contains(active) ? Math.max(0, cardNames.indexOf(active.dataset.module ?? "")) : undefined;
  });
  $effect(() => {
    cardNames = visible.map((module) => module.name);
    if (refocusAt === undefined || document.activeElement !== document.body) return;
    const at = refocusAt;
    untrack(() => focusCard(visible.find((module) => module.name === focusName)?.name ?? visible[Math.min(at, visible.length - 1)]?.name));
  });

  // Setting names come from every module's tree; they are fetched once, the first time a search starts
  let settingIndex = $state.raw<SettingHit[]>([]);
  let indexing = false;
  async function buildIndex() {
    indexing = true;
    const queue = [...list];
    const worker = async () => {
      const found: SettingHit[] = [];
      for (let module = queue.shift(); module; module = queue.shift()) {
        try {
          found.push(...settingEntries(module, await modules.settings(module.name)));
        } catch {
          // A module whose tree fails to load is only missing from setting results
        }
        if (found.length > 400) settingIndex = [...settingIndex, ...found.splice(0)];
      }
      settingIndex = [...settingIndex, ...found];
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  $effect(() => {
    if (searching && !indexing && list.length) buildIndex();
  });
  // Settings view values are few; they are fetched again for every search so they show current modes
  let areaIndex = $state.raw<SettingHit[]>([]);
  $effect(() => {
    if (searching) untrack(() => areaEntries().then((hits) => (areaIndex = hits), () => {}));
  });
  const settingResults = $derived.by(() => {
    if (!searching) return [];
    return [...areaIndex, ...settingIndex]
      .map((hit) => ({ hit, score: settingScore(hit, query) }))
      .filter((entry) => entry.score > 0 && (filter === "All" || !entry.hit.module || entry.hit.module.enabled))
      .sort((a, b) => b.score - a.score || a.hit.where.localeCompare(b.hit.where))
      .slice(0, SETTING_RESULTS)
      .map((entry) => entry.hit);
  });

  async function load() {
    try {
      const [loaded, cats] = await Promise.all([modules.list(), modules.categories()]);
      list = loaded.sort((a, b) => a.name.localeCompare(b.name));
      categories = cats.map((entry) => entry.name);
      failed = false;
      if (!categories.includes(category)) category = categories[0] ?? "";
      if (!list.some((module) => module.name === selectedName)) {
        selectedName = list.find((module) => module.category === category)?.name;
      }
    } catch {
      failed = true;
      play("error");
    }
  }

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (typeof saved.category === "string") category = saved.category;
      if (typeof saved.module === "string") selectedName = saved.module;
      if (saved.view === "settings" || saved.view === "marketplace") view = saved.view;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    marketState.restore();
    marketState.probe();
    ready = true;
    // The cached page loads hidden when a world is joined
    if (!cached) play("open");
    load();
    // A page reload or disconnect while the HUD editor was open leaves the client hiding the HUD; nothing else resets it
    request("PUT", "/hud-editor", { body: { selected: false } }).catch(() => {});
    // ClickGUI's own setting decides whether the search field takes focus when the screen opens
    const settingsLoaded = modules
      .settings("ClickGUI")
      .then((tree) => {
        const node = tree.value.find((value) => value.name === "SearchBarAutoFocus");
        autofocus = node?.valueType === "BOOLEAN" && node.value;
      })
      .catch(() => {});
    // The cached page mostly loads hidden when a world is joined, but after a theme switch the client creates it as
    // the ClickGUI opens, after the toggle that shows it was sent
    if (cached) {
      Promise.all([request<ScreenInfo>("GET", "/screen"), settingsLoaded])
        .then(([info]) => {
          if (shown || info?.name !== STANDALONE_SCREEN) return;
          shown = true;
          play("open");
          if (autofocus) focusSearch();
        })
        .catch(() => {});
    }
    // What floats over the window closes with the ClickGUI, and focus leaves so no caret keeps the page drawing while it
    // fades out
    const offScreen = onScreenChange(({ name, action }) => {
      if (name !== "clickgui") return;
      if (action === "close") {
        dropLayers();
      } else {
        play("open");
        if (autofocus) focusSearch();
      }
    });
    // The in-game ClickGUI is a cached page the client only hides, with no virtualScreen events. Toggling the ClickGUI
    // module shows it; newer clients send every screen change, so a hide by anything but Esc reaches it as well.
    const offToggle = on("moduleActivation", ({ moduleName }) => {
      if (!cached || moduleName !== "ClickGUI") return;
      screenOpened("clickgui");
      shown = true;
      play("open");
      if (autofocus) focusSearch();
    });
    const offGameScreen = on("screen", ({ screen, isCancelled }) => {
      if (!cached || !shown || isCancelled || screen?.class === STANDALONE_SCREEN) return;
      hide();
    });
    return () => {
      offScreen();
      offToggle();
      offGameScreen();
    };
  });

  $effect(() => {
    if (category) localStorage.setItem(STORAGE_KEY, JSON.stringify({ category, module: selectedName, view }));
  });

  // Toggles arrive per module; a panic or config load sends dozens at once, so they are applied in batches
  $effect(() => {
    const queued = new Map<string, boolean>();
    let timer: number | undefined;
    let reload: number | undefined;
    const flush = () => {
      timer = undefined;
      for (const module of list) {
        const enabled = queued.get(module.name);
        if (enabled !== undefined) module.enabled = enabled;
      }
      queued.clear();
    };
    const offToggle = on("moduleToggle", (event) => {
      queued.set(event.moduleName, event.enabled);
      timer ??= window.setTimeout(flush, 200);
    });
    // Some modules refuse to stay on and send no toggle; the list tells the truth
    const offActivation = on("moduleActivation", () => {
      clearTimeout(reload);
      reload = window.setTimeout(load, 500);
    });
    // Toggles sent while the event socket was down are lost
    const offReconnect = onReconnect(load);
    return () => {
      offToggle();
      offActivation();
      offReconnect();
      clearTimeout(timer);
      clearTimeout(reload);
    };
  });

  async function toggle(module: Module, enabled: boolean) {
    const before = module.enabled;
    module.enabled = enabled;
    try {
      await modules.toggle(module.name, enabled);
    } catch {
      module.enabled = before;
      play("error");
    }
  }

  function select(module: Module, names?: string[]) {
    if (module.name !== selectedName || view !== "modules") play("tap");
    view = "modules";
    selectedName = module.name;
    focusName = module.name;
    reveal = names;
  }

  function chooseCategory(next: string) {
    category = next;
    view = "modules";
    query = "";
    grid?.scrollTo({ top: 0 });
  }

  function openSettings(reveal?: { area: SettingsArea; names: string[] }) {
    view = "settings";
    settingsReveal = reveal;
    query = "";
  }

  function openView(next: Exclude<ClickGuiView, "modules">) {
    if (next === "settings") return openSettings();
    view = next;
    query = "";
  }

  function openHit(hit: SettingHit) {
    if (hit.module) return select(hit.module, hit.names);
    play("tap");
    openSettings({ area: hit.area, names: hit.names });
  }

  function focusSearch(selectAll = false) {
    const input = searchBox?.querySelector("input");
    input?.focus();
    if (selectAll) input?.select();
  }

  function focusCard(name: string | undefined) {
    if (!name) return;
    focusName = name;
    grid?.querySelector<HTMLElement>(`[data-module="${CSS.escape(name)}"]`)?.focus();
  }

  function gridKey(event: KeyboardEvent, index: number) {
    const module = visible[index];
    if (event.key === " ") {
      event.preventDefault();
      play(module.enabled ? "toggleOff" : "toggleOn");
      toggle(module, !module.enabled);
      return;
    }
    // The list fills as many columns as fit, so a row's length comes from the layout
    const rows = grid?.querySelector(".grid");
    const columns = rows ? getComputedStyle(rows).gridTemplateColumns.split(" ").length : 1;
    const rowHeight = (event.currentTarget as HTMLElement).offsetHeight + (rows ? parseFloat(getComputedStyle(rows).rowGap) || 0 : 0);
    const page = Math.max(1, Math.floor((grid?.clientHeight ?? 0) / rowHeight) - 1) * columns;
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      PageDown: index + page,
      PageUp: index - page,
      Home: 0,
      End: visible.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0 && event.key === "ArrowUp") return focusSearch();
    focusCard(visible[Math.min(visible.length - 1, Math.max(0, next))]?.name);
  }

  function searchKey(event: KeyboardEvent) {
    if (showSettings || showMarket) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCard(focusTarget);
    } else if (event.key === "Enter" && visible[0]) {
      event.preventDefault();
      select(visible[0]);
      focusCard(visible[0].name);
    }
  }

  function dropLayers() {
    editingHud = false;
    for (const layer of document.querySelectorAll<HTMLElement>(":popover-open")) layer.hidePopover();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  // The client hides the in-game ClickGUI on Esc once nothing in it keeps the key; the page drops whatever is left so it
  // comes back clean
  const cached = readLocation().isStatic;
  const STANDALONE_SCREEN = "net.ccbluex.liquidbounce.integration.screen.impl.CustomStandaloneMinecraftScreen";
  let shown = false;
  function hide() {
    shown = false;
    query = "";
    dropLayers();
  }
  function cachedEscape(event: KeyboardEvent) {
    if (!cached || event.key !== "Escape" || escapeKept()) return;
    event.preventDefault();
    hide();
  }

  // Esc clears the search, which keeps the key while it has text; typing anywhere starts a search
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented || editingHud) return;
    const target = event.target as HTMLElement;
    const inField = target.matches?.("input:not([type=range]), textarea, [contenteditable]");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusSearch(true);
    } else if (event.key === "Escape") {
      if (document.querySelector(":popover-open")) return;
      event.preventDefault();
      if (query) {
        query = "";
        play("tap");
      }
    } else if (
      !inField &&
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !document.querySelector(":popover-open")
    ) {
      event.preventDefault();
      query += event.key;
      focusSearch();
    }
  }

  const title = $derived(
    showMarket ? "Marketplace" : searching ? `“${query.trim()}”` : showSettings ? "Settings" : category,
  );
  const searchHint = $derived(
    !showMarket
      ? "Search modules and settings"
      : marketState.kind === "Configs"
        ? "Search or paste a share code"
        : `Search ${marketState.kind.toLowerCase()}`,
  );
  // The sidebar already counts what is on in each category, so only a search says how much it found
  const subtitle = $derived.by(() => {
    const modulesText = visible.length === 1 ? "1 module" : `${visible.length} modules`;
    return settingResults.length ? `${modulesText} · ${settingResults.length} settings` : modulesText;
  });
</script>

<svelte:window onkeydown={windowKey} onkeydowncapture={cachedEscape} />

<div class="stage" role="presentation" {...typingFocus}>
  {#if ready}
    <div class="frame" class:away={editingHud} inert={editingHud} bind:this={frame}>
      <div class="glass window" in:rise>
        <Categories
          {categories}
          {totals}
          enabled={enabledCounts}
          current={searching ? "" : category}
          view={showMarket ? "marketplace" : showSettings ? "settings" : "modules"}
          marketplace={marketState.available === true}
          onselect={chooseCategory}
          onview={openView}
          onedithud={() => (editingHud = true)}
        />

        <main class="list" class:wide={showSettings || (showMarket && marketState.selected === undefined)} aria-label="ClickGUI">
          <header class="head on-glass">
            <div class="titles">
              <h1 class="t-large">{title}</h1>
              {#if showMarket}
                {#if marketState.rows.length || !marketState.loading}
                  <span class="t-callout l2 num">{marketState.total.toLocaleString("en-US")} {marketState.kind.toLowerCase()}</span>
                {/if}
              {:else if searching && !showSettings}
                <span class="t-callout l2 num">{subtitle}</span>
              {/if}
            </div>
            {#if !showSettings && !showMarket}
              <Segmented options={["All", "Enabled"]} value={filter} label="Show" small onchange={(value) => (filter = value)} />
            {/if}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys and Enter from the field inside) -->
            <div class="search" bind:this={searchBox} onkeydown={searchKey} role="search">
              <!-- The cached page loads hidden; it focuses the field itself when the ClickGUI shows -->
              <SearchField bind:value={query} placeholder={searchHint} shortcut="Ctrl K" autofocus={autofocus && !cached} />
            </div>
          </header>

          {#if showMarket}
            <MarketplaceView {query} />
          {:else if showSettings}
            <SettingsView reveal={settingsReveal} />
          {:else}
            <div class="grid-wrap" bind:this={grid}>
              {#if failed}
                <div class="empty">
                  <p class="t-callout l2">Modules could not be loaded from the client.</p>
                  <button class="cg-pill" onclick={load}>Try again</button>
                </div>
              {:else}
                {#key searching ? "search" : category}
                  <div class="grid on-glass" role="list" aria-label={searching ? "Matching modules" : ` modules`}>
                    {#each visible as module, index (module.name)}
                      <div role="listitem" animate:flip={{ duration: flipDuration(searching ? 0 : 200), easing: easeOut }}>
                        <ModuleRow
                          {module}
                          selected={module.name === selectedName}
                          focusable={module.name === focusTarget}
                          onselect={() => select(module)}
                          ontoggle={(enabled) => toggle(module, enabled)}
                          onkeydown={(event) => gridKey(event, index)}
                        />
                      </div>
                    {/each}
                  </div>
                {/key}
                {#if list.length && visible.length === 0 && !settingResults.length}
                  <p class="empty t-callout l2">
                    {searching
                      ? `No ${filter === "Enabled" ? "enabled " : ""}modules or settings match “${query.trim()}”`
                      : `No modules in ${category} are on`}
                  </p>
                {/if}
                {#if settingResults.length}
                  <section class="settings-results on-glass" aria-label="Matching settings">
                    <h2 class="t-footnote">Settings</h2>
                    <div class="cg-group">
                      {#each settingResults as hit (hit.where + hit.names.join("/"))}
                        <button class="cg-row hit" onclick={() => openHit(hit)}>
                          <span class="cg-label">{hit.label}</span>
                          <span class="cg-val t-footnote">{hit.where}</span>
                        </button>
                      {/each}
                    </div>
                  </section>
                {/if}
              {/if}
            </div>
          {/if}
        </main>

        {#if showMarket && marketState.selected !== undefined}
          <aside class="glass deep inspector" in:slideIn>
            <MarketDetail id={marketState.selected} configs={marketState.kind === "Configs"} />
          </aside>
        {:else if selected && !showSettings && !showMarket}
          <aside class="glass deep inspector" in:slideIn>
            {#key selected.name}
              <Inspector
                module={selected}
                {reveal}
                ontoggle={(enabled) => toggle(selected, enabled)}
                onbind={(bind) => (selected.keyBind = bind)}
              />
            {/key}
          </aside>
        {/if}
      </div>

    </div>
  {/if}
</div>

{#if editingHud}
  <HudEditor
    onclose={() => {
      editingHud = false;
      tick().then(() => frame?.querySelector<HTMLElement>(".edit")?.focus());
    }}
  />
{/if}

<style>
  .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .frame {
    position: relative;
    width: min(1240px, calc(100% - 48px));
    height: min(560px, calc(100% - 64px));
  }
  /* Hidden, not unmounted, while the HUD editor is open, so the window comes back as it was */
  .frame.away { visibility: hidden; }
  .window {
    position: absolute;
    inset: 0;
    border-radius: var(--r-window);
    overflow: hidden;
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr) 360px;
    grid-template-rows: minmax(0, 1fr);
  }
  .window > :global(.sidebar) { box-shadow: inset -0.5px 0 0 var(--line); }
  .list { grid-column: 2; min-width: 0; display: flex; flex-direction: column; container-type: inline-size; }
  /* The Settings view takes the module list's and the inspector's columns */
  .list.wide { grid-column: 2 / 4; }
  .head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }
  .titles { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
  h1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .titles span { white-space: nowrap; }
  @container (width < 620px) {
    .titles span { display: none; }
  }
  .search { width: 256px; flex: 0 1 256px; min-width: 150px; }
  /* The field draws its ring around the whole capsule; the input's own outline would double it */
  .search :global(input:focus-visible) { outline: none; }
  .grid-wrap {
    flex: 1;
    min-height: 0;
    padding: 3px 16px 40px;
    overflow-y: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, #000 calc(100% - 48px), transparent calc(100% - 8px));
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(208px, 1fr)); gap: 2px 8px; }
  .empty { display: grid; gap: 8px; justify-items: start; padding: 16px 4px; overflow-wrap: anywhere; }
  .settings-results { margin-top: 16px; }
  .settings-results h2 { margin: 0 4px 6px; font-weight: 600; color: var(--label-2); }
  .hit { width: 100%; text-align: left; border-radius: inherit; }
  .hit:hover { background: rgb(255 255 255 / 0.04); }
  .hit .cg-val { max-width: 50%; overflow: hidden; text-overflow: ellipsis; }

  .inspector { grid-column: 3; margin: 8px; border-radius: var(--r-pane); overflow: hidden; position: relative; }
</style>
