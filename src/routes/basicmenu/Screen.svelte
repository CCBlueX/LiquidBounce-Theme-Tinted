<script lang="ts">
  import { onMount, tick } from "svelte";
  import { request } from "../../lib/api/client";
  import { on, onReconnect } from "../../lib/api/events";
  import { screen, session } from "../../lib/api/routes";
  import type { ActiveProxy, ScreenRoute, Session } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";

  // Basic mode leaves vanilla's title and multiplayer screens in charge; the theme only adds this pill in the top
  // right corner, where neither screen draws anything, with the client's own screens and the way back.

  let user = $state<Session | undefined>();
  let proxyOn = $state(false);
  let error = $state<string | undefined>();
  let pill: HTMLElement | undefined = $state();

  const loadProxy = () =>
    request<ActiveProxy | undefined>("GET", "/proxy").then((p) => (proxyOn = p !== undefined)).catch(() => {});
  const loadSession = () => session.get().then((s) => (user = s)).catch(() => {});

  onMount(() => {
    loadSession();
    loadProxy();
    tick().then(() => pill?.querySelector("button")?.focus());
  });

  $effect(() => on("session", ({ session: s }) => (user = s)));
  $effect(() => on("proxyCheckResult", () => loadProxy()));
  // Session and proxy changes sent while the event socket was down are lost
  $effect(() =>
    onReconnect(() => {
      loadSession();
      loadProxy();
    }),
  );

  async function open(route: ScreenRoute) {
    play("tap");
    error = undefined;
    try {
      await screen.open(route);
    } catch {
      error = "That screen did not open.";
      play("error");
    }
  }

  // POST /basic-mode flips the stored setting; the screen underneath is then opened again so the full theme takes it
  async function leaveBasicMode() {
    play("confirm");
    error = undefined;
    try {
      const current = await request<{ name: string }>("GET", "/screen").catch(() => undefined);
      await request("POST", "/basic-mode");
      await screen.open(current?.name === "multiplayer" ? "multiplayer" : "title");
    } catch {
      error = "The full interface did not open.";
      play("error");
    }
  }

  function key(event: KeyboardEvent) {
    const buttons = [...(pill?.querySelectorAll<HTMLElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(buttons.length - 1, index + step));
    if (next !== index) play("tap");
    buttons[next].focus();
  }
</script>

<div class="corner">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav class="pill glass on-glass" aria-label="LiquidBounce" bind:this={pill} onkeydown={key} in:rise={{ y: -8 }}>
    <h1 class="sr-only">LiquidBounce</h1>
    <button class="item with-head" onclick={() => open("altmanager")} aria-label="Accounts{user ? `, ${user.username}` : ''}">
      <PlayerHead uuid={user?.uuid} avatar={user?.avatar} size={16} radius={8} inWorld={false} />
      <span>{user?.username ?? "Accounts"}</span>
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button class="item" onclick={() => open("proxymanager")} aria-label="Proxy, {proxyOn ? 'on' : 'off'}">
      <span>Proxy</span><span class="l2 state">{proxyOn ? "On" : "Off"}</span>
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button class="item" onclick={() => open("clickgui")}>ClickGUI</button>
    <span class="divider" aria-hidden="true"></span>
    <button class="item" onclick={leaveBasicMode}>Full interface</button>
  </nav>
  {#if error}<p class="error glass t-footnote on-glass" role="alert">{error}</p>{/if}
</div>

<style>
  .corner { position: absolute; top: 16px; right: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .pill { display: flex; align-items: center; gap: 2px; height: 36px; padding: 0 3px; border-radius: 18px; }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    border-radius: 15px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease);
  }
  .item.with-head { padding-left: 7px; gap: 7px; }
  .item:hover { background: var(--fill); }
  .item:active { transform: scale(0.97); }
  .state { font-weight: 400; }
  .divider { width: 0.5px; height: 18px; background: var(--line); flex: none; }
  .error { padding: 6px 12px; border-radius: 14px; color: var(--label); }
</style>
