<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { request } from "../../lib/api/client";
  import { screen, worlds } from "../../lib/api/routes";
  import type { World } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import { absoluteTime, relativeTime } from "../../lib/format";
  import { play } from "../../lib/sound";
  import { isTextField, typingFocus } from "../../lib/typing";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import SearchField from "../../lib/ui/SearchField.svelte";
  import { difficultyLabel, gameModeLabel, modeLine, notices } from "./format";
  import WorldIcon from "./WorldIcon.svelte";

  let list = $state<World[] | undefined>();
  let failed = $state(false);
  let query = $state("");
  let selectedName = $state<string | undefined>();
  let confirming = $state(false);
  let status = $state("");
  let ready = $state(false);
  let now = $state(Date.now());

  let listEl = $state<HTMLElement | undefined>();
  let searchBox = $state<HTMLElement | undefined>();
  let playButton = $state<HTMLButtonElement | undefined>();
  let createButton = $state<HTMLButtonElement | undefined>();
  let deleteButton = $state<HTMLButtonElement | undefined>();

  // No world events exist: the list is read on open, after every action and on F5. Folder names are the identity;
  // ids are list indices and shift after a delete.
  async function load() {
    try {
      const fresh = await worlds.list();
      list = [...fresh].sort((a, b) => b.lastPlayed - a.lastPlayed);
      failed = false;
      now = Date.now();
      if (!list.some((world) => world.name === selectedName)) selectedName = list[0]?.name;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    ready = true;
    load().then(async () => {
      await tick();
      if (list?.length) focusSelected();
      else createButton?.focus();
    });
    const clock = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(clock);
  });

  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !list) return list ?? [];
    return list.filter((world) => world.displayName.toLowerCase().includes(needle) || world.name.toLowerCase().includes(needle));
  });
  const selected = $derived(visible.find((world) => world.name === selectedName) ?? visible[0]);
  const selectedNotices = $derived(selected ? notices(selected) : []);
  const blocked = $derived(selectedNotices.some((notice) => notice.blocks));
  const warned = $derived(!blocked && selectedNotices.length > 0);
  const countLabel = $derived(list ? (list.length === 1 ? "1 world" : `${list.length} worlds`) : "");

  function focusSelected() {
    listEl?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  function select(world: World | undefined, focus = true) {
    if (!world) return;
    if (world.name !== selectedName) play("tap");
    selectedName = world.name;
    confirming = false;
    if (focus) tick().then(focusSelected);
  }

  function move(delta: number) {
    if (!visible.length) return;
    const index = selected ? visible.indexOf(selected) : -1;
    select(visible[Math.max(0, Math.min(visible.length - 1, index + delta))]);
  }

  async function join(world: World | undefined = selected) {
    if (!world) return;
    if (notices(world).some((notice) => notice.blocks)) {
      play("error");
      status = `${world.displayName} cannot be opened. ${notices(world).find((notice) => notice.blocks)?.text}`;
      return;
    }
    play("confirm");
    status = `Opening ${world.displayName}`;
    try {
      await worlds.join(world.name);
    } catch {
      play("error");
      status = `${world.displayName} could not be opened`;
    }
  }

  // Warnings take a second, deliberate press: Enter on the list lands on "Play anyway" next to the sentences
  function enter() {
    if (!selected) return;
    if (warned && document.activeElement !== playButton) {
      play("tap");
      playButton?.focus();
      return;
    }
    join();
  }

  async function edit() {
    if (!selected) return;
    play("confirm");
    try {
      await request("POST", "/worlds/edit", { body: { name: selected.name } });
    } catch {
      play("error");
      status = `${selected.displayName} could not be edited`;
    }
    load();
  }

  function askDelete() {
    if (!selected) return;
    play("open");
    confirming = true;
  }

  function cancelDelete() {
    play("close");
    confirming = false;
    deleteButton?.focus();
  }

  async function confirmDelete() {
    const world = selected;
    if (!world) return;
    confirming = false;
    const index = visible.indexOf(world);
    try {
      await request("POST", "/worlds/delete", { body: { name: world.name } });
      play("confirm");
      status = `Deleted ${world.displayName}`;
      selectedName = (visible[index + 1] ?? visible[index - 1])?.name;
    } catch {
      play("error");
      status = `${world.displayName} could not be deleted`;
    }
    // Delete answers before the folder is gone
    await load();
    setTimeout(load, 1200);
    await tick();
    if (list?.length) focusSelected();
    else createButton?.focus();
  }

  async function create() {
    play("confirm");
    try {
      await screen.open("create_world");
    } catch {
      play("error");
      status = "The create world form could not be opened";
    }
  }

  async function leave() {
    play("close");
    try {
      await screen.open("title");
    } catch {
      play("error");
    }
  }

  function refresh() {
    play("tap");
    status = "Refreshed";
    load();
  }

  // Shortcuts work everywhere but in the search field, where letters type; Esc there clears the search first.
  // Plain Esc is not handled here: Minecraft's own screen closes on it and takes the page with it.
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented || confirming || event.altKey || event.metaKey) return;
    const inField = isTextField(event.target);
    if ((event.ctrlKey && event.key.toLowerCase() === "f") || (!inField && event.key === "/")) {
      event.preventDefault();
      searchBox?.querySelector("input")?.focus();
      return;
    }
    if (event.ctrlKey) return;
    if (event.key === "F5") {
      event.preventDefault();
      refresh();
      return;
    }
    if (inField) {
      if (event.key === "Escape" && query) {
        event.preventDefault();
        query = "";
        play("tap");
      } else if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        if (visible.length) select(visible[0]);
      }
      return;
    }
    const onButton = (event.target as HTMLElement).closest?.("button");
    switch (event.key.toLowerCase()) {
      case "arrowdown":
        event.preventDefault();
        move(1);
        break;
      case "arrowup":
        event.preventDefault();
        move(-1);
        break;
      case "home":
        event.preventDefault();
        select(visible[0]);
        break;
      case "end":
        event.preventDefault();
        select(visible[visible.length - 1]);
        break;
      case "enter":
        if (onButton && !onButton.closest('[role="listbox"]')) return;
        event.preventDefault();
        if (list?.length === 0) create();
        else enter();
        break;
      case "e":
        event.preventDefault();
        edit();
        break;
      case "delete":
      case "backspace":
        event.preventDefault();
        if (selected) {
          deleteButton?.focus();
          askDelete();
        }
        break;
      case "n":
        event.preventDefault();
        create();
        break;
    }
  }
