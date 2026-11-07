<script lang="ts">
  import { untrack, type Component } from "svelte";
  import { request } from "./lib/api/client";
  import { ackScreen, onScreenChange } from "./lib/api/screen";
  import { settings } from "./lib/settings.svelte";

  // The HUD and the cached ClickGUI run in their own browsers marked static; they never follow screen changes
  let { initialRoute, isStatic }: { initialRoute: string; isStatic: boolean } = $props();

  // Routes load on demand, so the HUD browser only fetches the HUD
  const loaders = import.meta.glob<{ default: Component }>("./routes/*/Screen.svelte");
  const screens: Record<string, () => Promise<{ default: Component }>> = Object.fromEntries(
    Object.entries(loaders).map(([path, load]) => [path.split("/")[2], load]),
  );

  let route = $state(untrack(() => initialRoute));
  let width = $state(innerWidth);
  let height = $state(innerHeight);

  // Layouts target a 1600x900 canvas; small game windows shrink it, never below 0.75
  const zoom = $derived(Math.min(1.6, Math.max(0.75, Math.min(width / 1600, height / 900))) * settings.scale);

  $effect(() => {
    if (isStatic) return;
    return onScreenChange(({ name, action }) => {
      if (action === "open") route = name;
      else if (action === "close" && name === route) route = "";
    });
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
    if (!isStatic && route && screens[route]) ackScreen(route);
  });

  const loading = $derived(screens[route]?.());
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<div class="canvas" style:zoom={zoom} style:width="{width / zoom}px" style:height="{height / zoom}px">
  {#if loading}
    {#await loading then { default: Screen }}
      {#key route}<Screen />{/key}
    {/await}
  {/if}
</div>

<style>
  .canvas { position: relative; overflow: hidden; }
</style>
