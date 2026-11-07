<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Alignment } from "../api/types";
  import { place } from "./components.svelte";
  import { provideSlot, Slot } from "./layout.svelte";

  // The box the HUD and the editor both put a component in, so both draw it at the same spot
  let {
    alignment,
    zIndex,
    children,
    ...rest
  }: { alignment: Alignment; zIndex: number; children: Snippet } & HTMLAttributes<HTMLDivElement> = $props();

  const slot = new Slot(untrack(() => alignment));
  provideSlot(slot);
  $effect.pre(() => slot.align(alignment));
</script>

<div
  {...rest}
  class="placed {rest.class ?? ''}"
  style={place(alignment, slot.shiftX, slot.shiftY)}
  style:z-index={zIndex}
  {@attach (element) => slot.mount(element)}
>
  {@render children()}
</div>

<style>
  .placed {
    position: absolute;
    display: flex;
    flex-direction: column;
  }
</style>