</script>

<svelte:window onkeydown={windowKey} />

<div class="stage" role="presentation" {...typingFocus}>
  {#if ready}
    <div class="frame">
    <main class="glass window" in:rise aria-label="Singleplayer">
      <header class="head on-glass">
        <div class="titles">
          <h1 class="t-large">Singleplayer</h1>
          {#if list?.length}<span class="t-callout l2 num">{countLabel}</span>{/if}
        </div>
        {#if list?.length}
          <div class="search" bind:this={searchBox}>
            <SearchField bind:value={query} placeholder="Search worlds" shortcut="/" />
          </div>
          <button class="pill" aria-keyshortcuts="N" onclick={create}>
            Create world <Keycap>N</Keycap>
          </button>
        {/if}
      </header>

      {#if failed && !list}
        <div class="empty on-glass" in:fade={{ duration: 160 }}>
          <p class="t-headline">Worlds could not be read from the client.</p>
          <button class="pill primary" onclick={refresh}>Try again</button>
        </div>
      {:else if list && list.length === 0}
        <div class="empty on-glass" in:fade={{ duration: 160 }}>
          <span class="hero"><ItemIcon id="minecraft:grass_block" size={64} /></span>
          <h2 class="t-title2">No worlds yet</h2>
          <p class="t-callout l2">Worlds you create on this computer show up here.</p>
          <button class="pill primary" bind:this={createButton} aria-keyshortcuts="N Enter" onclick={create}>Create world</button>
        </div>
      {:else if list}
        <div class="body">
          {#if visible.length}
            <div
              class="list on-glass"
              role="listbox"
              aria-label="Worlds"
              bind:this={listEl}
            >
              {#each visible as world (world.name)}
                {@const isSelected = world.name === selected?.name}
                {@const flags = notices(world)}
                <button
                  class="card"
                  class:selected={isSelected}
                  role="option"
                  aria-selected={isSelected}
                  tabindex={isSelected ? 0 : -1}
                  aria-label="{world.displayName}, {modeLine(world)}, version {world.version}, last played {absoluteTime(world.lastPlayed)}{flags.length ? `, ${flags.length === 1 ? '1 notice' : `${flags.length} notices`}` : ''}"
                  onclick={() => select(world)}
                  ondblclick={() => join(world)}
                >
                  <WorldIcon icon={world.icon} />
                  <span class="card-text">
                    <span class="name t-headline">{world.displayName}</span>
                    {#if world.name !== world.displayName}<span class="folder t-footnote l3">{world.name}</span>{/if}
                    <span class="meta t-callout l2 num">
                      {#if world.hardcore}<span class="hardcore">Hardcore</span>{/if}
                      <span>{world.hardcore ? gameModeLabel(world) : modeLine(world)}</span>
                      <span class="dot" aria-hidden="true">·</span>
                      <span>{world.version || "Unknown version"}</span>
                    </span>
                  </span>
                  <span class="when t-footnote l2 num">
                    {relativeTime(world.lastPlayed, now)}
                    <span class="tip glass deep t-footnote" aria-hidden="true">{absoluteTime(world.lastPlayed)}</span>
                  </span>
                  {#if flags.length}
                    <span class="flag t-footnote" aria-hidden="true">{flags.some((f) => f.blocks) ? "Can't open" : "Check first"}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <p class="none t-callout l2 on-glass">No worlds match “{query.trim()}”</p>
          {/if}

          {#if selected}
            <aside class="details glass deep on-glass" aria-label="Selected world">
              {#key selected.name}
                <div class="details-in" in:fade={{ duration: 160 }}>
                  <div class="hero-row">
                    <WorldIcon icon={selected.icon} size={128} />
                    <div class="hero-text">
                      <h2 class="t-title2">{selected.displayName}</h2>
                      {#if selected.name !== selected.displayName}
                        <span class="t-callout l2">Folder {selected.name}</span>
                      {/if}
                    </div>
                  </div>

                  <dl class="group facts num">
                    <div><dt>Game mode</dt><dd>{gameModeLabel(selected)}{selected.hardcore ? ", hardcore" : ""}</dd></div>
                    <div><dt>Difficulty</dt><dd>{selected.hardcore ? "Hard, locked" : difficultyLabel(selected)}</dd></div>
                    <div><dt>Cheats</dt><dd>{selected.commandsAllowed ? "Allowed" : "Off"}</dd></div>
                    <div><dt>Version</dt><dd>{selected.version || "Unknown"}</dd></div>
                    <div><dt>Last played</dt><dd>{absoluteTime(selected.lastPlayed)}</dd></div>
                  </dl>

                  {#if selectedNotices.length}
                    <ul class="notices" id="world-notices">
                      {#each selectedNotices as notice (notice.text)}
                        <li class="t-callout" class:blocks={notice.blocks}>
                          <span class="kind">{notice.blocks ? "Can't open." : "Before playing:"}</span>
                          {notice.text}
                        </li>
                      {/each}
                    </ul>
                  {/if}

                  <div class="actions">
                    <button
                      class="play"
                      bind:this={playButton}
                      disabled={blocked}
                      aria-describedby={selectedNotices.length ? "world-notices" : undefined}
                      aria-keyshortcuts="Enter"
                      onclick={() => join()}
                    >
                      {blocked ? "Can't open" : warned ? "Play anyway" : "Play"}
                    </button>
                    <div class="row-actions">
                      <button class="pill" aria-keyshortcuts="E" onclick={edit}>Edit <Keycap>E</Keycap></button>
                      <div class="anchor">
                        <button
                          class="pill"
                          bind:this={deleteButton}
                          aria-haspopup="dialog"
                          aria-expanded={confirming}
                          aria-keyshortcuts="Delete"
                          onclick={askDelete}
                        >Delete <Keycap>Del</Keycap></button>
                        {#if confirming}
                          <ConfirmPopover
                            title="Delete “{selected.displayName}”?"
                            text="The folder {selected.name} and everything in it is removed from this computer. This cannot be undone."
                            action="Delete"
                            tone="destructive"
                            initialFocus="cancel"
                            placement="end"
                            width={320}
                            anchor={deleteButton}
                            onconfirm={confirmDelete}
                            oncancel={cancelDelete}
                          />
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/key}
            </aside>
          {/if}
        </div>
      {/if}

      <footer class="foot t-footnote l2 on-glass">
        <span class="keys">
          {#if list?.length}
            <span><Keycap>↑</Keycap><Keycap>↓</Keycap> Choose</span>
            <span><Keycap>Enter</Keycap> Play</span>
          {:else}
            <span><Keycap>N</Keycap> Create world</span>
          {/if}
          <span><Keycap>F5</Keycap> Refresh</span>
          <span><Keycap>Esc</Keycap> Close</span>
        </span>
        <span class="live" role="status" aria-live="polite">{status}</span>
      </footer>
    </main>

    <button class="glass closer" aria-label="Close" onclick={leave} in:rise={{ delay: 120 }}>×</button>
    </div>
  {/if}
</div>

<style>
  .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .frame { position: relative; width: min(1180px, calc(100% - 160px)); height: min(720px, calc(100% - 140px)); margin-bottom: 44px; }
  .window {
    position: absolute; inset: 0; border-radius: var(--r-window); overflow: hidden; display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: center; gap: 12px; height: 44px; margin: 24px 28px 0; flex: none; }
  .titles { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 14px; white-space: nowrap; }
  .search { width: 260px; }
  .search :global(input:focus-visible) { outline: none; }

  .pill {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 8px 0 16px;
    border-radius: 18px; background: var(--fill-2); font-size: 14px; font-weight: 500; white-space: nowrap;
    transition: transform var(--t-press) var(--ease), background-color var(--t-pop) var(--ease);
  }
  .pill:hover { background: var(--fill-3); }
  .pill:active { transform: scale(0.97); }
  .pill.primary { padding: 0 20px; color: #fff; background: var(--accent-fill); font-weight: 600; }
  .pill.primary:hover { background: var(--accent-strong); }

  .body { flex: 1; min-height: 0; display: flex; gap: 16px; padding: 20px 16px 0 28px; }
  .list {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; scrollbar-width: none;
    padding: 4px; margin: -4px; padding-bottom: 24px;
  }
  .card {
    position: relative; display: flex; align-items: center; gap: 16px; min-height: 88px; padding: 12px 20px 12px 12px;
    border-radius: var(--r-card); text-align: left; background: var(--fill); box-shadow: inset 0 0 0 0.5px var(--line);
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .card:hover { background: var(--fill-2); }
  .card:active { transform: scale(0.99); }
  .card.selected { background: var(--accent-tint); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .card-text { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .name, .folder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 6px; align-items: center; margin-top: 3px; white-space: nowrap; }
  .hardcore {
    padding: 0 7px; border-radius: 9px; font-size: 12px; line-height: 18px; font-weight: 600; color: var(--label);
    box-shadow: inset 0 0 0 1px var(--label-3);
  }
  .dot { color: var(--label-3); }
  .when { position: relative; flex: none; align-self: flex-start; margin-top: 4px; }
  .tip {
    position: absolute; right: -8px; top: calc(100% + 8px); padding: 6px 10px; border-radius: var(--r-control);
    white-space: nowrap; color: var(--label); opacity: 0; pointer-events: none; z-index: 3;
    transition: opacity var(--t-pop) var(--ease);
  }
  .card:hover .tip, .card:focus-visible .tip { opacity: 1; transition-delay: 400ms; }
  .flag {
    position: absolute; right: 20px; bottom: 14px; padding: 0 8px; border-radius: 9px; line-height: 18px;
    font-weight: 600; background: var(--fill-3);
  }
  .none { flex: 1; padding: 12px 0; }

  .details {
    flex: none; width: 400px; margin-bottom: 16px; border-radius: var(--r-pane); overflow: hidden; display: flex;
  }
  .details-in { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 20px; gap: 16px; overflow-y: auto; scrollbar-width: none; }
  .hero-row { display: flex; align-items: center; gap: 16px; }
  .hero-text { min-width: 0; display: grid; gap: 2px; }
  .hero-text h2, .hero-text span { overflow-wrap: anywhere; }
  .facts { padding: 0 14px; }
  .facts div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; }
  .facts div + div { box-shadow: 0 -0.5px 0 var(--line); }
  dt { color: var(--label-2); }
  dd { text-align: right; }
  .notices { list-style: none; display: grid; gap: 8px; }
  .notices li { padding: 10px 12px; border-radius: var(--r-control); background: var(--fill); box-shadow: inset 3px 0 0 var(--label-3); }
  .notices li.blocks { box-shadow: inset 3px 0 0 var(--negative); }
  .kind { font-weight: 600; }
  .actions { margin-top: auto; display: grid; gap: 10px; }
  .play {
    height: 44px; border-radius: 22px; font-size: 15px; font-weight: 600; color: #fff; background: var(--accent-fill);
    transition: transform var(--t-press) var(--ease), background-color var(--t-pop) var(--ease);
  }
  .play:hover:not(:disabled) { background: var(--accent-strong); }
  .play:active:not(:disabled) { transform: scale(0.98); }
  .play:disabled { background: var(--fill-2); color: var(--label-2); }
  .row-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .row-actions .pill { width: 100%; padding: 0 8px 0 16px; justify-content: space-between; }
  .anchor { position: relative; }

  .empty { flex: 1; display: grid; place-content: center; justify-items: center; gap: 8px; text-align: center; }
  .empty .hero { margin-bottom: 8px; }
  .empty .pill { margin-top: 12px; }

  .foot {
    flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 48px; padding: 0 28px;
    box-shadow: 0 -0.5px 0 var(--line);
  }
  .keys { display: flex; gap: 18px; }
  .keys span { display: inline-flex; align-items: center; gap: 4px; }
  .live { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .closer {
    position: absolute; left: 50%; top: calc(100% + 14px); translate: -50% 0;
    width: 30px; height: 30px; border-radius: 15px; display: grid; place-items: center; font-size: 17px;
    line-height: 1; padding-bottom: 2px;
  }
  .closer:active { transform: scale(0.92); }
</style>
