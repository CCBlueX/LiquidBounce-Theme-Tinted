<script lang="ts">
  import "../../lib/ui/values.css";
  import { onMount, tick } from "svelte";
  import { request } from "../../lib/api/client";
  import { client, screen } from "../../lib/api/routes";
  import type { Protocol } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import { typingFocus } from "../../lib/typing";
  import SearchField from "../../lib/ui/SearchField.svelte";

  const PAGE = 8;

  // undefined while /info loads; false shows the unavailable state
  let available = $state<boolean | undefined>();
  let protocols = $state<Protocol[]>([]);
  let current = $state<Protocol | undefined>();
  let failed = $state(false);
  let query = $state("");
  let focusVersion = $state<number | undefined>();
  let pending = $state<number | undefined>();
  let problem = $state<string | undefined>();
  let announcement = $state("");
  let list = $state<HTMLDivElement>();
  let searchBox = $state<HTMLDivElement>();
  let closeButton = $state<HTMLButtonElement>();

  // The client's own version is the newest entry; DELETE returns to it
  const native = $derived(protocols.reduce<Protocol | undefined>((best, p) => (!best || p.version > best.version ? p : best), undefined));
  const isNative = $derived(!!current && !!native && current.version === native.version);
  // Versions that start with the typed text come first, so "1.8" puts 1.8.x above 1.21.7-1.21.8
  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return protocols;
    const score = (p: Protocol) => {
      const name = p.name.toLowerCase();
      if (name.startsWith(needle) || String(p.version).startsWith(needle)) return 2;
      return name.includes(needle) ? 1 : 0;
    };
    return protocols
      .map((p) => ({ p, rank: score(p) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((entry) => entry.p);
  });
  const focusTarget = $derived(
    visible.find((p) => p.version === focusVersion)?.version ?? visible.find((p) => p.version === current?.version)?.version ?? visible[0]?.version,
  );

  async function load() {
    try {
      const [list, active] = await Promise.all([
        request<Protocol[]>("GET", "/protocols"),
        request<Protocol>("GET", "/protocols/protocol"),
      ]);
      protocols = list;
      current = active;
      failed = false;
    } catch {
      failed = true;
      play("error");
    }
  }

  onMount(() => {
    play("open");
    client
      .info()
      .then(async (info) => {
        available = info.viaFabricPlus;
        if (!available) {
          await tick();
          closeButton?.focus();
          return;
        }
        await load();
        await tick();
        if (document.activeElement === document.body) focusRow(current?.version, "center");
      })
      .catch(() => {
        available = undefined;
        failed = true;
      });
  });

  function say(text: string) {
    announcement = "";
    tick().then(() => (announcement = text));
  }

  function focusRow(version: number | undefined, block: ScrollLogicalPosition = "nearest") {
    if (version === undefined) return;
    focusVersion = version;
    const row = list?.querySelector<HTMLElement>(`[data-version="${version}"]`);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block });
  }

  async function choose(protocol: Protocol) {
    if (pending !== undefined || protocol.version === current?.version) return;
    pending = protocol.version;
    problem = undefined;
    try {
      await request("PUT", "/protocols/protocol", { body: { version: protocol.version } });
      // The PUT answers before anything is known; the active protocol is read back to confirm it
      current = await request<Protocol>("GET", "/protocols/protocol");
      if (current?.version !== protocol.version) throw new Error("not applied");
      play("confirm");
      say(`Servers are joined as ${protocol.name} now`);
    } catch {
      play("error");
      problem = `Could not switch to ${protocol.name}. The current protocol stays ${current?.name ?? "unchanged"}.`;
    } finally {
      pending = undefined;
    }
  }

  async function reset() {
    if (pending !== undefined || isNative || !native) return;
    pending = native.version;
    problem = undefined;
    try {
      await request("DELETE", "/protocols/protocol");
      current = await request<Protocol>("GET", "/protocols/protocol");
      play("confirm");
      say(`Back to ${native.name}, the client's own version`);
    } catch {
      play("error");
      problem = `Could not return to ${native.name}.`;
    } finally {
      pending = undefined;
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
    searchBox?.querySelector("input")?.focus();
  }

  function rowKey(event: KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + PAGE,
      PageUp: index - PAGE,
      Home: 0,
      End: visible.length - 1,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      if (target < 0 && event.key === "ArrowUp") return focusSearch();
      const next = visible[Math.max(0, Math.min(visible.length - 1, target))];
      if (next.version !== focusVersion) play("tap");
      focusRow(next.version);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(visible[index]);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      reset();
    }
  }

  function searchKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(focusTarget);
    } else if (event.key === "Enter" && visible[0]) {
      // Type-ahead: the best match is picked straight from the field
      event.preventDefault();
      focusRow(visible[0].version);
      choose(visible[0]);
    }
  }

  // Esc clears the search first and closes second; typing anywhere starts a search
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const inField = target.matches?.("input");
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        query = "";
        play("tap");
        tick().then(() => focusRow(current?.version, "center"));
      } else close();
    } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "f")) {
      event.preventDefault();
      focusSearch();
    } else if (!inField && available && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      query += event.key;
      focusSearch();
    }
  }
</script>

<svelte:window onkeydown={windowKey} />

