<script lang="ts">
  import "../../lib/ui/values.css";
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { request } from "../../lib/api/client";
  import { onReconnect } from "../../lib/api/events";
  import { client, screen, servers } from "../../lib/api/routes";
  import type { ClientInfo, LanServer, Protocol, Server, ServerAddRequest, ServerData } from "../../lib/api/types";
  import { plainText } from "../../lib/mctext";
  import { flipDuration, rise } from "../../lib/motion";
  import { livePings } from "../../lib/pings.svelte";
  import { play } from "../../lib/sound";
  import { typingFocus } from "../../lib/typing";
  import { keepIcons } from "../../lib/ui/Base64Icon.svelte";
  import SearchField from "../../lib/ui/SearchField.svelte";
  import SessionPills from "../../lib/ui/SessionPills.svelte";
  import Details from "./Details.svelte";
  import { addressProblem } from "./servers";
  import ServerRow from "./ServerRow.svelte";
  import ServerSheet from "./ServerSheet.svelte";

  type Entry = { id: number; key: string; lan: boolean; data: ServerData };

  const LAN_POLL_MS = 3000;
  const JOIN_RESET_MS = 10_000;
  const PAGE = 8;

  let saved = $state<Server[]>([]);
  let lanServers = $state<LanServer[]>([]);
  // Latest ping per address; the list GET returns everything as Pinging again, so pings outlive reloads
  const pings = livePings();
  let loaded = $state(false);
  let failed = $state(false);
  let info = $state<ClientInfo | undefined>();
  let protocol = $state<Protocol | undefined>();
  let query = $state("");
  let selectedId = $state<number | undefined>();
  let sheet = $state<{ editing?: Server } | undefined>();
  let confirming = $state(false);
  let joiningId = $state<number | undefined>();
  let joinError = $state<string | undefined>();
  let direct = $state("");
  let directError = $state<string | undefined>();
  let announcement = $state("");
  let ready = $state(false);
  let list = $state<HTMLDivElement>();
  let searchBox = $state<HTMLDivElement>();
  let directInput = $state<HTMLInputElement>();
  let stateButton = $state<HTMLButtonElement>();
  let joinTimer: number | undefined;

  // Names can hold § codes (servers.dat is edited by hand or by tools); the list shows them as plain text, the edit
  // sheet keeps the raw name
  function merge(server: ServerData): ServerData {
    const name = plainText(server.name);
    const ping = pings.current[server.address];
    if (!ping) return { ...server, name };
    // Two saved entries can share an address; the ping describes the address, the entry keeps its own name
    return { ...ping, name, address: server.address, resourcePackPolicy: server.resourcePackPolicy, icon: ping.icon ?? server.icon };
  }

  /** Keys stay with an entry across reorders and removals, where ids (list indices) shift. */
  function keyed(items: (ServerData & { id: number })[], lan: boolean): Entry[] {
    const seen = new Map<string, number>();
    return items.map((server) => {
      const base = `${lan ? "lan" : "saved"}|${server.address}|${server.name}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return { id: server.id, key: `${base}|${count}`, lan, data: merge(server) };
    });
  }

  const savedEntries = $derived(keyed(saved, false));
  const lanEntries = $derived(keyed(lanServers, true));
  const searching = $derived(query.trim() !== "");
  const matches = (entry: Entry) => {
    const needle = query.trim().toLowerCase();
    return entry.data.name.toLowerCase().includes(needle) || entry.data.address.toLowerCase().includes(needle);
  };
  const shownSaved = $derived(searching ? savedEntries.filter(matches) : savedEntries);
  const shownLan = $derived(searching ? lanEntries.filter(matches) : lanEntries);
  const shown = $derived([...shownSaved, ...shownLan]);
  const current = $derived(shown.find((entry) => entry.id === selectedId) ?? shown[0]);
  const onlineCount = $derived(savedEntries.filter((entry) => entry.data.status === "SUCCESSFUL").length);

  const subtitle = $derived.by(() => {
    const total = saved.length;
    const servers = `${total} ${total === 1 ? "server" : "servers"}`;
    if (searching) return `${shown.length} of ${total + lanServers.length} match`;
    const lanText = lanServers.length ? ` · ${lanServers.length} on your network` : "";
    return `${servers} · ${onlineCount} online${lanText}`;
  });

  async function load() {
    try {
      saved = await servers.list();
      failed = false;
      keepIcons([...saved, ...lanServers, ...Object.values(pings.current)].map((server) => server.icon));
    } catch {
      failed = true;
      play("error");
    } finally {
      loaded = true;
    }
  }

  async function loadLan() {
    try {
      lanServers = await request<LanServer[]>("GET", "/servers/lan");
    } catch {
      lanServers = [];
    }
  }

  onMount(() => {
    ready = true;
    play("open");
    load().then(async () => {
      selectedId = saved[0]?.id;
      await tick();
      // The list can arrive after the player already moved focus, e.g. into the search field
      if (document.activeElement === document.body) focusRow(selectedId);
    });
    loadLan();
    client
      .info()
      .then((value) => {
        info = value;
        if (value.viaFabricPlus) request<Protocol>("GET", "/protocols/protocol").then((p) => (protocol = p)).catch(() => {});
      })
      .catch(() => {});
    const poll = window.setInterval(loadLan, LAN_POLL_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(joinTimer);
    };
  });

  // Pings sent while the event socket was down are lost; loading the list pings every server again
  $effect(() => onReconnect(load));

  function say(text: string) {
    announcement = "";
    tick().then(() => (announcement = text));
  }

  // Without rows (empty list, load failed) the state's own button takes focus, so it never falls back to the page
  function focusRow(id: number | undefined) {
    const element = id === undefined ? undefined : list?.querySelector<HTMLElement>(`[data-server="${id}"]`);
    if (!element) return stateButton?.focus();
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
  }

  async function retry() {
    await load();
    selectedId ??= saved[0]?.id;
    await tick();
    focusRow(selectedId);
  }

  function select(id: number, focus = false) {
    if (id !== selectedId) {
      play("tap");
      joinError = undefined;
      confirming = false;
    }
    selectedId = id;
    if (focus) focusRow(id);
  }

  async function refresh() {
    play("tap");
    pings.clear();
    say("Refreshing the server list");
    await Promise.all([load(), loadLan()]);
  }

  async function join(entry: Entry | undefined = current) {
    if (!entry || joiningId !== undefined) return;
    select(entry.id);
    joiningId = entry.id;
    joinError = undefined;
    play("confirm");
    say(`Connecting to ${entry.data.name}`);
    try {
      await servers.join(entry.data.address);
      // The client changes screens on its own; if it never does, the button comes back
      joinTimer = window.setTimeout(() => (joiningId = undefined), JOIN_RESET_MS);
    } catch {
      play("error");
      joiningId = undefined;
      joinError = `Could not connect to ${entry.data.name}.`;
    }
  }

  async function joinDirect() {
    directError = addressProblem(direct);
    if (directError) {
      play("error");
      directInput?.focus();
      return;
    }
    play("confirm");
    say(`Connecting to ${direct.trim()}`);
    try {
      await servers.join(direct.trim());
    } catch {
      play("error");
      directError = "The client could not start the connection.";
    }
  }

  function openSheet(editing?: Server) {
    play("open");
    confirming = false;
    sheet = { editing };
  }

  function closeSheet() {
    play("close");
    const returnTo = sheet?.editing?.id ?? selectedId;
    sheet = undefined;
    tick().then(() => focusRow(returnTo));
  }

  async function saveServer(form: ServerAddRequest) {
    const editing = sheet?.editing;
    if (editing) await request("PUT", "/servers/edit", { body: { id: editing.id, ...form } });
    else await request("PUT", "/servers/add", { body: form });
    await load();
    play("confirm");
    sheet = undefined;
    selectedId = editing ? editing.id : saved.at(-1)?.id;
    if (!editing) query = "";
    say(editing ? `Saved ${form.name}` : `Added ${form.name}`);
    await tick();
    focusRow(selectedId);
  }

  async function remove() {
    const entry = current;
    if (!entry || entry.lan) return;
    confirming = false;
    try {
      await request("DELETE", "/servers/remove", { body: { id: entry.id } });
      play("confirm");
      say(`Removed ${entry.data.name}`);
    } catch {
      play("error");
      say(`${entry.data.name} could not be removed`);
    }
    await load();
    selectedId = saved.length ? Math.min(entry.id, saved.length - 1) : undefined;
    await tick();
    focusRow(selectedId);
  }

  async function move(step: -1 | 1) {
    const entry = current;
    if (!entry || entry.lan) return;
    if (searching) {
      play("error");
      say("Clear the search to reorder servers");
      return;
    }
    const from = entry.id;
    const to = from + step;
    if (to < 0 || to >= saved.length) return;
    // Swap locally first so the row moves with the key press; the list is reloaded only if the client refuses
    const next = [...saved];
    [next[from], next[to]] = [next[to], next[from]];
    saved = next.map((server, index) => ({ ...server, id: index }));
    selectedId = to;
    play("tap");
    say(`${entry.data.name} moved to position ${to + 1} of ${saved.length}`);
    await tick();
    focusRow(to);
    try {
      await request("POST", "/servers/swap", { body: { from, to } });
    } catch {
      play("error");
      say(`${entry.data.name} could not be moved`);
      await load();
    }
  }

  function askRemove() {
    if (!current || current.lan) return;
    play("open");
    confirming = true;
  }

  function cancelRemove() {
    play("close");
    confirming = false;
    tick().then(() => focusRow(current?.id));
  }

  async function openProtocol() {
    play("tap");
    try {
      await screen.open("viafabricplus_protocol_selection");
    } catch {
      play("error");
      say("The protocol list could not be opened");
    }
  }

  async function close() {
    play("close");
    try {
      await screen.close();
    } catch {
      play("error");
    }
  }

  function focusSearch() {
    const input = searchBox?.querySelector("input");
    input?.focus();
    input?.select();
  }

  function rowKey(event: KeyboardEvent, index: number) {
    const entry = shown[index];
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + PAGE,
      PageUp: index - PAGE,
      Home: 0,
      End: shown.length - 1,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      if (target < 0 && event.key === "ArrowUp") return focusSearch();
      select(shown[Math.max(0, Math.min(shown.length - 1, target))].id, true);
      return;
    }
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        join(entry);
        break;
      case "Delete":
        event.preventDefault();
        askRemove();
        break;
      case "e":
      case "F2":
        if (entry.lan) return;
        event.preventDefault();
        openSheet(saved[entry.id]);
        break;
    }
  }

  function searchKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || (event.key === "Enter" && shown.length)) {
      event.preventDefault();
      if (shown.length) select(current?.id ?? shown[0].id, true);
    }
  }

  // Single-letter shortcuts work outside text fields. Esc closes the screen in the client itself, whatever the page
  // does with it; a close from here as well would also close the screen the client went back to.
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented || sheet || confirming || document.querySelector(":popover-open")) return;
    const target = event.target as HTMLElement;
    const inField = target.matches?.("input, textarea, [contenteditable]");
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "f")) {
      event.preventDefault();
      focusSearch();
      return;
    }
    if (event.key === "Escape") return;
    if (inField || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      openSheet();
    } else if (key === "r") {
      event.preventDefault();
      refresh();
    } else if (key === "p" && info?.viaFabricPlus) {
      event.preventDefault();
      openProtocol();
    } else if (key === "/") {
      event.preventDefault();
      focusSearch();
    }
  }

  const moveHint = $derived(searching ? "Clear the search to reorder" : undefined);
</script>

<svelte:window onkeydown={windowKey} />

<div class="stage" role="presentation" {...typingFocus}>
  {#if ready}
    <div class="frame">
      <main class="glass window" class:solo={!current && !searching} in:rise aria-label="Multiplayer" inert={!!sheet}>
        <header class="head on-glass">
          <div class="titles">
            <h1 class="t-large">Multiplayer</h1>
            {#if !loaded}<span class="t-callout l2">Loading</span>{:else if !failed}<span class="t-callout l2 num">{subtitle}</span>{/if}
          </div>
          <div class="tools">
            <button class="cg-pill" onclick={refresh} aria-keyshortcuts="R">Refresh</button>
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys and Enter from the field inside) -->
            <div class="search" bind:this={searchBox} onkeydown={searchKey} role="search">
              <SearchField bind:value={query} placeholder="Search servers" shortcut="Ctrl K" />
            </div>
            <button class="cg-pill add" onclick={() => openSheet()} aria-keyshortcuts="N">Add server</button>
          </div>
        </header>

        <div class="list-wrap" bind:this={list}>
          {#if failed}
            <div class="empty">
              <p class="t-callout l2">Servers could not be loaded from the client.</p>
              <button class="cg-pill" bind:this={stateButton} onclick={retry}>Try again</button>
            </div>
          {:else if loaded && saved.length === 0 && lanServers.length === 0}
            <div class="empty">
              <p class="t-headline">No servers yet</p>
              <p class="t-callout l2">Add a server by its address, or join one once with Direct connect below.</p>
              <button class="cg-pill" bind:this={stateButton} onclick={() => openSheet()}>Add server</button>
            </div>
          {:else}
            <div class="list on-glass" role="listbox" aria-label="Server list, {shown.length} {shown.length === 1 ? 'entry' : 'entries'}">
              {#each shownSaved as entry, index (entry.key)}
                <div class="cell" animate:flip={{ duration: flipDuration(320), easing: cubicOut }}>
                  <ServerRow
                    server={entry.data}
                    id={entry.id}
                    selected={entry.id === current?.id}
                    focusable={entry.id === current?.id}
                    onselect={() => select(entry.id)}
                    onjoin={() => join(entry)}
                    onkeydown={(event) => rowKey(event, index)}
                  />
                </div>
              {/each}
              {#if shownLan.length}
                <div class="section" role="group" aria-labelledby="lan-title">
                  <h2 id="lan-title" class="t-headline lan-title">Local network</h2>
                  {#each shownLan as entry, index (entry.key)}
                    <ServerRow
                      server={entry.data}
                      id={entry.id}
                      selected={entry.id === current?.id}
                      focusable={entry.id === current?.id}
                      onselect={() => select(entry.id)}
                      onjoin={() => join(entry)}
                      onkeydown={(event) => rowKey(event, shownSaved.length + index)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
            {#if searching && shown.length === 0}
              <p class="empty t-callout l2">No servers match “{query.trim()}”</p>
            {/if}
          {/if}
        </div>

        <footer class="foot on-glass">
          <div class="direct">
            <label class="direct-field" class:invalid={directError}>
              <span class="t-callout l2">Direct connect</span>
              <input
                bind:this={directInput}
                bind:value={direct}
                class="num"
                placeholder="Server address"
                spellcheck="false"
                autocomplete="off"
                aria-invalid={directError ? "true" : undefined}
                aria-describedby={directError ? "direct-error" : undefined}
                oninput={() => (directError = undefined)}
                onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), joinDirect())}
              />
            </label>
            <button class="cg-pill" onclick={joinDirect} disabled={!direct.trim()}>Connect</button>
            {#if directError}<span id="direct-error" class="t-footnote problem" role="alert">{directError}</span>{/if}
          </div>
          {#if info?.viaFabricPlus}
            <button
              class="cg-pill protocol"
              onclick={openProtocol}
              aria-keyshortcuts="P"
              aria-label="Protocol: {protocol ? `${protocol.name} (${protocol.version})` : 'unknown'}. Change"
            >
              <span class="l2">Protocol</span><span class="num">{protocol?.name ?? ""}</span><span class="chev" aria-hidden="true">›</span>
            </button>
          {/if}
        </footer>
      </main>

      {#if current}
        <aside class="glass deep pane" aria-label="{current.data.name} details" inert={!!sheet}>
          {#key current.key}
            <div class="pane-inner" in:fade={{ duration: 140 }}>
              <Details
                server={current.data}
                lan={current.lan}
                joining={joiningId === current.id}
                {joinError}
                {confirming}
                canMoveUp={!current.lan && !searching && current.id > 0}
                canMoveDown={!current.lan && !searching && current.id < saved.length - 1}
                {moveHint}
                onjoin={() => join(current)}
                onedit={() => current && openSheet(saved[current.id])}
                onaskremove={askRemove}
                onremove={remove}
                oncancelremove={cancelRemove}
                onmove={move}
              />
            </div>
          {/key}
        </aside>
      {/if}

      {#if sheet}
        <ServerSheet
          editing={sheet.editing && plainText(sheet.editing.name)}
          initial={sheet.editing
            ? { name: sheet.editing.name, address: sheet.editing.address, resourcePackPolicy: sheet.editing.resourcePackPolicy }
            : { name: "", address: "", resourcePackPolicy: "Prompt" }}
          save={saveServer}
          oncancel={closeSheet}
        />
      {/if}

      <div class="session" in:rise={{ delay: 120 }} inert={!!sheet} role="group" aria-label="Account and proxy">
        <SessionPills />
      </div>

      <div class="bottom" in:rise={{ delay: 120 }} inert={!!sheet}>
        <button class="glass closer" aria-label="Close" aria-keyshortcuts="Escape" onclick={close}>×</button>
      </div>
    </div>
  {/if}
  <div class="sr-only" role="status" aria-live="polite">{announcement}</div>
</div>

<style>
  .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  /* Below 1120 px of canvas (scale 1.5) the side margins give way first, so the header keeps room for its count */
  .frame {
    position: relative;
    width: min(1120px, max(calc(100% - 160px), min(980px, calc(100% - 80px))));
    height: min(620px, calc(100% - 124px));
    margin-bottom: 40px;
  }
  .window { position: absolute; inset: 0; border-radius: var(--r-window); overflow: hidden; }
  .head { position: absolute; left: 16px; right: 348px; top: 14px; height: 32px; display: flex; align-items: center; gap: 12px; }
  .titles { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
  .titles span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h1 { white-space: nowrap; }
  /* When the header is short of room the search field narrows before the count is cut */
  .tools { display: flex; align-items: center; gap: 8px; flex: 0 100 auto; min-width: 0; }
  .search { flex: 0 1 200px; min-width: 140px; }
  .search :global(input:focus-visible) { outline: none; }
  .add { color: #fff; background: var(--fill-3); }
  /* Without a server there is no details pane; header, list and footer take its room */
  .solo .head, .solo .foot { right: 16px; }
  .solo .list-wrap { right: 8px; }

  .list-wrap {
    position: absolute;
    left: 8px;
    right: 340px;
    top: 54px;
    bottom: 52px;
    padding: 4px 8px 28px;
    overflow-y: auto;
    scrollbar-width: none;
    /* Rows scrolled to by keys stop clear of the fades */
    scroll-padding: 6px 0 28px;
    mask-image: linear-gradient(180deg, transparent 0, #000 6px, #000 calc(100% - 28px), transparent);
  }
  .list { display: grid; gap: 2px; }
  .section { display: grid; gap: 2px; margin-top: 12px; }
  .lan-title { padding: 0 8px 2px; }
  .empty { display: grid; gap: 8px; justify-items: start; padding: 16px 8px; }

  .foot {
    position: absolute;
    left: 16px;
    right: 348px;
    bottom: 18px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .direct { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .direct-field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 12px;
    border-radius: 18px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    width: 300px;
    min-width: 0;
  }
  .direct-field span { white-space: nowrap; }
  .direct-field input { flex: 1; min-width: 0; height: 100%; font-size: 13px; }
  .direct-field input::placeholder { color: var(--label-3); }
  .direct-field input:focus-visible { outline: none; }
  .direct-field:focus-within { box-shadow: inset 0 0 0 0.5px var(--line), 0 0 0 2px var(--accent); }
  .direct-field.invalid { box-shadow: inset 0 0 0 1px #ff9a96; }
  .direct .cg-pill { height: 28px; padding: 0 12px; }
  .cg-pill:disabled { opacity: 0.45; }
  .problem { position: absolute; left: 12px; top: calc(100% + 1px); color: #ffb4b0; white-space: nowrap; }
  .protocol { height: 28px; gap: 6px; padding: 0 10px 0 12px; flex: none; }
  .chev { color: var(--label-2); font-size: 17px; margin-top: -2px; }
  .head .cg-pill { height: 28px; padding: 0 12px; }

  .pane { position: absolute; top: 12px; bottom: 12px; right: 12px; width: 320px; border-radius: var(--r-pane); overflow: hidden; }
  .pane-inner { position: absolute; inset: 0; }

  .bottom { position: absolute; top: calc(100% + 12px); left: 50%; translate: -50% 0; }
  .session { position: absolute; top: calc(100% + 12px); left: 0; display: flex; gap: 8px; }
  .closer { width: 30px; height: 30px; border-radius: 15px; display: grid; place-items: center; font-size: 17px; line-height: 1; padding-bottom: 2px; }
  .closer:active { transform: scale(0.92); }
</style>
