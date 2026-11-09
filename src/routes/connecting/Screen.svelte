<script lang="ts">
  import { onMount } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { client, session } from "../../lib/api/routes";
  import { connectingTo } from "../../lib/api/screen";
  import type { ActiveProxy, ConnectionDetails, Session } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";

  // Vanilla keeps its status line and Cancel button; this card says who joins where and how: the account, the server
  // and whether the connection goes through a proxy. It goes where vanilla draws nothing at the current GUI scale.

  let details = $state<ConnectionDetails>();
  let user = $state<Session>();
  let proxyPlace = $state<string>();
  let proxied = $state<boolean>();
  // The client names the server once the socket is open; until then, the one the page joined
  const joined = connectingTo();
  let scaledHeight = $state<number>();
  let stageHeight = $state(0);

  const measure = () => client.window().then((info) => (scaledHeight = info.scaledHeight)).catch(() => {});

  // Heights in canvas pixels, fixed in the styles below so the slot can be picked before the card exists
  const FULL = 56;
  const COMPACT = 28;
  const GAP = 12;
  const EDGE = 12;
  const ROOM = 32;

  // Vanilla draws the status at height / 2 - 50 (the client moves it 30 up) and Cancel, 20 tall, at height / 4 + 132.
  // Below both is the first choice, so a refused join hands over to the disconnected card in the same place.
  const slot = $derived.by(() => {
    if (!scaledHeight || !stageHeight) return undefined;
    const gui = stageHeight / scaledHeight;
    const status = Math.floor(scaledHeight / 2) - 80;
    const cancel = Math.floor(scaledHeight / 4) + 132;
    const above = Math.min(status, cancel) * gui - GAP;
    const below = stageHeight - Math.max(status + 9, cancel + 20) * gui - GAP;
    for (const [size, height] of [["full", FULL], ["compact", COMPACT]] as const) {
      if (below - height >= EDGE) return { size, edge: "bottom", offset: Math.min(ROOM, below - height) };
      if (above - height >= EDGE) return { size, edge: "top", offset: Math.min(ROOM, above - height) };
    }
    return undefined;
  });

  onMount(() => {
    measure();
    session.get().then((s) => (user = s)).catch(() => {});
    request<ConnectionDetails | undefined>("GET", "/connection")
      .then((current) => (details ??= current ?? undefined))
      .catch(() => {});
    request<ActiveProxy | undefined>("GET", "/proxy")
      .then((proxy) => {
        proxied = !!proxy;
        proxyPlace = [proxy?.ipInfo?.city, proxy?.ipInfo?.country].filter(Boolean).join(", ") || undefined;
      })
      .catch(() => {});
  });

  // An event received while the first answer is on its way is newer
  $effect(() => on("connectionDetails", (event) => (details = event.details)));
  $effect(() => on("scaleFactorChange", measure));
  $effect(() => on("session", ({ session: s }) => (user = s)));

  // Servers are named as typed, without the default port
  const server = $derived((details?.serverAddress ?? joined)?.replace(/:25565$/, ""));
  const throughProxy = $derived(details?.proxy ?? proxied);
  const route = $derived(
    throughProxy === undefined ? undefined : throughProxy ? `Through ${proxyPlace ?? details?.remoteAddress ?? "a proxy"}` : "Direct",
  );
</script>

<svelte:window onresize={measure} />

<div class="stage" bind:clientHeight={stageHeight}>
  {#if server && slot}
    <section
      class="card glass on-glass {slot.size}"
      style:top={slot.edge === "top" ? `${slot.offset}px` : undefined}
      style:bottom={slot.edge === "bottom" ? `${slot.offset}px` : undefined}
      aria-label="Connection"
      in:rise
    >
      <PlayerHead uuid={user?.uuid} avatar={user?.avatar} size={slot.size === "full" ? 32 : 16} radius={slot.size === "full" ? 8 : 4} inWorld={false} />
      {#if slot.size === "full"}
        <div class="text">
          <div class="t-headline server num">{server}</div>
          <div class="t-footnote l2 line">
            {#if user}<span>As {user.username}</span>{#if route}<span aria-hidden="true">·</span>{/if}{/if}
            {#if route}<span class="route">{route}</span>{/if}
          </div>
        </div>
      {:else}
        <div class="t-callout line">
          <span class="server num">{server}</span>
          {#if user}<span class="l2" aria-hidden="true">·</span><span class="l2">As {user.username}</span>{/if}
          {#if route}<span class="l2" aria-hidden="true">·</span><span class="l2 route">{route}</span>{/if}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .card {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    width: max-content;
    max-width: min(440px, calc(100% - 64px));
    display: flex;
    align-items: center;
  }
  .full {
    height: 56px;
    gap: 12px;
    padding: 0 16px 0 12px;
    border-radius: var(--r-pane);
  }
  .compact {
    height: 28px;
    gap: 8px;
    padding: 0 12px 0 6px;
    border-radius: 14px;
  }
  .text { min-width: 0; display: flex; flex-direction: column; }
  .server, .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line { display: flex; gap: 5px; min-width: 0; }
  .route { overflow: hidden; text-overflow: ellipsis; }
</style>
