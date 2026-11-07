<script lang="ts">
  import "./manager.css";
  import { onMount } from "svelte";
  import { request } from "../api/client";
  import { on, onReconnect } from "../api/events";
  import { accounts as accountsApi, screen, session } from "../api/routes";
  import type { Account, ActiveProxy, ProxyEntry, Session } from "../api/types";
  import { play } from "../sound";
  import PlayerHead from "./PlayerHead.svelte";
  import PopoverMenu from "./PopoverMenu.svelte";

  // The current account and proxy as two pills, each a menu that switches it in place or opens its manager. The client
  // opens a manager over the screen it came from and returns there when it closes.
  //
  // /proxies and /proxy carry passwords in plain text; every proxy is cut down to a row the moment it arrives.

  type ProxyRow = { id: number; host: string; port: number; username: string; favorite: boolean; place: string };

  const LOGIN_WAIT_MS = 30_000;
  const ERROR_SHOWN_MS = 6000;

  let user = $state<Session>();
  let accountList = $state<Account[]>([]);
  let proxyList = $state<ProxyRow[]>([]);
  let proxy = $state<ProxyRow>();
  let busy = $state<string>();
  let failed = $state(false);
  let status = $state("");
  let loginTimer: number | undefined;
  let errorTimer: number | undefined;

  function toRow(p: ProxyEntry | ActiveProxy): ProxyRow {
    const place = [p.ipInfo?.city, p.ipInfo?.country].filter(Boolean).join(", ");
    return { id: p.id, host: p.host, port: p.port, username: p.credentials?.username ?? "", favorite: p.favorite, place };
  }

  const keyOf = (p: ProxyRow) => `${p.host}:${p.port}:${p.username}`;
  const address = (p: ProxyRow) => `${p.host}:${p.port}`;
  const isCurrent = (a: Account) => !!user && a.uuid === user.uuid && a.username === user.username;
  const isActive = (p: ProxyRow) => !!proxy && keyOf(proxy) === keyOf(p);

  const loadSession = () => session.get().then((s) => (user = s)).catch(() => {});
  const loadAccounts = () => accountsApi.list().then((list) => (accountList = list)).catch(() => {});
  const loadProxy = () =>
    request<ActiveProxy | undefined>("GET", "/proxy").then((p) => (proxy = p ? toRow(p) : undefined)).catch(() => {});
  const loadProxies = () =>
    request<ProxyEntry[]>("GET", "/proxies").then((list) => (proxyList = list.map(toRow))).catch(() => {});

  function loadAll() {
    loadSession();
    loadAccounts();
    loadProxy();
    loadProxies();
  }

  onMount(() => {
    loadAll();
    return () => {
      clearTimeout(loginTimer);
      clearTimeout(errorTimer);
    };
  });

  $effect(() => on("session", ({ session: s }) => (user = s)));
  $effect(() => on("accountManagerLogin", finishLogin));
  $effect(() =>
    on("proxyCheckResult", () => {
      loadProxy();
      loadProxies();
    }),
  );
  $effect(() => onReconnect(loadAll));

  const accountsShown = $derived([...accountList.filter((a) => a.favorite), ...accountList.filter((a) => !a.favorite)]);
  const proxiesShown = $derived([...proxyList.filter((p) => p.favorite), ...proxyList.filter((p) => !p.favorite)]);
  const cracked = $derived(user ? user.type === "legacy" || !user.online : false);
  const accountNote = $derived(busy ? "Logging in…" : failed ? "Login failed" : cracked ? "Cracked" : undefined);

  function typeWords(type: string) {
    return { Cracked: "Cracked", Microsoft: "Microsoft", Session: "Session token", TheAltening: "The Altening" }[type] ?? type;
  }

  async function login(account: Account) {
    if (isCurrent(account) || busy) return;
    play("tap");
    busy = account.uuid;
    failed = false;
    status = `Logging in as ${account.username}`;
    clearTimeout(loginTimer);
    loginTimer = window.setTimeout(() => finishLogin({ error: "The client did not answer." }), LOGIN_WAIT_MS);
    try {
      await accountsApi.login(account.id);
    } catch {
      finishLogin({ error: "The client refused the login." });
    }
  }

  function finishLogin(event: { username?: string; error?: string }) {
    if (!busy) return;
    clearTimeout(loginTimer);
    busy = undefined;
    if (event.error) {
      play("error");
      failed = true;
      status = `Login failed. ${event.error}`;
      clearTimeout(errorTimer);
      errorTimer = window.setTimeout(() => (failed = false), ERROR_SHOWN_MS);
      return;
    }
    play("confirm");
    status = `Logged in as ${event.username ?? "the account"}`;
    loadSession();
  }

  async function useProxy(row: ProxyRow | undefined) {
    if (row ? isActive(row) : !proxy) return;
    try {
      if (row) await request("POST", "/proxy", { body: { id: row.id } });
      else await request("DELETE", "/proxy");
      play("confirm");
      status = row ? `Using ${address(row)} for new connections` : "Proxy off. New connections go straight to the server";
    } catch {
      play("error");
      status = "The proxy could not be changed";
    }
    await loadProxy();
  }

  async function manage(route: "altmanager" | "proxymanager") {
    play("tap");
    try {
      await screen.open(route);
    } catch {
      play("error");
    }
  }
