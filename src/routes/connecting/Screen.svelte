<script lang="ts">
  import { onMount } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { client, session } from "../../lib/api/routes";
  import { connectingTo } from "../../lib/api/screen";
  import type { ActiveProxy, ConnectionDetails, Session } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";

  // Vanilla keeps its status line and Cancel button; under the status, this card says who joins where and how: the
  // account, the server and whether the connection goes through a proxy.

  let details = $state<ConnectionDetails>();
  let user = $state<Session>();
  let proxyPlace = $state<string>();
  let proxied = $state<boolean>();
  // The client names the server once the socket is open; until then, the one the page joined
  const joined = connectingTo();
  let scaledHeight = $state<number>();

  const measure = () => client.window().then((info) => (scaledHeight = info.scaledHeight)).catch(() => {});

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

<div class="stage" style:--scaled-height={scaledHeight}>
  {#if server && scaledHeight}
    <section class="card glass on-glass" aria-label="Connection" in:rise>
      <PlayerHead uuid={user?.uuid} avatar={user?.avatar} size={32} radius={8} inWorld={false} />
      <div class="text">
        <div class="t-headline server num">{server}</div>
        <div class="t-footnote l2 line">
          {#if user}<span>As {user.username}</span>{#if route}<span aria-hidden="true">·</span>{/if}{/if}
          {#if route}<span class="route">{route}</span>{/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  /* The client draws vanilla's status 80 GUI pixels above the middle and its Cancel button a quarter of the height
     plus 132 down; the card sits under the status line, where the original theme puts its connection line */
  .stage {
    position: absolute;
    inset: 0;
    container-type: size;
    pointer-events: none;
    --gui: calc(100cqh / var(--scaled-height, 270));
  }
  .card {
    position: absolute;
    left: 50%;
    top: calc(50cqh - 62 * var(--gui));
    translate: -50% 0;
    width: max-content;
    max-width: min(440px, calc(100% - 64px));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px 10px 10px;
    border-radius: var(--r-pane);
  }
  .text { min-width: 0; display: flex; flex-direction: column; }
  .server, .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line { display: flex; gap: 5px; }
  .route { overflow: hidden; text-overflow: ellipsis; }
</style>
