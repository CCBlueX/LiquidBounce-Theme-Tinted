<script lang="ts">
  import { onMount, tick } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { player, screen, session } from "../../lib/api/routes";
  import type { PlayerData, Protocol, Session } from "../../lib/api/types";
  import { bindLabel } from "../../lib/keys";
  import { isOn, startModules } from "../../lib/moduleToggles.svelte";
  import { moduleStore } from "../../lib/modules.svelte";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import Keycap from "../../lib/ui/Keycap.svelte";
  import ModuleSwitchList from "../../lib/ui/ModuleSwitchList.svelte";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";
  import Switch from "../../lib/ui/Switch.svelte";

  // Vanilla's pause menu keeps the centre column and every one of its buttons; this panel sits at the left edge with
  // what vanilla does not have: who and where the player is, the modules that are on, and the way into ClickGUI.

  let user = $state<Session | undefined>();
  let me = $state<PlayerData | undefined>();
  let protocol = $state<Protocol | undefined>();
  let failed = $state(false);
  // The panel waits for its rows and version so it arrives at its final height; a silent client only delays it this long
  const READY_WAIT_MS = 800;
  let protocolDone = $state(false);
  let waited = $state(false);

  // Modules switched off here stay in the list, so the same panel can switch them back on
  let kept = $state<string[]>([]);
  let switches: ModuleSwitchList | undefined = $state();
  let openButton: HTMLButtonElement | undefined = $state();
  let focused = false;

  onMount(() => {
    const stop = startModules();
    session.get().then((s) => (user = s)).catch(() => {});
    player.data().then((p) => (me = p ?? undefined)).catch(() => {});
    request<Protocol>("GET", "/protocols/protocol")
      .then((p) => (protocol = p))
      .catch(() => {})
      .finally(() => (protocolDone = true));
    const wait = setTimeout(() => (waited = true), READY_WAIT_MS);
    return () => {
      clearTimeout(wait);
      stop();
    };
  });

  $effect(() => on("session", ({ session: s }) => (user = s)));
  $effect(() => on("gameModeChange", ({ gameMode }) => me && gameMode && (me = { ...me, gameMode })));

  const rows = $derived(
    moduleStore.list
      .filter((module) => (module.enabled && !module.hidden) || kept.includes(module.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const onCount = $derived(rows.filter((module) => isOn(module)).length);
  const clickGuiKey = $derived(bindLabel(moduleStore.byName.get("ClickGUI")?.keyBind));
  const loaded = $derived(moduleStore.list.length > 0);
  const ready = $derived((loaded && protocolDone) || waited);

  // Arrow keys work without a Tab first: the first switch takes focus once the list arrives, else Open ClickGUI
  $effect(() => {
    if (focused || !loaded || !ready) return;
    focused = true;
    tick().then(() => {
      if (document.activeElement !== document.body) return;
      if (switches) switches.focus();
      else openButton?.focus();
    });
  });

  function keep(name: string) {
    if (!kept.includes(name)) kept = [...kept, name];
  }

  function words(id: string) {
    const path = id.slice(id.indexOf(":") + 1).replace(/^the_/, "");
    return path.charAt(0).toUpperCase() + path.slice(1).replaceAll("_", " ");
  }

  const place = $derived(me ? `${words(me.gameMode)} · ${words(me.dimension)}` : undefined);

  async function openClickGui() {
    play("tap");
    try {
      await screen.open("clickgui");
    } catch {
      failed = true;
      play("error");
    }
  }
</script>

{#if ready}
  <aside class="panel glass on-glass" aria-label="Game menu extras" in:rise>
    <h1 class="sr-only">Game menu</h1>
    <header class="who">
      <PlayerHead uuid={user?.uuid} avatar={user?.avatar} size={24} radius={12} />
      <div class="grow">
        <div class="t-headline name">{user?.username ?? me?.username ?? "Player"}</div>
        {#if place}<div class="t-footnote l2">{place}</div>{/if}
      </div>
    </header>

    {#if protocol}
      <div class="group facts">
        <div class="fact">
          <span class="l2">Version</span>
          <span class="num">Minecraft {protocol.name}</span>
        </div>
      </div>
    {/if}

    <section class="modules" aria-labelledby="modules-title">
      <div class="section-head">
        <h2 id="modules-title" class="t-footnote">Modules</h2>
        {#if rows.length}<span class="t-footnote l2 num">{onCount} on</span>{/if}
      </div>

      {#if rows.length}
        <div class="group list">
          <ModuleSwitchList modules={rows} label="Modules that are on" ontoggle={keep} bind:this={switches}>
            {#snippet row(module, toggle)}
              {@const key = bindLabel(module.keyBind)}
              {@const active = isOn(module)}
              <div class="row" class:off={!active} role="listitem">
                <span class="row-name">{module.name}</span>
                {#if key}<span class="bind" aria-hidden="true"><Keycap>{key}</Keycap></span>{/if}
                <Switch small checked={active} label="{module.name}{key ? `, bound to ${key}` : ''}" onchange={toggle} />
              </div>
            {/snippet}
          </ModuleSwitchList>
        </div>
      {:else}
        <p class="empty t-callout l2">{loaded ? "No modules are on." : "Loading modules"}</p>
      {/if}
    </section>
    <button class="open" bind:this={openButton} onclick={openClickGui} aria-keyshortcuts={clickGuiKey ?? undefined}>
      <span class="grow">Open ClickGUI</span>
      {#if clickGuiKey}<Keycap>{clickGuiKey}</Keycap>{/if}
    </button>
    {#if failed}<p class="error t-footnote" role="alert">ClickGUI did not open. Its key still works.</p>{/if}
  </aside>
{/if}

<style>
  /* Clear of the pause column: it starts at 460 of 1600 at GUI scale 4 and further in below that */
  .panel {
    position: absolute;
    left: 32px;
    top: 50%;
    translate: 0 -50%;
    width: 260px;
    max-height: calc(100% - 64px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: var(--r-pane);
  }
  .who { display: flex; align-items: center; gap: 10px; padding: 2px 4px 0; }
  .grow { flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .facts { padding: 0 10px; }
  .fact { display: flex; align-items: center; justify-content: space-between; height: 32px; font-size: 13px; }

  .modules { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px; }
  h2 { font-weight: 600; color: var(--label-2); }
  .list { padding: 2px; overflow-y: auto; min-height: 0; scrollbar-width: none; }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 10px;
    border-radius: var(--r-control);
    transition: background-color var(--t-pop) var(--ease);
  }
  .row:hover { background: var(--fill); }
  .row:has(:focus-visible) { background: var(--fill); }
  .row-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row.off .row-name { color: var(--label-2); }
  .bind { display: inline-flex; }
  .empty { padding: 8px 4px; }

  .open {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 12px;
    border-radius: var(--r-group);
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    flex: none;
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .open:hover { background: var(--fill-2); }
  .open:active { transform: scale(0.98); }
  .error { color: var(--label); padding: 0 4px; margin-top: -4px; }
</style>
