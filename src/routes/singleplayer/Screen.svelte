<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { request } from "../../lib/api/client";
  import { screen, worlds } from "../../lib/api/routes";
  import type { World } from "../../lib/api/types";
  import { keepEscape } from "../../lib/escape.svelte";
  import { rise } from "../../lib/motion";
  import { absoluteTime, relativeTime } from "../../lib/format";
  import { play } from "../../lib/sound";
  import { isTextField, typingFocus } from "../../lib/typing";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import SearchField from "../../lib/ui/SearchField.svelte";
  import { difficultyLabel, gameModeLabel, modeLine, notices } from "./format";
  import WorldIcon from "./WorldIcon.svelte";

  const PAGE = 8;

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
  keepEscape(() => !!query && !!searchBox?.contains(document.activeElement));
  let playButton = $state<HTMLButtonElement | undefined>();
  // Create world (empty) or Try again (failed): takes focus when there is no row to hold it
  let stateButton = $state<HTMLButtonElement | undefined>();
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
      focusList();
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

  function focusList() {
    if (list?.length) focusSelected();
    else stateButton?.focus();
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
    focusList();
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

  async function refresh() {
    play("tap");
    status = "Refreshed";
    await load();
    await tick();
    // Try again leaves with the error state; its focus moves to the list
    if (document.activeElement === document.body) focusList();
  }

  // Shortcuts work everywhere but in the search field, where letters type; Esc there clears the search first and keeps
  // the key while it has text. Otherwise Esc closes the screen.
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
      case "pagedown":
        event.preventDefault();
        move(PAGE);
        break;
      case "pageup":
        event.preventDefault();
        move(-PAGE);
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
          {#if list?.length}<span class="t-callout l2 num">{countLabel}</span>{:else if !list && !failed}<span class="t-callout l2">Loading</span>{/if}
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
          <button class="pill primary" bind:this={stateButton} onclick={refresh}>Try again</button>
        </div>
      {:else if list && list.length === 0}
        <div class="empty on-glass" in:fade={{ duration: 160 }}>
          <h2 class="t-title2">No worlds yet</h2>
          <p class="t-callout l2">Worlds you create on this computer show up here.</p>
          <button class="pill primary" bind:this={stateButton} aria-keyshortcuts="N Enter" onclick={create}>Create world</button>
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
                  <WorldIcon icon={world.icon} size={32} />
                  <span class="card-text">
                    <span class="name t-headline">{world.displayName}</span>
                    <span class="meta t-callout l2 num">
                      {#if world.hardcore}<span class="hardcore">Hardcore</span>{/if}
                      <span>{world.hardcore ? gameModeLabel(world) : modeLine(world)}</span>
                      <span class="dot" aria-hidden="true">·</span>
                      <span>{world.version || "Unknown version"}</span>
                    </span>
                  </span>
                  <span class="side">
                    <span class="t-footnote l2 num">{relativeTime(world.lastPlayed, now)}</span>
                    {#if flags.length}
                      <span class="flag t-footnote" aria-hidden="true">{flags.some((f) => f.blocks) ? "Can't open" : "Check first"}</span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {:else}
            <p class="none t-callout l2 on-glass">No worlds match “{query.trim()}”</p>
          {/if}

          {#if selected}
            <aside class="details glass deep on-glass" aria-label="Selected world">
              {#key selected.name}
                <div class="details-in">
                  <div class="details-scroll">
                    <div class="hero-row">
                      <WorldIcon icon={selected.icon} size={64} />
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
                  </div>

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
                      <button
                        class="pill"
                        bind:this={deleteButton}
                        aria-haspopup="dialog"
                        aria-expanded={confirming}
                        aria-keyshortcuts="Delete"
                        onclick={askDelete}
                      >Delete <Keycap>Del</Keycap></button>
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
          {:else if list}
            <span><Keycap>N</Keycap> Create world</span>
          {/if}
          <span><Keycap>F5</Keycap> Refresh</span>
          <span><Keycap>Esc</Keycap> Close</span>
        </span>
        <span class="live" role="status" aria-live="polite">{status}</span>
      </footer>

      {#if confirming && selected}
        <ConfirmPopover
          title="Delete “{selected.displayName}”?"
          text="The folder {selected.name} and everything in it is removed from this computer. This cannot be undone."
          action="Delete"
          tone="destructive"
          initialFocus="cancel"
          placement="modal"
          width={320}
          onconfirm={confirmDelete}
          oncancel={cancelDelete}
        />
      {/if}
    </main>

    <button class="glass closer" aria-label="Close" onclick={leave} in:rise={{ delay: 120 }}>×</button>
    </div>
  {/if}
</div>

<style>
  /* cqh, not vh: the canvas is zoomed, and vh stays in window pixels */
  .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; container-type: size; }
  .frame { position: relative; width: min(940px, calc(100% - 160px)); margin-bottom: 40px; }
  .window {
    position: relative; max-height: min(600px, calc(100cqh - 140px)); border-radius: var(--r-window); overflow: hidden;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: center; gap: 8px; height: 32px; margin: 14px 16px 0; flex: none; }
  .titles { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; white-space: nowrap; }
  .search { width: 220px; }
  .search :global(input:focus-visible) { outline: none; }

  .pill {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 8px 0 12px;
    border-radius: 14px; background: var(--fill-2); font-size: 13px; font-weight: 500; white-space: nowrap;
    transition: transform var(--t-press) var(--ease), background-color var(--t-hover) ease;
  }
  .pill:hover { background: var(--fill-3); }
  .pill:active { transform: scale(0.97); }
  .pill.primary { padding: 0 14px; color: #fff; background: var(--accent-fill); font-weight: 600; }
  .pill.primary:hover { background: var(--accent-strong); }

  .body { flex: 0 1 auto; min-height: 0; display: flex; gap: 12px; padding: 12px 12px 0 16px; }
  .list {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; scrollbar-width: none;
    padding: 4px 4px 16px; margin: -4px -4px 0;
  }
  .card {
    position: relative; flex: none; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px 0 4px;
    border-radius: var(--r-group); text-align: left;
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease);
  }
  .card:hover { background: var(--fill); }
  .card:active { transform: scale(0.99); }
  .card.selected { background: var(--accent-tint); box-shadow: inset 0 0 0 1px var(--accent); }
  .card-text { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 13px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 6px; align-items: center; font-size: 12px; line-height: 16px; white-space: nowrap; }
  .hardcore {
    padding: 0 6px; border-radius: 8px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--label);
    box-shadow: inset 0 0 0 1px var(--label-3);
  }
  .dot { color: var(--label-3); }
  .side { flex: none; display: grid; justify-items: end; }
  .flag { padding: 0 6px; border-radius: 8px; line-height: 16px; font-weight: 600; background: var(--fill-3); }
  .none { flex: 1; padding: 8px 4px; }

  .details {
    flex: none; width: 300px; margin-bottom: 12px; border-radius: var(--r-pane); overflow: hidden; display: flex;
  }
  /* Play, Edit and Delete stay in view; the facts and notices above them scroll, fading out while more is below */
  .details-in { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .details-scroll {
    flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px 12px 8px; overflow-y: auto;
    scrollbar-width: none; mask-image: linear-gradient(180deg, #000 calc(100% - var(--sp-more)), transparent);
    animation: sp-more linear both; animation-timeline: scroll(self);
  }
  @property --sp-more { syntax: "<length>"; inherits: false; initial-value: 0px; }
  @keyframes sp-more {
    from, 90% { --sp-more: 24px; }
    to { --sp-more: 0px; }
  }
  .hero-row { display: flex; align-items: center; gap: 12px; }
  .hero-text { min-width: 0; display: grid; gap: 2px; }
  .hero-text h2, .hero-text span { overflow-wrap: anywhere; }
  .facts { padding: 0 12px; font-size: 13px; }
  .facts div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; }
  .facts div + div { box-shadow: 0 -0.5px 0 var(--line); }
  dt { color: var(--label-2); white-space: nowrap; }
  dd { text-align: right; }
  .notices { list-style: none; display: grid; gap: 6px; }
  .notices li { padding: 8px 10px; border-radius: var(--r-control); background: var(--fill); box-shadow: inset 3px 0 0 var(--label-3); }
  .notices li.blocks { box-shadow: inset 3px 0 0 var(--negative); }
  .kind { font-weight: 600; }
  .actions { flex: none; display: grid; gap: 8px; padding: 4px 12px 12px; }
  .play {
    height: 30px; border-radius: 15px; font-size: 13px; font-weight: 600; color: #fff; background: var(--accent-fill);
    transition: transform var(--t-press) var(--ease), background-color var(--t-hover) ease;
  }
  .play:hover:not(:disabled) { background: var(--accent-strong); }
  .play:active:not(:disabled) { transform: scale(0.98); }
  .play:disabled { background: var(--fill-2); color: var(--label-2); }
  .row-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .row-actions .pill { width: 100%; justify-content: space-between; }

  .empty { flex: none; display: grid; place-content: center; justify-items: center; gap: 6px; padding: 40px 16px 32px; text-align: center; }
  .empty .pill { margin-top: 8px; }

  .foot {
    flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 36px; padding: 0 16px;
    box-shadow: 0 -0.5px 0 var(--line);
  }
  .keys { display: flex; gap: 14px; }
  .keys span { display: inline-flex; align-items: center; gap: 4px; }
  .live { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .closer {
    position: absolute; left: 50%; top: calc(100% + 12px); translate: -50% 0;
    width: 30px; height: 30px; border-radius: 15px; display: grid; place-items: center; font-size: 17px;
    line-height: 1; padding-bottom: 2px;
  }
  .closer:active { transform: scale(0.92); }
</style>
