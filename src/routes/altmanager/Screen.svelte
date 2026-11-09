<script lang="ts">
  import "../../lib/ui/manager.css";
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import { request } from "../../lib/api/client";
  import { on, onReconnect } from "../../lib/api/events";
  import { accounts as accountsApi, screen, session as sessionApi } from "../../lib/api/routes";
  import type { Account, RandomName, RemovedAccount, Session } from "../../lib/api/types";
  import { keepRowFocus } from "../../lib/focus";
  import { easeOut, fadeOut, flipDuration, rise, slideIn } from "../../lib/motion";
  import { failure, phrase } from "../../lib/phrases";
  import { play } from "../../lib/sound";
  import { isTextField, typingFocus } from "../../lib/typing";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";
  import SearchField from "../../lib/ui/SearchField.svelte";
  import AddMenu, { type AddChoice } from "./AddMenu.svelte";
  import AddSheet, { type Flow, type Note, type SheetAction } from "./AddSheet.svelte";

  // Ids are list indices that shift on every reorder and removal, so rows are keyed and focused by uuid; an id is read
  // from the latest list right before it is sent.

  type Job = { action: SheetAction; kind: "add" | "login"; timer: number };
  type Item = { kind: "section"; key: string; label: string } | { kind: "account"; key: string; account: Account };

  const ACTIONS: Record<SheetAction, { path: string; kind: "add" | "login"; progress: string; wait: number }> = {
    addCracked: { path: "/accounts/new/cracked", kind: "add", progress: "Adding the account…", wait: 30_000 },
    loginCracked: { path: "/account/login/cracked", kind: "login", progress: "Logging in…", wait: 30_000 },
    device: { path: "/accounts/new/microsoft/device-code", kind: "add", progress: "Waiting for Microsoft sign-in…", wait: 300_000 },
    clipboard: { path: "/accounts/new/microsoft/device-code/clipboard", kind: "add", progress: "Waiting for Microsoft sign-in…", wait: 300_000 },
    webview: { path: "/accounts/new/microsoft/webview", kind: "add", progress: "Waiting for Microsoft sign-in…", wait: 300_000 },
    credentials: { path: "/accounts/new/microsoft/credentials", kind: "add", progress: "Signing in to Microsoft…", wait: 60_000 },
    addSession: { path: "/accounts/new/session", kind: "add", progress: "Checking the token…", wait: 30_000 },
    loginSession: { path: "/account/login/session", kind: "login", progress: "Logging in…", wait: 30_000 },
    altening: { path: "/accounts/new/altening", kind: "add", progress: "Checking the token…", wait: 30_000 },
    generate: { path: "/accounts/new/altening/generate", kind: "add", progress: "Generating an account…", wait: 60_000 },
  };
  const ROW_LOGIN_WAIT = 45_000;
  // 200 additions arrive within half a second when a list is imported; refetch once they go quiet, at least twice a second
  const REFETCH_QUIET = 250;
  const REFETCH_MAX = 500;

  let list = $state<Account[]>([]);
  let loaded = $state(false);
  let loadFailed = $state(false);
  let current = $state<Session>();
  let query = $state("");
  let focusUuid = $state<string>();
  let sheet = $state<Flow>();
  let job = $state<Job>();
  let note = $state<Note>();
  let status = $state("");
  let rowBusy = $state<{ uuid: string; timer: number }>();
  let rowErrors = $state<Record<string, string>>({});
  let removing = $state<Account>();
  let restoring = false;
  let ready = $state(false);
  let listEl = $state<HTMLDivElement>();
  let searchBox = $state<HTMLDivElement>();
  let menu = $state<AddMenu>();
  let retryButton = $state<HTMLButtonElement>();

  const needle = $derived(query.trim().toLowerCase());
  const matches = $derived(
    needle ? list.filter((a) => a.username.toLowerCase().includes(needle) || typeWords(a.type).toLowerCase().includes(needle)) : list,
  );
  const shown = $derived([...matches.filter((a) => a.favorite), ...matches.filter((a) => !a.favorite)]);
  const favorites = $derived(list.filter((a) => a.favorite).length);
  const items = $derived.by<Item[]>(() => {
    const rows = shown.map((account): Item => ({ kind: "account", key: account.uuid, account }));
    const favCount = shown.filter((a) => a.favorite).length;
    if (!favCount) return rows;
    const rest = rows.slice(favCount);
    return [
      { kind: "section", key: "s-fav", label: "Favorites" },
      ...rows.slice(0, favCount),
      ...(rest.length ? [{ kind: "section", key: "s-all", label: "Accounts" } as Item] : []),
      ...rest,
    ];
  });
  const focusTarget = $derived(shown.find((a) => a.uuid === focusUuid)?.uuid ?? shown[0]?.uuid);

  const subtitle = $derived.by(() => {
    if (!loaded) return "Loading";
    if (loadFailed && !list.length) return "Not loaded";
    if (needle) return `${shown.length} of ${count(list.length, "account")}`;
    if (!list.length) return "No accounts";
    return favorites ? `${count(list.length, "account")} · ${count(favorites, "favorite")}` : count(list.length, "account");
  });

  function count(n: number, word: string) {
    return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
  }

  function typeWords(type: string) {
    return { Cracked: "Cracked", Microsoft: "Microsoft", Session: "Session token", TheAltening: "The Altening" }[type] ?? type;
  }

  const sessionWords = $derived.by(() => {
    if (!current) return "";
    if (current.service === "Cracked") return "Cracked account · Offline-mode servers only";
    const service = { Microsoft: "Microsoft account", Session: "Session account", TheAltening: "The Altening account" }[current.service];
    return `${service ?? `${current.service} account`}${current.online ? " · Premium" : ""}`;
  });

  const isCurrent = (a: Account) => !!current && a.uuid === current.uuid && a.username === current.username;

  function say(text: string) {
    status = text;
  }

  // Loading

  let refetchTimer: number | undefined;
  let burstStart = 0;
  function scheduleLoad() {
    const now = performance.now();
    burstStart ||= now;
    clearTimeout(refetchTimer);
    refetchTimer = window.setTimeout(() => {
      burstStart = 0;
      load();
    }, Math.min(REFETCH_QUIET, Math.max(0, burstStart + REFETCH_MAX - now)));
  }

  async function load() {
    // A load after a failed one (Try again) lands like the first
    const first = !loaded || loadFailed;
    try {
      const next = await accountsApi.list();
      keepFocus(() => (list = next));
      loadFailed = false;
      if (first && next.length === 0) openSheet("cracked", false);
      // Keyboard users land on the list, ready for arrows and Enter
      if (first && next.length) tick().then(() => document.activeElement === document.body && focusRow(focusTarget));
    } catch {
      loadFailed = true;
      if (first) play("error");
      tick().then(() => document.activeElement === document.body && retryButton?.focus());
    } finally {
      loaded = true;
    }
  }

  function loadSession() {
    sessionApi.get().then((s) => (current = s)).catch(() => {});
  }

  onMount(() => {
    ready = true;
    play("open");
    load();
    loadSession();
    return () => {
      clearTimeout(refetchTimer);
      if (job) clearTimeout(job.timer);
      if (rowBusy) clearTimeout(rowBusy.timer);
    };
  });

  // Events

  $effect(() => {
    const offs = [
      on("accountManagerMessage", ({ message }) => {
        const text = phrase(message);
        if (job) note = { tone: "progress", title: ACTIONS[job.action].progress, text };
        say(text);
      }),
      on("accountManagerAddition", (event) => {
        scheduleLoad();
        // Cracked logins without saving report their errors here, not on the login channel
        if (job && (job.kind === "add" || (job.action === "loginCracked" && event.error))) finishJob(event);
      }),
      on("accountManagerLogin", (event) => loginResult(event)),
      on("accountManagerRemoval", () => scheduleLoad()),
      on("session", ({ session: s }) => (current = s)),
      // Additions, removals and logins sent while the socket was down are lost
      onReconnect(() => {
        load();
        loadSession();
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  // Sheet flows

  function openSheet(flow: Flow, sound = true) {
    if (sound && flow !== sheet) play("tap");
    sheet = flow;
    if (!job) note = undefined;
  }

  function closeSheet() {
    play("close");
    sheet = undefined;
    if (!job) note = undefined;
    tick().then(() => focusRow(focusTarget) || searchBox?.querySelector("input")?.focus());
  }

  function choose(choice: AddChoice) {
    if (choice === "device" || choice === "clipboard" || choice === "webview") {
      openSheet("microsoft");
      run(choice);
    } else {
      openSheet(choice === "cracked" ? "cracked" : choice);
    }
  }

  async function run(action: SheetAction, body?: Record<string, unknown>) {
    const spec = ACTIONS[action];
    // The sign-in link can be copied again while a browser sign-in waits; anything else waits for the running job
    const alongside = action === "clipboard" && job?.action === "device";
    if (job && !alongside) return;
    if (!alongside) {
      job = { action, kind: spec.kind, timer: window.setTimeout(() => timeoutJob(), spec.wait) };
      note = { tone: "progress", title: spec.progress, text: action === "device" || action === "webview" || action === "clipboard" ? "Waiting for the client." : "" };
      say(spec.progress);
    }
    try {
      await request("POST", spec.path, { body });
    } catch (error) {
      if (alongside) return say(failure(error));
      endJob();
      note = { tone: "error", title: spec.kind === "add" ? "Couldn't add the account" : "Couldn't log in", text: failure(error) };
      say(`${note.title}. ${note.text}`);
      play("error");
    }
  }

  function endJob() {
    if (job) clearTimeout(job.timer);
    job = undefined;
  }

  function timeoutJob() {
    const kind = job?.kind;
    endJob();
    note = { tone: "error", title: "No answer yet", text: "The client has not reported a result. Check the client, then try again." };
    say(kind === "login" ? "The login got no answer from the client." : "Adding the account got no answer from the client.");
    play("error");
  }

  function finishJob(event: { username?: string; error?: string }) {
    const kind = job?.kind ?? "add";
    endJob();
    if (event.error) {
      note = { tone: "error", title: kind === "add" ? "Couldn't add the account" : "Couldn't log in", text: phrase(event.error) };
      say(`${note.title}. ${note.text}`);
      play("error");
      return;
    }
    const name = event.username ?? "the account";
    if (kind === "add") {
      note = { tone: "done", title: `Added ${name}`, text: "It is in the list. Select it and press Enter to log in." };
      say(`Added ${name}.`);
      const added = list.find((a) => a.username === event.username);
      if (added) focusUuid = added.uuid;
    } else {
      note = { tone: "done", title: `Logged in as ${name}`, text: "New connections use this account." };
      say(`Logged in as ${name}.`);
      loadSession();
    }
    play("confirm");
  }

  async function randomName() {
    try {
      const result = await request<RandomName | undefined>("POST", "/account/random-name");
      return result?.name;
    } catch (error) {
      say(`No random name. ${failure(error)}`);
      play("error");
    }
  }

  // Row actions

  async function login(account: Account) {
    if (rowBusy || job?.kind === "login") {
      say("Another login is still running.");
      play("error");
      return;
    }
    delete rowErrors[account.uuid];
    rowBusy = {
      uuid: account.uuid,
      timer: window.setTimeout(() => {
        if (rowBusy?.uuid !== account.uuid) return;
        rowBusy = undefined;
        rowErrors[account.uuid] = "No answer from the client";
        say(`Logging in as ${account.username} got no answer from the client.`);
        play("error");
      }, ROW_LOGIN_WAIT),
    };
    say(`Logging in as ${account.username}…`);
    try {
      await accountsApi.login(account.id);
    } catch (error) {
      clearTimeout(rowBusy.timer);
      rowBusy = undefined;
      rowErrors[account.uuid] = failure(error);
      say(`Couldn't log in as ${account.username}. ${rowErrors[account.uuid]}`);
      play("error");
    }
  }

  function loginResult(event: { username?: string; error?: string }) {
    if (restoring) {
      restoring = false;
      return;
    }
    if (rowBusy) {
      const { uuid, timer } = rowBusy;
      clearTimeout(timer);
      rowBusy = undefined;
      const name = list.find((a) => a.uuid === uuid)?.username ?? event.username ?? "the account";
      if (event.error) {
        rowErrors[uuid] = phrase(event.error);
        say(`Couldn't log in as ${name}. ${rowErrors[uuid]}`);
        play("error");
      } else {
        say(`Logged in as ${event.username ?? name}.`);
        play("confirm");
        loadSession();
      }
    } else if (job?.kind === "login") {
      finishJob(event);
    } else if (event.username) {
      loadSession();
    }
  }

  async function favorite(account: Account) {
    const next = !account.favorite;
    play("tap");
    keepFocus(() => (account.favorite = next));
    try {
      await request(next ? "PUT" : "DELETE", "/account/favorite", { body: { id: account.id } });
      say(next ? `${account.username} is a favorite.` : `${account.username} is no longer a favorite.`);
    } catch (error) {
      keepFocus(() => (account.favorite = !next));
      say(`Couldn't change ${account.username}. ${failure(error)}`);
      play("error");
    }
  }

  // Moves swap with the neighbour shown above or below; favourites and the rest are sorted apart, so a move never
  // crosses between the two groups
  async function move(account: Account, step: -1 | 1) {
    const index = shown.indexOf(account);
    const other = shown[index + step];
    if (!other || other.favorite !== account.favorite) return;
    const from = account.id;
    const to = other.id;
    const swap = () => {
      const a = list.indexOf(account);
      const b = list.indexOf(other);
      [list[a], list[b]] = [list[b], list[a]];
      [account.id, other.id] = [other.id, account.id];
    };
    keepFocus(swap);
    play("tap");
    try {
      await request("POST", "/accounts/swap", { body: { from, to } });
      say(`Moved ${account.username} ${step < 0 ? "up" : "down"}.`);
    } catch (error) {
      keepFocus(swap);
      say(`Couldn't move ${account.username}. ${failure(error)}`);
      play("error");
    }
  }

  function askRemove(account: Account) {
    play("open");
    removing = account;
  }

  function cancelRemove() {
    const target = removing;
    removing = undefined;
    play("close");
    tick().then(() => focusRow(target?.uuid));
  }

  async function confirmRemove() {
    const target = removing;
    if (!target) return;
    removing = undefined;
    const index = shown.indexOf(target);
    const neighbor = shown[index + 1] ?? shown[index - 1];
    try {
      // The confirmation may have stood open while the list changed; find the account again by uuid
      const fresh = await accountsApi.list();
      const now = fresh.find((a) => a.uuid === target.uuid && a.username === target.username);
      if (!now) {
        list = fresh;
        say(`${target.username} is no longer in the list.`);
        return;
      }
      const removed = await request<RemovedAccount>("DELETE", "/account", { body: { id: now.id } });
      list = fresh.filter((a) => a !== now).map((a) => (a.id > now.id ? { ...a, id: a.id - 1 } : a));
      focusUuid = neighbor?.uuid;
      say(`Removed ${removed?.username ?? target.username}.`);
      play("toggleOff");
    } catch (error) {
      say(`Couldn't remove ${target.username}. ${failure(error)}`);
      play("error");
    }
    await tick();
    focusRow(focusUuid);
  }

  async function restore() {
    restoring = true;
    say("Restoring the account the game started with…");
    try {
      const restored = await request<Session | undefined>("POST", "/account/restore");
      if (restored) current = restored;
      else loadSession();
      say(`Back on ${restored?.username ?? "the account the game started with"}.`);
      play("confirm");
    } catch (error) {
      restoring = false;
      say(`Couldn't restore the initial account. ${failure(error)}`);
      play("error");
    }
  }

  // Focus

  function rowOf(uuid: string | undefined) {
    return uuid ? listEl?.querySelector<HTMLElement>(`[data-uuid="${CSS.escape(uuid)}"]`) : undefined;
  }

  function focusRow(uuid: string | undefined) {
    const row = rowOf(uuid);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
    return !!row;
  }

  const keepFocus = (change: () => void) => keepRowFocus(listEl, () => rowOf(focusUuid), change);

  function step(to: Account | undefined) {
    if (!to) return;
    if (to.uuid !== focusUuid) play("tap");
    focusUuid = to.uuid;
    focusRow(to.uuid);
  }

  function rowKey(event: KeyboardEvent, account: Account) {
    const index = shown.indexOf(account);
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(account, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(shown[index + 1]);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (index === 0) searchBox?.querySelector("input")?.focus();
        else step(shown[index - 1]);
        break;
      case "PageDown":
        event.preventDefault();
        step(shown[Math.min(shown.length - 1, index + 8)]);
        break;
      case "PageUp":
        event.preventDefault();
        step(shown[Math.max(0, index - 8)]);
        break;
      case "Home":
        event.preventDefault();
        step(shown[0]);
        break;
      case "End":
        event.preventDefault();
        step(shown[shown.length - 1]);
        break;
      case "Enter":
        event.preventDefault();
        login(account);
        break;
      case "f":
      case "F":
        event.preventDefault();
        favorite(account);
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        askRemove(account);
        break;
    }
  }

  function searchKey(event: KeyboardEvent) {
    if ((event.key === "ArrowDown" || event.key === "Enter") && shown.length) {
      event.preventDefault();
      step(shown.find((a) => a.uuid === focusTarget));
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

  // Esc closes the innermost layer: menu and dialog handle their own, then the sheet and the search. The client closes
  // the screen on Esc by itself; a close from here as well would also close the screen the client went back to.
  function windowKey(event: KeyboardEvent) {
    if (event.defaultPrevented || removing) return;
    const inField = isTextField(event.target);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const input = searchBox?.querySelector("input");
      input?.focus();
      input?.select();
    } else if (event.key === "Escape") {
      if (document.querySelector(":popover-open")) return;
      event.preventDefault();
      if (sheet) closeSheet();
      else if (query) {
        query = "";
        play("tap");
      }
    } else if (!inField && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      menu?.open();
    }
  }

  function rowLabel(account: Account) {
    const parts = [account.username, typeWords(account.type), account.favorite ? "favorite" : "not favorite"];
    if (isCurrent(account)) parts.push("in use");
    if (rowBusy?.uuid === account.uuid) parts.push(`logging in as ${account.username}`);
    if (rowErrors[account.uuid]) parts.push(`login failed: ${rowErrors[account.uuid]}`);
    return parts.join(", ");
  }
</script>

<svelte:window onkeydown={windowKey} />

<div class="mg-stage" role="presentation" {...typingFocus}>
  {#if ready}
    <div class="mg-frame" class:with-sheet={sheet}>
      <main class="mg-window glass" class:with-sheet={sheet} aria-label="Accounts" in:rise>
        <div class="mg-content">
          <header class="mg-head on-glass">
            <div class="mg-titles">
              <h1 class="t-large">Accounts</h1>
              <span class="t-callout l2 num">{subtitle}</span>
            </div>
            <div class="mg-tools">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys and Enter from the field inside) -->
              <div class="mg-search" bind:this={searchBox} role="search" onkeydown={searchKey}>
                <SearchField bind:value={query} placeholder="Search accounts" shortcut="Ctrl K" />
              </div>
              <AddMenu bind:this={menu} onchoose={choose} />
            </div>
          </header>

          <section class="group mg-current on-glass" aria-label="Current account">
            {#key current?.uuid}<PlayerHead uuid={current?.uuid} avatar={current?.avatar} size={32} inWorld={false} />{/key}
            <div class="grow">
              <div class="t-footnote mg-kicker">Current account</div>
              <div class="t-title3 name">{current?.username ?? "Unknown"}</div>
              <div class="t-callout line">{sessionWords}</div>
            </div>
            <button class="mg-pill large" aria-label="Restore initial account, the one the game started with" onclick={restore}>Restore initial</button>
          </section>

          {#if loadFailed && !list.length}
            <div class="mg-empty on-glass">
              <h2 class="t-title3">Accounts could not be loaded</h2>
              <p class="t-callout l2">The client did not send the account list.</p>
              <button class="mg-pill large" bind:this={retryButton} onclick={load}>Try again</button>
            </div>
          {:else if loaded && !list.length}
            <div class="mg-empty on-glass">
              <h2 class="t-title3">No accounts yet</h2>
              <p class="t-callout l2">Add a cracked name for offline-mode servers, or sign in with Microsoft to join any server.</p>
              {#if !sheet}<button class="mg-pill large" onclick={() => openSheet("cracked")}>Add a cracked name</button>{/if}
            </div>
          {:else if loaded && !shown.length}
            <div class="mg-empty on-glass">
              <p class="t-callout l2">No accounts match “{query.trim()}”</p>
            </div>
          {:else}
            <div class="mg-list on-glass" bind:this={listEl} role="list" aria-label="Saved accounts, {subtitle}">
              {#each items as item (item.key)}
                <div
                  class={item.kind === "section" ? "mg-section" : "mg-row"}
                  class:selected={item.kind === "account" && item.account.uuid === focusTarget}
                  role={item.kind === "section" ? "presentation" : "listitem"}
                  animate:flip={{ duration: flipDuration(), easing: easeOut }}
                >
                  {#if item.kind === "section"}
                    {item.label}
                  {:else}
                    {@const account = item.account}
                    {@const busy = rowBusy?.uuid === account.uuid}
                    {@const error = rowErrors[account.uuid]}
                    {@const inUse = isCurrent(account)}
                    <button
                      class="hit"
                      data-uuid={account.uuid}
                      tabindex={account.uuid === focusTarget ? 0 : -1}
                      aria-label={rowLabel(account)}
                      aria-keyshortcuts="Enter F Alt+ArrowUp Alt+ArrowDown Delete"
                      onclick={() => (focusUuid = account.uuid)}
                      ondblclick={() => login(account)}
                      onfocus={() => (focusUuid = account.uuid)}
                      onkeydown={(event) => rowKey(event, account)}
                    ></button>
                    <PlayerHead uuid={account.uuid} avatar={account.avatar} size={24} radius={5} lazy inWorld={false} />
                    <div class="grow">
                      <div class="name">{account.username}</div>
                      <div class="line">
                        {#if error}
                          <span class="mg-error-text">Couldn't log in · {error}</span>
                        {:else}
                          {typeWords(account.type)}{inUse ? " · In use" : ""}
                        {/if}
                      </div>
                    </div>
                    <div class="actions">
                      <button class="mg-pill quiet mg-glyph reveal" tabindex="-1" aria-label="Move {account.username} up" onclick={() => move(account, -1)}>↑</button>
                      <button class="mg-pill quiet mg-glyph reveal" tabindex="-1" aria-label="Move {account.username} down" onclick={() => move(account, 1)}>↓</button>
                      <button class="mg-pill quiet reveal" tabindex="-1" aria-label="Remove {account.username}" onclick={() => askRemove(account)}>Remove</button>
                      <button
                        class="mg-chip fav"
                        class:on={account.favorite}
                        class:reveal={!account.favorite}
                        tabindex="-1"
                        aria-pressed={account.favorite}
                        aria-label="{account.favorite ? 'Unfavorite' : 'Favorite'} {account.username}"
                        onclick={() => favorite(account)}
                      ><span aria-hidden="true">{account.favorite ? "★" : "☆"}</span>Favorite</button>
                      {#if busy}
                        <span class="mg-pill busy"><span class="mg-pulse">Logging in…</span></span>
                      {:else if inUse}
                        <span class="mg-chip">In use</span>
                      {:else}
                        <button class="mg-pill login" tabindex="-1" aria-label="Log into {account.username}" onclick={() => login(account)}>Log in</button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <footer class="mg-foot on-glass">
            <div class="mg-status" role="status" aria-live="polite">{status}</div>
            {#if !sheet && shown.length}
              <div class="mg-hints" aria-hidden="true">
                <span><Keycap>↵</Keycap>Log in</span>
                <span><Keycap>F</Keycap>Favorite</span>
                <span><Keycap>Alt ↑↓</Keycap>Move</span>
                <span><Keycap>Del</Keycap>Remove</span>
              </div>
            {/if}
          </footer>
        </div>

        {#if sheet}
          <aside class="mg-sheet glass deep" aria-labelledby="mg-sheet-title" in:slideIn={{ delay: 40 }} out:fadeOut>
            {#key sheet}
              <AddSheet
                flow={sheet}
                busy={!!job}
                {note}
                onrun={run}
                onrandom={randomName}
                onflow={(flow) => openSheet(flow)}
                onclose={closeSheet}
              />
            {/key}
          </aside>
        {/if}

        {#if removing}
          <ConfirmPopover
            title="Remove {removing.username}?"
            text="The account is deleted from LiquidBounce. This can't be undone."
            action="Remove"
            actionLabel="Confirm remove {removing.username}"
            placement="modal"
            width={340}
            onconfirm={confirmRemove}
            oncancel={cancelRemove}
          />
        {/if}
      </main>

      <div class="mg-bottom" in:rise={{ delay: 120 }}>
        <button class="glass mg-closer" aria-label="Close accounts" onclick={close}>×</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .fav { cursor: default; }
  .fav span { font-size: 12px; }
  .login { min-width: 56px; }
</style>
