<script lang="ts">
  import { onMount, tick } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { client, screen, servers, session, worlds } from "../../lib/api/routes";
  import type { ActiveProxy, ClientInfo, Protocol, ScreenRoute, Server, Session, World } from "../../lib/api/types";
  import { capitalize, relativeTime } from "../../lib/format";
  import { rise } from "../../lib/motion";
  import { livePings } from "../../lib/pings.svelte";
  import { play } from "../../lib/sound";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";

  let world = $state<World | undefined>();
  let worldsLoaded = $state(false);
  let serverList = $state<Server[] | undefined>();
  const pings = livePings();
  let user = $state<Session | undefined>();
  let proxy = $state<ActiveProxy | undefined>();
  let info = $state<ClientInfo | undefined>();
  let protocol = $state<Protocol | undefined>();
  let ready = $state(false);
  let quitOpen = $state(false);

  const rowEls: HTMLElement[] = [];
  const pillEls: HTMLElement[] = [];
  $effect(() => {
    if (quitButton) pillEls[3] = quitButton;
  });

  onMount(() => {
    ready = true;
    worlds.list().then((list) => {
      world = [...list].sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
    }).catch(() => (world = undefined)).finally(() => (worldsLoaded = true));
    servers.list().then((list) => (serverList = list)).catch(() => (serverList = []));
    session.get().then((s) => (user = s)).catch(() => {});
    request<ActiveProxy | undefined>("GET", "/proxy").then((p) => (proxy = p ?? undefined)).catch(() => {});
    client.info().then((i) => (info = i)).catch(() => {});
    request<Protocol>("GET", "/protocols/protocol").then((p) => (protocol = p)).catch(() => {});
    tick().then(() => rowEls[0]?.focus({ preventScroll: true }));
  });

  $effect(() => on("session", ({ session: s }) => (user = s)));

  $effect(() => on("proxyCheckResult", () => {
    request<ActiveProxy | undefined>("GET", "/proxy").then((p) => (proxy = p ?? undefined)).catch(() => {});
  }));

  const known = $derived((serverList ?? []).map((s) => pings.current[s.address] ?? s));
  const reachable = $derived(known.filter((s) => s.status === "SUCCESSFUL"));
  const playersOnline = $derived(reachable.reduce((sum, s) => sum + (s.players.online ?? 0), 0));
  const pinging = $derived(known.some((s) => s.status === "INITIAL" || s.status === "PINGING"));

  const multiplayerLine = $derived.by(() => {
    if (!serverList) return "Loading servers";
    const total = serverList.length;
    if (total === 0) return "No servers added";
    const servers = `${total} ${total === 1 ? "server" : "servers"}`;
    if (reachable.length === 0) return pinging ? `${servers} · Checking` : `${servers} · None reachable`;
    const players = `${playersOnline.toLocaleString("en-US")} ${playersOnline === 1 ? "player" : "players"} online`;
    return `${reachable.length} of ${servers} online · ${players}`;
  });

  const singleplayerLine = $derived(
    !worldsLoaded ? "Loading worlds" : world ? `${world.gameMode ? capitalize(world.gameMode) : "Survival"}${world.hardcore ? " · Hardcore" : ""} · ${relativeTime(world.lastPlayed)}` : "Create a world",
  );

  const cracked = $derived(user ? user.type === "legacy" || !user.online : false);
  const proxyLabel = $derived(proxy ? `${proxy.host}:${proxy.port}` : "Off");

  async function open(route: ScreenRoute) {
    play("tap");
    try {
      await screen.open(route);
    } catch {
      play("error");
    }
  }

  async function joinWorld(event: Event) {
    event.stopPropagation();
    if (!world) return;
    play("confirm");
    try {
      await worlds.join(world.name);
    } catch {
      play("error");
    }
  }

  type Row = { route: ScreenRoute; key: string };
  const rows: Row[] = [
    { route: "singleplayer", key: "1" },
    { route: "multiplayer", key: "2" },
    { route: "multiplayer_realms", key: "3" },
  ];

  function focusRow(index: number) {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    if (document.activeElement !== rowEls[next]) play("tap");
    rowEls[next]?.focus();
  }

  function focusPill(index: number) {
    const next = Math.max(0, Math.min(pillEls.length - 1, index));
    if (document.activeElement !== pillEls[next]) play("tap");
    pillEls[next]?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (quitOpen || event.altKey || event.ctrlKey || event.metaKey) return;
    const active = document.activeElement as HTMLElement | null;
    const row = rowEls.indexOf(active as HTMLElement);
    const pill = pillEls.indexOf(active as HTMLElement);
    const inPlay = active?.classList.contains("play") ?? false;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (inPlay) focusRow(1);
        else if (row === rows.length - 1) focusPill(0);
        else if (row >= 0) focusRow(row + 1);
        else if (pill < 0) focusRow(0);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (pill >= 0) focusRow(rows.length - 1);
        else if (row > 0) focusRow(row - 1);
        else if (row < 0 && !inPlay) focusRow(0);
        break;
      case "ArrowRight":
        if (pill >= 0) {
          event.preventDefault();
          focusPill(pill + 1);
        } else if (row === 0 && playButton) {
          event.preventDefault();
          play("tap");
          playButton.focus();
        }
        break;
      case "ArrowLeft":
        if (pill >= 0) {
          event.preventDefault();
          focusPill(pill - 1);
        } else if (inPlay) {
          event.preventDefault();
          focusRow(0);
        }
        break;
      case "1":
      case "2":
      case "3":
        event.preventDefault();
        focusRow(Number(event.key) - 1);
        break;
    }
  }

  let playButton = $state<HTMLButtonElement | undefined>();
  let quitButton = $state<HTMLButtonElement | undefined>();

  function toggleQuit() {
    if (quitOpen) return closeQuit();
    play("open");
    quitOpen = true;
  }

  function closeQuit() {
    play("close");
    quitOpen = false;
    quitButton?.focus();
  }

  async function quit() {
    play("confirm");
    try {
      await client.exit();
    } catch {
      play("error");
      quitOpen = false;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<main class="title">
  <h1 class="logo"><img src="img/lb-logo.svg" alt="LiquidBounce" /></h1>

  {#if ready}
    <nav class="stack" aria-label="Main menu">
      <div class="row-wrap" in:rise={{ delay: 0 }}>
        <div
          class="row glass"
          role="button"
          tabindex="0"
          bind:this={rowEls[0]}
          aria-keyshortcuts="1"
          aria-label="Singleplayer, {world ? `${world.displayName}, ${singleplayerLine}` : singleplayerLine}"
          onclick={() => open("singleplayer")}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), open("singleplayer"))}
        >
          <div class="grow">
            <div class="t-headline on-glass">Singleplayer</div>
            <div class="t-callout sub num on-glass">
              {#if world}<span class="world-name">{world.displayName}</span><span class="sep">·</span>{/if}<span class="meta">{singleplayerLine}</span>
            </div>
          </div>
          {#if world}
            <button class="play" bind:this={playButton} aria-label="Play {world.displayName}" onclick={joinWorld}>Play</button>
          {/if}
          <span class="chev" aria-hidden="true">›</span>
        </div>
      </div>

      <div class="row-wrap" in:rise={{ delay: 40 }}>
        <div
          class="row glass"
          role="button"
          tabindex="0"
          bind:this={rowEls[1]}
          aria-keyshortcuts="2"
          aria-label="Multiplayer, {multiplayerLine}"
          onclick={() => open("multiplayer")}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open("multiplayer"))}
        >
          <div class="grow">
            <div class="t-headline on-glass">Multiplayer</div>
            <div class="t-callout sub num on-glass">{multiplayerLine}</div>
          </div>
          <span class="chev" aria-hidden="true">›</span>
        </div>
      </div>

      <div class="row-wrap" in:rise={{ delay: 80 }}>
        <div
          class="row glass"
          role="button"
          tabindex="0"
          bind:this={rowEls[2]}
          aria-keyshortcuts="3"
          aria-label="Realms, worlds hosted by Mojang"
          onclick={() => open("multiplayer_realms")}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open("multiplayer_realms"))}
        >
          <div class="grow">
            <div class="t-headline on-glass">Realms</div>
            <div class="t-callout sub on-glass">Worlds hosted by Mojang</div>
          </div>
          <span class="chev" aria-hidden="true">›</span>
        </div>
      </div>

      <div class="secondary" in:rise={{ delay: 120 }} role="group" aria-label="More">
        <button
          class="pill glass with-head"
          bind:this={pillEls[0]}
          aria-label="Accounts, {user?.username ?? ''}{cracked ? ', cracked' : ''}"
          onclick={() => open("altmanager")}
        >
          <PlayerHead uuid={user?.uuid} size={24} radius={12} inWorld={false} />
          <span>{user?.username ?? "Accounts"}</span>
          {#if cracked}<span class="l3 quiet">Cracked</span>{/if}
        </button>
        <button class="pill glass" bind:this={pillEls[1]} aria-label="Proxy, {proxy ? proxyLabel : 'off'}" onclick={() => open("proxymanager")}>
          <span>Proxy</span><span class="l3 quiet num">{proxyLabel}</span>
        </button>
        <button class="pill glass" bind:this={pillEls[2]} onclick={() => open("options")}>Options</button>
        <div class="quit-anchor">
          <button
            class="pill glass"
            bind:this={quitButton}
            aria-haspopup="dialog"
            aria-expanded={quitOpen}
            onclick={toggleQuit}
          >Quit</button>
          {#if quitOpen}
            <ConfirmPopover
              title="Quit Minecraft?"
              action="Quit"
              tone="primary"
              initialFocus="cancel"
              width={240}
              anchor={quitButton}
              onconfirm={quit}
              oncancel={closeQuit}
            />
          {/if}
        </div>
      </div>
    </nav>
  {/if}

  {#if info}
    <div class="version glass num on-glass">
      {info.clientName} {info.clientVersion} · {info.gameVersion}{#if protocol} · Minecraft {protocol.name}{/if}
    </div>
  {/if}
</main>

<style>
  .title { position: absolute; inset: 0; font-family: Inter, system-ui, sans-serif; color: var(--label); }
  .logo { position: absolute; left: 48px; top: 44px; height: 32px; }
  .logo img { height: 32px; display: block; }

  .stack { position: absolute; left: 50%; top: 50%; width: 360px; transform: translate(-50%, -50%); margin-top: 16px; }
  .row-wrap + .row-wrap { margin-top: 8px; }
  .row {
    display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 16px; border-radius: var(--r-card);
    cursor: default; outline: none;
    transition: transform var(--t-press) var(--ease), background-color var(--t-pop) var(--ease);
  }
  .row:hover { background: var(--sheen), var(--fill), var(--glass); }
  .row:active { transform: scale(0.98); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .grow { flex: 1; min-width: 0; }
  .sub { display: flex; color: var(--label-2); white-space: nowrap; min-width: 0; }
  .sub, .row .t-headline { line-height: 18px; }
  .world-name { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .sep { flex: none; padding: 0 0.3em; }
  .meta { flex: none; }
  .sub:not(:has(.meta)) { overflow: hidden; text-overflow: ellipsis; }
  .chev { color: var(--label-3); font-size: 20px; line-height: 20px; }

  .play {
    flex: none; height: 26px; padding: 0 12px; border: 0; border-radius: 13px; font: inherit; font-size: 13px; font-weight: 600;
    color: #fff; background: var(--accent-fill); cursor: default; transition: transform var(--t-press) var(--ease), background var(--t-pop);
  }
  .play:hover { background: var(--accent-strong); }
  .play:active { transform: scale(0.96); }
  .play:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .secondary { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: 15px;
    font: inherit; font-size: 13px; font-weight: 500; color: var(--label); cursor: default; white-space: nowrap;
    text-shadow: var(--text-shadow); transition: transform var(--t-press) var(--ease);
  }
  .pill:active { transform: scale(0.98); }
  .pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pill.with-head { padding-left: 3px; }
  .quiet { font-weight: 400; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

  .quit-anchor { position: relative; }

  .version {
    position: absolute; right: 32px; bottom: 28px; display: flex; align-items: center; height: 26px; padding: 0 10px;
    border-radius: 999px; font-size: 12px; line-height: 16px; color: var(--label-2);
  }
</style>
