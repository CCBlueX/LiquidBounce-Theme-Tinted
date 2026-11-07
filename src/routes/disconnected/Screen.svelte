<script lang="ts">
  import { onMount, tick } from "svelte";
  import { reasonOf, request } from "../../lib/api/client";
  import { servers, worlds } from "../../lib/api/routes";
  import type { Server, ServerData, World } from "../../lib/api/types";
  import { capitalize, relativeTime } from "../../lib/format";
  import { rise } from "../../lib/motion";
  import { livePings } from "../../lib/pings.svelte";
  import { play } from "../../lib/sound";
  import Base64Icon from "../../lib/ui/Base64Icon.svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";

  // Vanilla keeps its title, reason and 'Back to server list' button around the middle. This card sits in the lower
  // third with the ways back in: reconnect, the top of the server list, the latest world. The client does not tell the
  // page why the connection ended, so the card never says.
  const SHOWN = 3;

  let list = $state<Server[] | undefined>();
  const pings = livePings();
  let world = $state<World | undefined>();
  let error = $state<string | undefined>();
  let busy = $state<string | undefined>();
  let reconnectButton: HTMLButtonElement | undefined = $state();

  onMount(() => {
    tick().then(() => reconnectButton?.focus());
    servers.list().then((all) => (list = all.slice(0, SHOWN))).catch(() => (list = []));
    worlds.list().then((all) => (world = [...all].sort((a, b) => b.lastPlayed - a.lastPlayed)[0])).catch(() => {});
  });

  const shown = $derived((list ?? []).map((server) => ({ ...server, ...pings.current[server.address], id: server.id })));

  function status(server: ServerData) {
    switch (server.status) {
      case "SUCCESSFUL": {
        const online = server.players.online ?? 0;
        return `${online.toLocaleString("en-US")} ${online === 1 ? "player" : "players"} · ${server.ping} ms`;
      }
      case "UNREACHABLE":
        return "Can't reach";
      case "INCOMPATIBLE":
        return "Other version";
      default:
        return "Checking";
    }
  }

  async function run(id: string, action: () => Promise<unknown>, failure: (reason: string) => string) {
    if (busy) return;
    busy = id;
    error = undefined;
    play("confirm");
    try {
      await action();
    } catch (cause) {
      error = failure(reasonOf(cause));
      play("error");
    } finally {
      busy = undefined;
    }
  }

  const reconnect = () =>
    run("reconnect", () => request("POST", "/reconnect"), (reason) =>
      /no known last server/i.test(reason) ? "No server to reconnect to." : "Reconnecting did not start. Try a server below.",
    );
  const join = (server: Server) => run(`server-${server.id}`, () => servers.join(server.address), () => `${server.name} did not start connecting.`);
  const playWorld = (target: World) => run("world", () => worlds.join(target.name), () => `${target.displayName} did not open.`);
</script>

<section class="card glass on-glass" aria-labelledby="disconnected-title" in:rise={{ delay: 80 }}>
  <h1 id="disconnected-title" class="sr-only">Play again</h1>
  <div class="top">
    <button class="primary" bind:this={reconnectButton} onclick={reconnect} disabled={busy === "reconnect"} aria-describedby={error ? "reconnect-error" : undefined}>
      Reconnect
    </button>
    {#if error}
      <p id="reconnect-error" class="error t-callout" role="alert"><span class="mark" aria-hidden="true">!</span>{error}</p>
    {/if}
  </div>

  {#if shown.length || world}
    <div class="columns">
      {#if shown.length}
        <div class="column">
          <h2 class="t-footnote">Servers</h2>
          <ul class="group">
            {#each shown as server (server.id)}
              <li class="row">
                <span class="icon">
                  <Base64Icon icon={server.icon} size={32}>
                    {#snippet fallback()}<ItemIcon id="minecraft:compass" size={32} />{/snippet}
                  </Base64Icon>
                </span>
                <div class="text">
                  <span class="name">{server.name}</span>
                  <span class="sub t-footnote num">{status(server)}</span>
                </div>
                <button class="small" onclick={() => join(server)} disabled={busy !== undefined} aria-label="Join {server.name}">Join</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if world}
        <div class="column">
          <h2 class="t-footnote">Singleplayer</h2>
          <ul class="group">
            <li class="row">
              <span class="icon">
                <Base64Icon icon={world.icon} size={32} smooth>
                  {#snippet fallback()}<ItemIcon id="minecraft:grass_block" size={32} />{/snippet}
                </Base64Icon>
              </span>
              <div class="text">
                <span class="name">{world.displayName}</span>
                <span class="sub t-footnote num">{capitalize(world.gameMode)}{world.hardcore ? " · Hardcore" : ""} · {relativeTime(world.lastPlayed)}</span>
              </div>
              <button class="small" onclick={() => world && playWorld(world)} disabled={busy !== undefined} aria-label="Play {world.displayName}">Play</button>
            </li>
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Lower third only: vanilla's text and button end around 63% of the height at GUI scale 4 */
  .card {
    position: absolute;
    left: 50%;
    bottom: 32px;
    translate: -50% 0;
    width: 640px;
    max-width: calc(100% - 64px);
    padding: 16px;
    border-radius: var(--r-pane);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .top { display: flex; align-items: center; gap: 12px; min-height: 30px; }
  .primary {
    flex: none;
    height: 30px;
    padding: 0 16px;
    border-radius: 15px;
    background: var(--accent-fill);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    text-shadow: none;
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .primary:hover { background: var(--accent-strong); }
  .primary:active { transform: scale(0.97); }
  .primary:disabled { opacity: 0.6; }
  .error { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .mark {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--negative);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    text-shadow: none;
  }

  .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .column { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  h2 { font-weight: 600; color: var(--label-2); padding: 0 4px; }
  ul { list-style: none; padding: 2px; }
  .row { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 6px; border-radius: var(--r-control); }
  .icon { width: 32px; height: 32px; border-radius: 6px; overflow: hidden; flex: none; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: 13px; line-height: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .small {
    flex: none;
    height: 26px;
    padding: 0 12px;
    border-radius: 13px;
    background: var(--fill-2);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 13px;
    font-weight: 600;
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .small:hover { background: var(--fill-3); }
  .small:active { transform: scale(0.96); }
  .small:disabled { opacity: 0.6; }
</style>
