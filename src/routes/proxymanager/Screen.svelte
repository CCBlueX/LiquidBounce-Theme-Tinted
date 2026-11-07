<script lang="ts">
  import "../../lib/ui/manager.css";
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { reasonOf, request } from "../../lib/api/client";
  import { on, onReconnect } from "../../lib/api/events";
  import { screen } from "../../lib/api/routes";
  import type { ActiveProxy, Proxy, ProxyEntry } from "../../lib/api/types";
  import { keepRowFocus } from "../../lib/focus";
  import { fadeOut, flipDuration, rise, slideIn } from "../../lib/motion";
  import { failure, phrase } from "../../lib/phrases";
  import { play } from "../../lib/sound";
  import { isTextField, typingFocus } from "../../lib/typing";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import ProxySheet, { type FieldErrors, type ProxyForm, type ProxyRow } from "./ProxySheet.svelte";

  // /proxies, /proxy and proxyCheckResult carry proxy passwords in plain text. Every proxy is reduced to a ProxyRow the
  // moment it arrives, so a password is never kept, rendered or logged; edits that keep a password read it from a fresh
  // list right before sending.
  //
  // proxyCheckResult has no id. Checks, adds and pastes queue in request order; a result is matched to the queued
  // entry with the same host, port and username, else to the oldest one.

  type Check = { state: "checking" } | { state: "ok"; ms: number } | { state: "failed"; error: string };
  type Pending = { key: string; kind: "check" | "add" | "edit" | "clipboard"; started: number; timer: number; label: string };

  const CHECK_WAIT = 15_000;
  const CLIPBOARD_WAIT = 12_000;
  const STORAGE_KEY = "tinted.proxychecks";

  let list = $state<ProxyRow[]>([]);
  let active = $state<ProxyRow>();
  let loaded = $state(false);
  let loadFailed = $state(false);
  let checks = $state<Record<string, Check>>({});
  let focusKey = $state<string>();
  let sheetOpen = $state(false);
  let editing = $state<ProxyRow>();
  let formErrors = $state<FieldErrors>({});
  let formBusy = $state(false);
  let status = $state("");
  let removing = $state<ProxyRow>();
  let ready = $state(false);
  let listEl = $state<HTMLDivElement>();
  let addButton = $state<HTMLButtonElement>();
  let pasting = $state(false);
  let retryButton = $state<HTMLButtonElement>();
  const pending: Pending[] = [];

  const keyOf = (p: { host: string; port: number; username: string }) => `${p.host}:${p.port}:${p.username}`;
  const address = (p: { host: string; port: number }) => `${p.host}:${p.port}`;

  function toRow(proxy: ProxyEntry | ActiveProxy): ProxyRow {
    return {
      id: proxy.id,
      host: proxy.host,
      port: proxy.port,
      type: proxy.type ?? "SOCKS5",
      username: proxy.credentials?.username ?? "",
      hasPassword: !!proxy.credentials?.password,
      favorite: proxy.favorite,
      forwardAuthentication: proxy.forwardAuthentication,
      proxyResourcePacks: proxy.proxyResourcePacks ?? false,
      proxyDns: proxy.proxyDns ?? false,
    };
  }

  const shown = $derived([...list.filter((p) => p.favorite), ...list.filter((p) => !p.favorite)]);
  const focusTarget = $derived(shown.find((p) => keyOf(p) === focusKey) ? focusKey : shown[0] && keyOf(shown[0]));
  const isActive = (p: ProxyRow) => !!active && keyOf(active) === keyOf(p);
  const subtitle = $derived(!loaded ? "Loading" : loadFailed && !list.length ? "Not loaded" : list.length ? count(list.length) : "No proxies");

  function count(n: number) {
    return `${n} ${n === 1 ? "proxy" : "proxies"}`;
  }

  function say(text: string) {
    status = text;
  }

  // Loading

  async function load() {
    // A load after a failed one (Try again) lands like the first
    const first = !loaded || loadFailed;
    try {
      const [entries, current] = await Promise.all([
        request<ProxyEntry[]>("GET", "/proxies"),
        request<ActiveProxy | undefined>("GET", "/proxy"),
      ]);
      keepFocus(() => {
        list = entries.map(toRow);
        active = current ? toRow(current) : undefined;
      });
      loadFailed = false;
      if (first && !entries.length) openSheet(undefined, false);
      if (first && entries.length) tick().then(() => document.activeElement === document.body && focusRow(focusTarget));
    } catch {
      loadFailed = true;
      if (first) play("error");
      tick().then(() => document.activeElement === document.body && retryButton?.focus());
    } finally {
      loaded = true;
    }
  }

  async function loadActive() {
    try {
      const current = await request<ActiveProxy | undefined>("GET", "/proxy");
      active = current ? toRow(current) : undefined;
    } catch {
      // The list keeps its last known active proxy
    }
  }

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (saved && typeof saved === "object") checks = saved;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    ready = true;
    play("open");
    load();
    return () => pending.forEach((entry) => clearTimeout(entry.timer));
  });

  // Finished results are kept per host, port and username so the list shows the last check next time
  $effect(() => {
    const finished = Object.fromEntries(Object.entries(checks).filter(([, check]) => check.state !== "checking"));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finished));
  });

  // Check results

  function queue(entry: Omit<Pending, "started" | "timer">, wait: number) {
    const item: Pending = {
      ...entry,
      started: performance.now(),
      timer: window.setTimeout(() => {
        const index = pending.indexOf(item);
        if (index >= 0) pending.splice(index, 1);
        timedOut(item);
      }, wait),
    };
    pending.push(item);
  }

  function take(match: (entry: Pending) => boolean) {
    const index = pending.findIndex(match);
    if (index < 0) return undefined;
    const [entry] = pending.splice(index, 1);
    clearTimeout(entry.timer);
    return entry;
  }

  function timedOut(entry: Pending) {
    if (entry.kind === "clipboard") {
      pasting = false;
      say("Nothing was added from the clipboard. Copy host:port or host:port:username:password first.");
    } else if (entry.kind === "check") {
      checks[entry.key] = { state: "failed", error: "No answer from the client" };
      say(`Checking ${entry.label} got no answer from the client.`);
    } else {
      formBusy = false;
      formErrors = { form: "The client has not reported a result. Check the client, then try again." };
      say(`Saving ${entry.label} got no answer from the client.`);
    }
    play("error");
  }

  function checkResult({ proxy, error }: { proxy?: Proxy; error?: string }) {
    // Only host, port and username are read from the event; its credentials stay untouched
    const key = proxy ? keyOf({ host: proxy.host, port: proxy.port, username: proxy.credentials?.username ?? "" }) : undefined;
    const label = proxy ? address(proxy) : "";
    const entry =
      (key && take((e) => e.key === key)) || take((e) => e.kind === "clipboard") || take(() => true);
    const ms = entry ? Math.round(performance.now() - entry.started) : 0;
    if (key) checks[key] = error ? { state: "failed", error: phrase(error) } : { state: "ok", ms };

    const kind = entry?.kind ?? (proxy ? "check" : "clipboard");
    if (kind === "clipboard") pasting = false;
    if (error) {
      const text = phrase(error);
      if (kind === "add" || kind === "edit") {
        formBusy = false;
        formErrors = { form: text };
      }
      say(label ? `${label} failed the check. ${text}` : text);
      play("error");
      return;
    }
    if (kind === "add" || kind === "edit") {
      formBusy = false;
      sheetOpen = false;
      editing = undefined;
      if (key) focusKey = key;
      tick().then(() => focusRow(focusKey));
      say(kind === "add" ? `Added ${label}. It works, answered in ${ms} ms.` : `Saved ${label}. It works, answered in ${ms} ms.`);
    } else if (kind === "clipboard") {
      say(`Added ${label} from the clipboard. It works, answered in ${ms} ms.`);
    } else {
      say(`${label} works, answered in ${ms} ms.`);
    }
    play("confirm");
    load();
  }

  $effect(() => on("proxyCheckResult", checkResult));
  // Adds and edits that finished while the event socket was down only show in a fresh list
  $effect(() => onReconnect(load));

  // Row actions

  async function use(row: ProxyRow) {
    try {
      await request("POST", "/proxy", { body: { id: row.id } });
      await loadActive();
      say(`Using ${address(row)} for new connections.`);
      play("confirm");
    } catch (error) {
      say(`Couldn't use ${address(row)}. ${failure(error)}`);
      play("error");
    }
  }

  async function disconnect() {
    try {
      await request("DELETE", "/proxy");
      active = undefined;
      await loadActive();
      say("Proxy off. New connections go straight to the server.");
      play("toggleOff");
    } catch (error) {
      say(`Couldn't turn the proxy off. ${failure(error)}`);
      play("error");
    }
  }

  async function check(row: ProxyRow) {
    const key = keyOf(row);
    if (checks[key]?.state === "checking") return;
    checks[key] = { state: "checking" };
    say(`Checking ${address(row)}…`);
    queue({ key, kind: "check", label: address(row) }, CHECK_WAIT);
    try {
      await request("POST", "/proxies/check", { body: { id: row.id } });
    } catch (error) {
      take((e) => e.key === key && e.kind === "check");
      checks[key] = { state: "failed", error: failure(error) };
      say(`Couldn't check ${address(row)}. ${failure(error)}`);
      play("error");
    }
  }

  async function favorite(row: ProxyRow) {
    const next = !row.favorite;
    play("tap");
    keepFocus(() => (row.favorite = next));
    try {
      await request(next ? "PUT" : "DELETE", "/proxies/favorite", { body: { id: row.id } });
      say(next ? `${address(row)} is a favorite.` : `${address(row)} is no longer a favorite.`);
    } catch (error) {
      keepFocus(() => (row.favorite = !next));
      say(`Couldn't change ${address(row)}. ${failure(error)}`);
      play("error");
    }
  }

  async function paste() {
    if (pasting) return;
    pasting = true;
    say("Reading a proxy from the clipboard…");
    queue({ key: "clipboard", kind: "clipboard", label: "" }, CLIPBOARD_WAIT);
    try {
      await request("POST", "/proxies/add/clipboard");
    } catch (error) {
      take((e) => e.kind === "clipboard");
      pasting = false;
      say(`Couldn't read the clipboard. ${failure(error)}`);
      play("error");
    }
  }

  function askRemove(row: ProxyRow) {
    play("open");
    removing = row;
  }

  function cancelRemove() {
    const target = removing;
    removing = undefined;
    play("close");
    tick().then(() => focusRow(target && keyOf(target)));
  }

  async function confirmRemove() {
    const target = removing;
    if (!target) return;
    removing = undefined;
    const index = shown.indexOf(target);
    const neighbor = shown[index + 1] ?? shown[index - 1];
    try {
      // Ids shift with every change; find the proxy again right before removing it
      const fresh = (await request<ProxyEntry[]>("GET", "/proxies")).map(toRow);
      const now = fresh.find((p) => keyOf(p) === keyOf(target));
      if (!now) {
        list = fresh;
        say(`${address(target)} is no longer in the list.`);
        return;
      }
      await request("DELETE", "/proxies/remove", { body: { id: now.id } });
      list = fresh.filter((p) => p !== now).map((p) => (p.id > now.id ? { ...p, id: p.id - 1 } : p));
      delete checks[keyOf(target)];
      focusKey = neighbor && keyOf(neighbor);
      await loadActive();
      say(`Removed ${address(target)}.`);
      play("toggleOff");
    } catch (error) {
      say(`Couldn't remove ${address(target)}. ${failure(error)}`);
      play("error");
    }
    await tick();
    focusRow(focusKey);
  }

  // Sheet

  function openSheet(row: ProxyRow | undefined, sound = true) {
    if (sound) play("tap");
    editing = row;
    formErrors = {};
    formBusy = false;
    sheetOpen = true;
  }

  function closeSheet() {
    play("close");
    sheetOpen = false;
    const was = editing;
    editing = undefined;
    tick().then(() => focusRow(was ? keyOf(was) : focusTarget) || addButton?.focus());
  }

  async function submit(form: ProxyForm) {
    const target = editing;
    let password = form.password;
    formErrors = {};
    formBusy = true;
    try {
      if (password === null && target) {
        // Keep the saved password: read it from a fresh list, send it, drop it
        const fresh = await request<ProxyEntry[]>("GET", "/proxies");
        password = fresh.find((p) => p.id === target.id && keyOf(toRow(p)) === keyOf(target))?.credentials?.password ?? "";
      }
      const body = {
        host: form.host,
        port: form.port,
        type: form.type,
        username: form.username,
        password: password ?? "",
        forwardAuthentication: form.forwardAuthentication,
        proxyResourcePacks: form.proxyResourcePacks,
        proxyDns: form.proxyDns,
      };
      password = null;
      const key = keyOf(form);
      queue({ key, kind: target ? "edit" : "add", label: address(form) }, CHECK_WAIT);
      checks[key] = { state: "checking" };
      say(`Checking ${address(form)} before saving…`);
      try {
        if (target) await request("POST", "/proxies/edit", { body: { id: target.id, ...body } });
        else await request("POST", "/proxies/add", { body });
      } catch (error) {
        take((e) => e.key === key);
        delete checks[key];
        throw error;
      }
    } catch (error) {
      formBusy = false;
      const reason = reasonOf(error);
      formErrors =
        reason === "No host" ? { host: phrase(reason) } : reason === "Illegal port" ? { port: phrase(reason) } : { form: failure(error) };
      say(`Couldn't save ${address(form)}. ${Object.values(formErrors)[0]}`);
      play("error");
    }
  }

  // Focus and keys

  function rowOf(key: string | undefined) {
    return key ? listEl?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : undefined;
  }

  function focusRow(key: string | undefined) {
    const row = rowOf(key);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
    return !!row;
  }

  const keepFocus = (change: () => void) => keepRowFocus(listEl, () => rowOf(focusKey), change);

  function step(to: ProxyRow | undefined) {
    if (!to) return;
    const key = keyOf(to);
    if (key !== focusKey) play("tap");
    focusKey = key;
    focusRow(key);
  }

  function rowKey(event: KeyboardEvent, row: ProxyRow) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = shown.indexOf(row);
    const actions: Record<string, () => void> = {
      ArrowDown: () => step(shown[index + 1]),
      ArrowUp: () => step(shown[index - 1]),
      PageDown: () => step(shown[Math.min(shown.length - 1, index + 8)]),
      PageUp: () => step(shown[Math.max(0, index - 8)]),
      Home: () => step(shown[0]),
      End: () => step(shown[shown.length - 1]),
      Enter: () => (isActive(row) ? say(`${address(row)} is already in use.`) : use(row)),
      c: () => check(row),
      e: () => openSheet(row),
      f: () => favorite(row),
      Delete: () => askRemove(row),
      Backspace: () => askRemove(row),
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  async function close() {
    play("close");
    try {
      await screen.close();
    } catch {
      play("error");
    }
  }

  // The client closes the screen on Esc by itself; a close from here as well would also close the screen it went back to
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented || removing) return;
    const inField = isTextField(event.target);
    if (event.key === "Escape") {
      event.preventDefault();
      if (sheetOpen) closeSheet();
    } else if (!inField && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "n" && !sheetOpen) {
        event.preventDefault();
        openSheet(undefined);
      } else if (key === "v") {
        event.preventDefault();
        paste();
      }
    }
  }

  function checkWords(row: ProxyRow) {
    const result = checks[keyOf(row)];
    if (!result) return "Not checked";
    if (result.state === "checking") return "Checking…";
    if (result.state === "ok") return `Works · ${result.ms} ms`;
    return `Failed · ${result.error}`;
  }

  function sign(row: ProxyRow) {
    return row.username ? `Signs in as ${row.username}` : "No sign-in";
  }

  function rowLabel(row: ProxyRow) {
    const result = checks[keyOf(row)];
    const check =
      result?.state === "ok" ? `works, check answered in ${result.ms} ms` : result?.state === "failed" ? `check failed: ${result.error.replace(/\.$/, "")}` : result ? "checking" : "not checked";
    return [`${row.host}, port ${row.port}`, row.type, sign(row), check, row.favorite ? "favorite" : "not favorite", isActive(row) ? "in use" : "not in use"].join(", ");
  }

  const activeCheck = $derived(active ? checks[keyOf(active)] : undefined);
