<script lang="ts">
  import { untrack, type Component } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { request } from "./lib/api/client";
  import { onReconnect } from "./lib/api/events";
  import { ackScreen, onHandover, onScreenChange } from "./lib/api/screen";
  import { easeOut } from "./lib/motion";
  import { settings } from "./lib/settings.svelte";

  // The HUD and the cached ClickGUI run in their own browsers marked static; they never follow screen changes
  let { initialRoute, isStatic }: { initialRoute: string; isStatic: boolean } = $props();

  // The client closes the old screen just before it opens the next; the old one stays this long in case one follows
  const CLOSE_HOLD_MS = 250;
  // Overlays over the running game leave with their vanilla screen, which vanishes at once; once no screen is open the
  // client draws the HUD over this page, so anything still fading here would end up under it
  const IN_GAME = new Set(["game_menu", "inventory", "container"]);
  // Overlays sit on the game's own screen, which has already replaced the screen before them
  const OVERLAYS = new Set(["connecting", "disconnected", "game_menu", "inventory", "container", "browser", "basicmenu"]);

  // Routes load on demand, so the HUD browser only fetches the HUD
  const loaders = import.meta.glob<{ default: Component }>("./routes/*/Screen.svelte");
  const screens: Record<string, () => Promise<{ default: Component }>> = Object.fromEntries(
    Object.entries(loaders).map(([path, load]) => [path.split("/")[2], load]),
  );

  let route = $state(untrack(() => initialRoute));
  // What is on screen; it changes only once the next route's code has arrived, so nothing blanks in between
  let shown = $state.raw<{ route: string; Screen: Component }>();
  // The route a game screen is about to replace; it leaves at once, and comes back if the client refused
  let handedOver: string | undefined;
  let width = $state(innerWidth);
  let height = $state(innerHeight);

  // Layouts target a 1600x900 canvas; small game windows shrink it, never below 0.75. The Scale setting never makes
  // the canvas smaller than 1066x600, the smallest one every layout holds.
  const zoom = $derived(
    Math.min(
      Math.min(1.6, Math.max(0.75, Math.min(width / 1600, height / 900))) * settings.scale,
      Math.max(0.75, Math.min(width / 1066, height / 600)),
    ),
  );

  // Acks name the client's screen even when this theme has nothing to draw for it, and "none" once it closed
  function follow(name: string) {
    handedOver = undefined;
    route = name;
    ackScreen(name || "none").catch(() => {});
  }

  $effect(() => {
    if (isStatic) return;
    let hold: number | undefined;
    let events = 0;
    // The main browser loads with an empty route, and screen events are lost while the socket is down, so it asks
    // which screen is open; an event that arrives meanwhile wins over the answer, and without an answer the page
    // follows `otherwise` if given
    const ask = (otherwise?: string) => {
      const asked = events;
      request<{ name?: string | null }>("GET", "/virtualScreen")
        .then((screen) => screen?.name ?? "", () => otherwise)
        .then((name) => {
          if (name === undefined || events !== asked) return;
          clearTimeout(hold);
          follow(name);
        });
    };
    // A reload keeps the route the client last loaded the page with, which may no longer be its screen; the client
    // refuses that ack, and its answer decides
    const initial = untrack(() => route);
    if (initial) ackScreen(initial).catch(() => ask());
    else ask();
    const offScreen = onScreenChange(({ name, action }) => {
      events++;
      if (action === "open") {
        clearTimeout(hold);
        follow(name);
      } else if (action === "close" && (name === route || (!route && name === handedOver))) {
        clearTimeout(hold);
        if (IN_GAME.has(name)) route = "";
        // The client sends events from a thread pool, so the close of a screen can arrive after the open of the same
        // screen that followed it; the client's answer decides once the hold is over
        hold = setTimeout(() => ask(""), CLOSE_HOLD_MS);
      }
    });
    const offReconnect = onReconnect(() => ask());
    const offHandover = onHandover((leaving) => {
      if (leaving) {
        handedOver = route;
        route = "";
      } else if (handedOver !== undefined && !route) {
        route = handedOver;
      }
    });
    return () => {
      offScreen();
      offReconnect();
      offHandover();
      clearTimeout(hold);
    };
  });

  $effect(() => {
    const next = route;
    const load = screens[next];
    if (!load) {
      releaseFocus();
      shown = undefined;
      return;
    }
    load().then(({ default: Screen }) => {
      if (route !== next || shown?.route === next) return;
      releaseFocus();
      shown = { route: next, Screen };
    });
  });

  // Screens load on demand; once the page is up, the main browser fetches the rest while idle, so a screen the client
  // switches to later (connecting, disconnected) does not wait for its code while the old one stays on top
  $effect(() => {
    if (isStatic) return;
    const idle = requestIdleCallback(() => {
      for (const load of Object.values(screens)) load().catch(() => {});
    });
    return () => cancelIdleCallback(idle);
  });

  // The outgoing layer turns inert but keeps focus until it is removed; incoming screens move focus only from body
  function releaseFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".screen")) active.blur();
  }

  const TABBABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

  // Tab past the last control would leave the page, where the client gives focus to nothing; it wraps within the
  // screen instead. Dialogs that trap Tab stop the event before it bubbles up here.
  function wrapTab(event: KeyboardEvent) {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const layer = document.querySelector(".canvas > .screen:not([inert])");
    if (!layer) return;
    const stops = [...layer.querySelectorAll<HTMLElement>(TABBABLE)].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[inert]") &&
        element.checkVisibility({ visibilityProperty: true }),
    );
    if (!stops.length) return;
    const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
  }

  // The incoming screen fades in over the outgoing one, which fades out faster; its glass surfaces rise on their own
  function screenIn(_: Element): TransitionConfig {
    if (isStatic) return { duration: 0 };
    return { duration: 160, easing: easeOut, css: (t) => `opacity: ${t}` };
  }

  function screenOut(_: Element, from: string): TransitionConfig {
    if (IN_GAME.has(from) || from === handedOver || OVERLAYS.has(route)) return { duration: 0 };
    return { duration: 120, easing: easeOut, css: (t) => `opacity: ${t}` };
  }
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} onkeydown={wrapTab} />

<div class="canvas" style:zoom={zoom} style:width="{width / zoom}px" style:height="{height / zoom}px">
  <!-- Each layer keeps its own screen while it fades out under the next -->
  {#each shown ? [shown] : [] as layer (layer)}
    <div class="screen" in:screenIn out:screenOut={layer.route} inert={layer.route !== route}>
      <layer.Screen />
    </div>
  {/each}
</div>

<style>
  .canvas { position: relative; overflow: hidden; }
  .screen { position: absolute; inset: 0; }
</style>
