<script lang="ts">
  import type { Component } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import type { Alignment, HudComponent } from "../../lib/api/types";
  import { moduleStore } from "../../lib/modules.svelte";
  import Island from "./Island.svelte";
  import Modules from "./Modules.svelte";

  const THEME_ID = "tinted";
  const VIEWS: Record<string, Component> = { Island, Modules };

  type Declaration = { name: string; description?: string; enabled: boolean; alignment: Alignment };

  let components = $state.raw<HudComponent[]>([]);

  // The client lists the theme's components with their user-set alignment. Until it knows the theme (a dev server, a
  // theme loaded from outside the client) the theme's own declarations are the layout.
  async function load(): Promise<HudComponent[]> {
    try {
      const list = await request<HudComponent[]>("GET", `/components/${THEME_ID}`);
      // An empty list means the client does not know this theme (loaded from a URL), not that nothing is enabled
      if (Array.isArray(list) && list.length > 0) return list;
    } catch {
      // fall through to the declarations
    }
    const declared = await Promise.all(
      Object.keys(VIEWS).map(async (name) => {
        const response = await fetch(new URL(`components/${name.toLowerCase()}.json`, document.baseURI));
        const declaration: Declaration = await response.json();
        return {
          name: declaration.name,
          description: declaration.description ?? "",
          id: declaration.name,
          settings: { enabled: declaration.enabled, zIndex: 0, alignment: declaration.alignment },
        } satisfies HudComponent;
      }),
    );
    return declared;
  }

  // The HUD floats over a sharp world with nothing behind it to blur; the root class selects the denser material
  $effect(() => {
    document.documentElement.classList.add("ctx-hud");
    return () => document.documentElement.classList.remove("ctx-hud");
  });

  $effect(() => {
    let live = true;
    load()
      .then((list) => {
        if (live) components = list;
      })
      .catch(() => {});
    const offUpdate = on("componentsUpdate", (event) => {
      if (event.source === "theme" && (event.themeId ?? THEME_ID) === THEME_ID) components = event.components;
    });
    const stopModules = moduleStore.start();
    return () => {
      live = false;
      offUpdate();
      stopModules();
    };
  });

  function place({ horizontalAlignment: h, horizontalOffset: x, verticalAlignment: v, verticalOffset: y }: Alignment) {
    const style: string[] = [];
    let tx = "0";
    let ty = "0";
    if (h === "Left") style.push(`left: ${x}px`);
    else if (h === "Right") style.push(`right: ${x}px`);
    else style.push(`left: calc(50% + ${x}px)`);
    if (h === "CenterTranslated") tx = "-50%";
    if (v === "Top") style.push(`top: ${y}px`);
    else if (v === "Bottom") style.push(`bottom: ${y}px`);
    else style.push(`top: calc(50% + ${y}px)`);
    if (v === "CenterTranslated") ty = "-50%";
    style.push(`translate: ${tx} ${ty}`);
    // The anchored edge decides which way a component grows when its content changes
    style.push(`align-items: ${h === "Right" ? "flex-end" : h === "Left" ? "flex-start" : "center"}`);
    return style.join("; ");
  }

  const shown = $derived(components.filter((component) => component.settings.enabled && VIEWS[component.name]));
</script>

<aside class="hud" aria-label="Heads-up display">
  <h1 class="sr-only">HUD</h1>
  {#each shown as component (component.id)}
    {@const View = VIEWS[component.name]}
    <div class="component" style={place(component.settings.alignment)} style:z-index={component.settings.zIndex}>
      <View />
    </div>
  {/each}
</aside>

<style>
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .component {
    position: absolute;
    display: flex;
    flex-direction: column;
  }
</style>
