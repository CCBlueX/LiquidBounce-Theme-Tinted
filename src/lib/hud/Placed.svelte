<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Alignment } from "../api/types";
  import { place } from "./components.svelte";

  // The box the HUD and the editor both put a component in, so both draw it at the same spot
  let {
    alignment,
    zIndex,
    children,
    ...rest
  }: { alignment: Alignment; zIndex: number; children: Snippet } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class="placed {rest.class ?? ''}" style={place(alignment)} style:z-index={zIndex}>
  {@render children()}
</div>

<style>
  .placed {
    position: absolute;
    display: flex;
    flex-direction: column;
  }
</style>