</script>

<svelte:window onkeydown={windowKey} />

<div class="mg-stage" role="presentation" {...typingFocus}>
  {#if ready}
    <div class="mg-frame" class:with-sheet={sheetOpen}>
      <main class="mg-window glass" class:with-sheet={sheetOpen} aria-label="Proxies" in:rise>
        <div class="mg-content">
          <header class="mg-head on-glass">
            <div class="mg-titles">
              <h1 class="t-large">Proxies</h1>
              <span class="t-callout l2 num">{subtitle}</span>
            </div>
            <div class="mg-tools">
              <button class="mg-pill large" aria-keyshortcuts="V" disabled={pasting} onclick={paste}>
                {pasting ? "Reading clipboard…" : "Paste from clipboard"}
              </button>
              <button class="mg-pill primary large" bind:this={addButton} aria-keyshortcuts="N" onclick={() => openSheet(undefined)}>Add proxy</button>
            </div>
          </header>

          <section class="group mg-current on-glass" aria-label="Connection">
            {#if active}
              <div class="grow">
                <div class="t-footnote mg-kicker">In use for new connections</div>
                <div class="t-title3 name num">{address(active)}</div>
                <div class="t-callout line num">
                  <span>{active.type}</span><span aria-hidden="true">·</span><span class:mg-error-text={activeCheck?.state === "failed"}>{checkWords(active)}</span>
                </div>
              </div>
              <button class="mg-pill large" aria-label="Check {active.host}" disabled={activeCheck?.state === "checking"} onclick={() => active && check(active)}>Check</button>
              <button class="mg-pill large" aria-label="Disconnect from {active.host}" onclick={disconnect}>Disconnect</button>
            {:else}
              <div class="grow">
                <div class="t-footnote mg-kicker">Connection</div>
                <div class="t-title3 name">Direct</div>
                <div class="t-callout line">No proxy is in use. New connections go straight to the server.</div>
              </div>
            {/if}
          </section>

          {#if loadFailed && !list.length}
            <div class="mg-empty on-glass">
              <h2 class="t-title3">Proxies could not be loaded</h2>
              <p class="t-callout l2">The client did not send the proxy list.</p>
              <button class="mg-pill large" bind:this={retryButton} onclick={load}>Try again</button>
            </div>
          {:else if loaded && !list.length}
            <div class="mg-empty on-glass">
              <h2 class="t-title3">No proxies yet</h2>
              <p class="t-callout l2">Add a SOCKS5 or HTTP proxy, or copy one as host:port or host:port:username:password and paste it.</p>
              {#if !sheetOpen}<button class="mg-pill large" onclick={() => openSheet(undefined)}>Add proxy</button>{/if}
            </div>
          {:else}
            <div class="mg-list on-glass" bind:this={listEl} role="list" aria-label="Saved proxies, {subtitle}">
              {#each shown as row (row.id)}
                {@const key = keyOf(row)}
                {@const result = checks[key]}
                {@const inUse = isActive(row)}
                <div class="mg-row" class:selected={key === focusTarget} role="listitem" animate:flip={{ duration: flipDuration(), easing: cubicOut }}>
                  <button
                    class="hit"
                    data-key={key}
                    tabindex={key === focusTarget ? 0 : -1}
                    aria-label={rowLabel(row)}
                    aria-keyshortcuts="Enter C E F Delete"
                    onclick={() => (focusKey = key)}
                    ondblclick={() => !inUse && use(row)}
                    onfocus={() => (focusKey = key)}
                    onkeydown={(event) => rowKey(event, row)}
                  ></button>
                  <span class="type">{row.type}</span>
                  <div class="grow">
                    <div class="name num">{address(row)}</div>
                    <div class="line num split">
                      <span class="sign">{sign(row)}{row.port === 0 ? " · Port 0 is never used" : ""} ·</span>
                      <span class="check" class:mg-error-text={result?.state === "failed"} class:mg-pulse={result?.state === "checking"}>{checkWords(row)}</span>
                    </div>
                  </div>
                  <div class="actions">
                    <button class="mg-pill quiet reveal" tabindex="-1" aria-label="Edit {row.host}" onclick={() => openSheet(row)}>Edit</button>
                    <button class="mg-pill quiet reveal" tabindex="-1" aria-label="Remove {row.host}" onclick={() => askRemove(row)}>Remove</button>
                    <button
                      class="mg-chip fav"
                      class:on={row.favorite}
                      class:reveal={!row.favorite}
                      tabindex="-1"
                      aria-pressed={row.favorite}
                      aria-label="{row.favorite ? 'Unfavorite' : 'Favorite'} {row.host}"
                      onclick={() => favorite(row)}
                    ><span aria-hidden="true">{row.favorite ? "★" : "☆"}</span>Favorite</button>
                    <button class="mg-pill" tabindex="-1" aria-label="Check {row.host}" disabled={result?.state === "checking"} onclick={() => check(row)}>Check</button>
                    {#if inUse}
                      <span class="mg-chip in-use">In use</span>
                    {:else}
                      <button class="mg-pill use" tabindex="-1" aria-label="Use proxy {row.host} as active" onclick={() => use(row)}>Use</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <footer class="mg-foot on-glass">
            <div class="mg-status" role="status" aria-live="polite">{status}</div>
            {#if !sheetOpen && shown.length}
              <div class="mg-hints" aria-hidden="true">
                <span><Keycap>↵</Keycap>Use</span>
                <span><Keycap>C</Keycap>Check</span>
                <span><Keycap>E</Keycap>Edit</span>
                <span><Keycap>F</Keycap>Favorite</span>
                <span><Keycap>Del</Keycap>Remove</span>
              </div>
            {/if}
          </footer>
        </div>

        {#if sheetOpen}
          <aside class="mg-sheet glass deep" aria-labelledby="mg-sheet-title" in:slideIn={{ delay: 40 }} out:fadeOut>
            {#key editing}
              <ProxySheet
                {editing}
                busy={formBusy}
                errors={formErrors}
                progress={editing ? "Checking before saving…" : "Checking the proxy…"}
                onsubmit={submit}
                onclose={closeSheet}
              />
            {/key}
          </aside>
        {/if}

        {#if removing}
          <ConfirmPopover
            title="Remove {address(removing)}?"
            text={isActive(removing)
              ? "This proxy is in use. Removing it turns the proxy off for new connections. This can't be undone."
              : "The proxy is deleted from LiquidBounce. This can't be undone."}
            action="Remove"
            actionLabel="Confirm remove {removing.host}"
            placement="modal"
            width={340}
            onconfirm={confirmRemove}
            oncancel={cancelRemove}
          />
        {/if}
      </main>

      <div class="mg-bottom" in:rise={{ delay: 120 }}>
        <button class="glass mg-closer" aria-label="Close proxies" onclick={close}>×</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .type {
    flex: none;
    width: 52px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 12px;
    font-weight: 600;
    color: var(--label-2);
    pointer-events: none;
  }
  /* A long username gives way first; the check result keeps up to most of the line */
  .split { display: flex; gap: 0.3em; }
  .split span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .split .check { flex: none; max-width: 70%; }
  .fav span { font-size: 12px; }
  .use { min-width: 48px; }
  .in-use { min-width: 48px; justify-content: center; height: 26px; border-radius: 13px; }
</style>