</script>

<PopoverMenu label="Switch account" class="mg-pop glass deep on-glass session-menu">
  {#snippet trigger(props)}
    <button
      class="menu-pill glass with-head"
      data-pill
      {...props}
      aria-label="Account, {user?.username ?? 'unknown'}{accountNote ? `, ${accountNote}` : ''}"
      onclick={loadAccounts}
    >
      <PlayerHead uuid={user?.uuid} avatar={user?.avatar} size={16} radius={8} inWorld={false} />
      <span class="name">{user?.username ?? "Accounts"}</span>
      {#if accountNote}<span class="l3 quiet" class:mg-pulse={busy}>{accountNote}</span>{/if}
      <span class="chev" aria-hidden="true">⌄</span>
    </button>
  {/snippet}
  {#snippet children(pick)}
    {#if accountsShown.length}
      <div class="group-label" aria-hidden="true">Accounts</div>
      {#each accountsShown as account (account.id)}
        {@const current = isCurrent(account)}
        <button
          class="mg-item"
          role="menuitemradio"
          aria-checked={current}
          tabindex="-1"
          aria-label="{account.username}, {typeWords(account.type)}{account.favorite ? ', favorite' : ''}"
          onclick={() => pick(() => login(account))}
        >
          <PlayerHead uuid={account.uuid} avatar={account.avatar} size={24} radius={5} lazy inWorld={false} />
          <span class="grow"><span class="label">{account.username}</span><span>{typeWords(account.type)}{account.favorite ? " · ★" : ""}</span></span>
          <span class="check" aria-hidden="true">{current ? "✓" : ""}</span>
        </button>
      {/each}
      <hr />
    {/if}
    <button class="mg-item" role="menuitem" tabindex="-1" onclick={() => pick(() => manage("altmanager"))}>
      <span class="grow"><span class="label">Manage accounts</span><span>Add, sign in and sort accounts</span></span>
    </button>
  {/snippet}
</PopoverMenu>

<PopoverMenu label="Proxy" class="mg-pop glass deep on-glass session-menu">
  {#snippet trigger(props)}
    <button class="menu-pill glass" data-pill {...props} aria-label="Proxy, {proxy ? address(proxy) : 'off'}" onclick={loadProxies}>
      <span>Proxy</span><span class="l3 quiet num">{proxy ? address(proxy) : "Off"}</span>
      <span class="chev" aria-hidden="true">⌄</span>
    </button>
  {/snippet}
  {#snippet children(pick)}
    <button class="mg-item" role="menuitemradio" aria-checked={!proxy} tabindex="-1" onclick={() => pick(() => useProxy(undefined))}>
      <span class="grow"><span class="label">Off</span><span>Connect straight to servers</span></span>
      <span class="check" aria-hidden="true">{proxy ? "" : "✓"}</span>
    </button>
    {#each proxiesShown as row (row.id)}
      {@const active = isActive(row)}
      <button
        class="mg-item"
        role="menuitemradio"
        aria-checked={active}
        tabindex="-1"
        aria-label="{address(row)}{row.place ? `, ${row.place}` : ''}{row.favorite ? ', favorite' : ''}"
        onclick={() => pick(() => useProxy(row))}
      >
        <span class="grow">
          <span class="label num">{address(row)}</span>
          <span>{row.place || (row.username ? `As ${row.username}` : "Saved proxy")}{row.favorite ? " · ★" : ""}</span>
        </span>
        <span class="check" aria-hidden="true">{active ? "✓" : ""}</span>
      </button>
    {/each}
    <hr />
    <button class="mg-item" role="menuitem" tabindex="-1" onclick={() => pick(() => manage("proxymanager"))}>
      <span class="grow"><span class="label">Manage proxies</span><span>Add, check and edit proxies</span></span>
    </button>
  {/snippet}
</PopoverMenu>

<span class="sr-only" role="status" aria-live="polite">{status}</span>

<style>
  .name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
  .chev { flex: none; font-size: 12px; color: var(--label-2); margin: -4px -2px 0 -2px; }
  .check { flex: none; width: 14px; text-align: center; font-size: 12px; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Pills sit at the left of their row or in its middle, so the menu opens from the pill's left edge, above the pill
     when there is no room below */
  :global(.mg-pop.session-menu) {
    left: anchor(left);
    right: auto;
    width: 260px;
    max-height: 340px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.25) transparent;
    position-try-fallbacks: flip-block, flip-inline;
  }
</style>