<div class="stage" role="presentation" {...typingFocus}>
  {#if available === false}
    <main class="glass window unavailable on-glass" in:rise aria-labelledby="vfp-title">
      <h1 id="vfp-title" class="t-title2">Protocol selection is unavailable</h1>
      <p class="t-callout l2">
        Joining servers on other Minecraft versions needs the ViaFabricPlus mod, and it is not installed. The client joins
        every server with its own version.
      </p>
      <button class="cg-pill" bind:this={closeButton} onclick={close} aria-keyshortcuts="Escape">Close</button>
    </main>
  {:else if available || failed}
    <main class="glass window on-glass" in:rise aria-labelledby="vfp-title">
      <header class="head">
        <div class="titles">
          <h1 id="vfp-title" class="t-large">Protocol</h1>
          {#if current}
            <span class="t-callout l2 num">Joining as {current.name}{isNative ? ", the client's own version" : ""}</span>
          {/if}
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys and Enter from the field inside) -->
        <div class="search" bind:this={searchBox} onkeydown={searchKey} role="search">
          <SearchField bind:value={query} placeholder="Search versions" shortcut="Ctrl K" />
        </div>
      </header>

      <div class="list-wrap" bind:this={list}>
        {#if failed}
          <div class="empty">
            <p class="t-callout l2">The protocol list could not be loaded from the client.</p>
            <button class="cg-pill" onclick={load}>Try again</button>
          </div>
        {:else}
          <div class="cg-group" role="listbox" aria-label="Minecraft versions, {visible.length} {visible.length === 1 ? 'entry' : 'entries'}">
            {#each visible as protocol, index (protocol.version)}
              {@const active = protocol.version === current?.version}
              <div
                class="row"
                class:active
                role="option"
                tabindex={protocol.version === focusTarget ? 0 : -1}
                aria-selected={active}
                aria-busy={pending === protocol.version}
                aria-label="{protocol.name}, protocol {protocol.version}{active ? ', current' : ''}{protocol.version === native?.version ? ', native' : ''}"
                data-version={protocol.version}
                onclick={() => {
                  focusRow(protocol.version);
                  choose(protocol);
                }}
                onkeydown={(event) => rowKey(event, index)}
              >
                <span class="check" aria-hidden="true">{active ? "✓" : ""}</span>
                <span class="name num">{protocol.name}</span>
                {#if pending === protocol.version}
                  <span class="tag">Switching</span>
                {:else if active}
                  <span class="tag current">Current</span>
                {:else if protocol.version === native?.version}
                  <span class="tag">Native</span>
                {/if}
                <span class="number num" aria-hidden="true">{protocol.version}</span>
              </div>
            {/each}
          </div>
          {#if query.trim() && visible.length === 0}
            <p class="empty t-callout l2">No version matches “{query.trim()}”</p>
          {/if}
        {/if}
      </div>

      <footer class="foot">
        {#if problem}
          <p class="t-footnote problem" role="alert"><span aria-hidden="true">!</span> {problem}</p>
        {:else}
          <p class="t-footnote l2">The choice applies the next time you join a server.</p>
        {/if}
        <div class="actions">
          {#if native}
            <button class="cg-pill" onclick={reset} disabled={isNative || pending !== undefined} aria-keyshortcuts="Delete">
              Use {native.name} (native)
            </button>
          {/if}
          <button class="cg-pill done" onclick={close} aria-keyshortcuts="Escape">Done</button>
        </div>
      </footer>
    </main>
  {/if}
  <div class="sr-only" role="status" aria-live="polite">{announcement}</div>
</div>

<style>
  .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .window {
    position: relative;
    width: 460px;
    height: min(540px, calc(100% - 96px));
    border-radius: var(--r-window);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .unavailable { height: auto; padding: 16px; gap: 8px; align-items: flex-start; width: 420px; }
  .unavailable .cg-pill { margin-top: 8px; }
  .head { padding: 14px 16px 8px; display: grid; gap: 8px; }
  .titles { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .titles span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .search :global(input:focus-visible) { outline: none; }
  .list-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 16px 16px;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, transparent 0, #000 6px, #000 calc(100% - 28px), transparent);
  }
  .row {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 8px;
    font-size: 13px;
    outline: none;
    transition: background-color var(--t-pop) var(--ease);
  }
  .row:first-child { border-radius: var(--r-group) var(--r-group) 0 0; }
  .row:last-child { border-radius: 0 0 var(--r-group) var(--r-group); }
  .row:only-child { border-radius: var(--r-group); }
  .row:hover { background: rgb(255 255 255 / 0.04); }
  .row.active { background: var(--accent-tint); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 10px; }
  .check { width: 16px; flex: none; text-align: center; font-weight: 650; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.active .name { font-weight: 600; }
  .row.active .number { color: var(--label); }
  .tag { font-size: 12px; line-height: 16px; color: var(--label-2); }
  .tag.current { color: var(--label); font-weight: 600; }
  .number { width: 40px; text-align: right; font-size: 13px; color: var(--label-2); }
  .empty { display: grid; gap: 8px; justify-items: start; padding: 16px 4px; }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px 12px 16px;
    border-top: 0.5px solid var(--line);
  }
  .foot p { min-width: 0; }
  .problem { color: #ffb4b0; }
  .problem span { font-weight: 700; }
  .actions { display: flex; gap: 8px; flex: none; }
  .actions .cg-pill { height: 28px; padding: 0 12px; }
  .cg-pill:disabled { opacity: 0.45; }
  .done { color: #fff; background: var(--accent-fill); font-weight: 600; }
  .done:hover { background: var(--accent-strong); }
</style>
