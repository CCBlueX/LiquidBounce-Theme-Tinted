<script lang="ts">
  import { untrack, type Component } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { request } from "./lib/api/client";
  import { ackScreen, onScreenChange } from "./lib/api/screen";
  import { isReducedMotion, spring } from "./lib/motion";
  import { settings } from "./lib/settings.svelte";

  // The HUD and the cached ClickGUI run in their own browsers marked static; they never follow screen changes
  let { initialRoute, isStatic }: { initialRoute: string; isStatic: boolean } = $props();

  // The client closes the old screen just before it opens the next; the old one stays this long in case one follows
  const CLOSE_HOLD_MS = 250;

  // Routes load on demand, so the HUD browser only fetches the HUD
  const loaders = import.meta.glob<{ default: Component }>("./routes/*/Screen.svelte");
  const screens: Record<string, () => Promise<{ default: Component }>> = Object.fromEntries(
    Object.entries(loaders).map(([path, load]) => [path.split("/")[2], load]),
  );

  let route = $state(untrack(() => initialRoute));
  // What is on screen; it changes only once the next route's code has arrived, so nothing blanks in between
  let shown = $state.raw<{ route: string; Screen: Component }>();
  let width = $state(innerWidth);
  let height = $state(innerHeight);

  // Layouts target a 1600x900 canvas; small game windows shrink it, never below 0.75
  const zoom = $derived(Math.min(1.6, Math.max(0.75, Math.min(width / 1600, height / 900))) * settings.scale);

  $effect(() => {
    if (isStatic) return;
    let hold: number | undefined;
    const off = onScreenChange(({ name, action }) => {
      if (action === "open") {
        clearTimeout(hold);
        route = name;
      } else if (action === "close" && name === route) {
        clearTimeout(hold);
        hold = setTimeout(() => {
          if (route === name) route = "";
        }, CLOSE_HOLD_MS);
      }
    });
    return () => {
      off();
      clearTimeout(hold);
    };
  });

  // The main browser loads with an empty route and must ask which screen is open
  $effect(() => {
    if (isStatic || route) return;
    request<{ name?: string }>("GET", "/virtualScreen")
      .then((screen) => {
        if (!route && screen?.name) route = screen.name;
      })
      .catch(() => {});
  });

  $effect(() => {
    const next = route;
    const load = screens[next];
    if (!load) {
      shown = undefined;
      return;
    }
    if (!isStatic) ackScreen(next);
    load().then(({ default: Screen }) => {
      if (route === next && shown?.route !== next) shown = { route: next, Screen };
    });
  });

  // The incoming screen rises in over the outgoing one, which fades; under reduce motion both only fade
  function screenIn(_: Element): TransitionConfig {
    if (isStatic) return { duration: 0 };
    if (isReducedMotion()) return { duration: 160, css: (t) => `opacity: ${t}` };
    return { duration: 320, css: (t) => `opacity: ${Math.min(1, t * 2)}; transform: translateY(${(1 - spring(t)) * 10}px)` };
  }

  function screenOut(_: Element): TransitionConfig {
    return { duration: isReducedMotion() ? 140 : 180, css: (t) => `opacity: ${t}` };
  }
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<div class="canvas" style:zoom={zoom} style:width="{width / zoom}px" style:height="{height / zoom}px">
  <!-- Each layer keeps its own screen while it fades out under the next -->
  {#each shown ? [shown] : [] as layer (layer)}
    <div class="screen" in:screenIn out:screenOut inert={layer.route !== route}>
      <layer.Screen />
    </div>
  {/each}
</div>

<style>
  .canvas { position: relative; overflow: hidden; }
  .screen { position: absolute; inset: 0; }
</style>
