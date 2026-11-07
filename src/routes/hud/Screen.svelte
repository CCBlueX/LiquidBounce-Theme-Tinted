<script lang="ts">
  import { hud } from "../../lib/hud/components.svelte";
  import Placed from "../../lib/hud/Placed.svelte";
  import { VIEWS } from "../../lib/hud/views";

  // The HUD floats over a sharp world with nothing behind it to blur; the root class selects the denser material
  $effect(() => {
    document.documentElement.classList.add("ctx-hud");
    return () => document.documentElement.classList.remove("ctx-hud");
  });

  $effect(() => hud.start({ catchUp: true }));
</script>

<aside class="hud" aria-label="Heads-up display">
  <h1 class="sr-only">HUD</h1>
  {#each hud.shown as component (component.id)}
    {@const View = VIEWS[component.name]}
    <Placed alignment={component.settings.alignment} zIndex={component.settings.zIndex}><View /></Placed>
  {/each}
</aside>

<style>
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
