<script lang="ts">
  import { onMount } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { player, session } from "../../lib/api/routes";
  import type { PlayerData, Protocol, Session } from "../../lib/api/types";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";

  // Vanilla's pause menu keeps the centre column and every one of its buttons; this panel sits at the left edge with
  // what vanilla does not show: who and where the player is, and the game version in use.

  let user = $state<Session | undefined>();
  let me = $state<PlayerData | undefined>();
  let protocol = $state<Protocol | undefined>();
  // The panel waits for its lines so it arrives at its final height; a silent client only delays it this long
  const READY_WAIT_MS = 800;
  let ready = $state(false);

  onMount(() => {
    const wait = setTimeout(() => (ready = true), READY_WAIT_MS);
    Promise.allSettled([
      session.get().then((s) => (user = s)),
      player.data().then((p) => (me = p ?? undefined)),
      request<Protocol>("GET", "/protocols/protocol").then((p) => (protocol = p)),
    ]).then(() => (ready = true));
    return () => clearTimeout(wait);
  });

  $effect(() => on("session", ({ session: s }) => (user = s)));
  $effect(() => on("gameModeChange", ({ gameMode }) => me && gameMode && (me = { ...me, gameMode })));

  function words(id: string) {
    const path = id.slice(id.indexOf(":") + 1).replace(/^the_/, "");
    return path.charAt(0).toUpperCase() + path.slice(1).replaceAll("_", " ");
  }

  const place = $derived(me ? `${words(me.gameMode)} · ${words(me.dimension)}` : undefined);
</script>

{#if ready}
  <aside class="panel glass on-glass" aria-label="Game menu extras">
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
</style>
