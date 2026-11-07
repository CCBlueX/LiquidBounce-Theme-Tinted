<script lang="ts">
  import { apiUrl } from "../../lib/api/client";
  import Base64Icon from "../../lib/ui/Base64Icon.svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";

  // The server's own 64px icon; servers without one get vanilla's unknown-server picture, then a grass block
  let { icon, size }: { icon: string | undefined; size: 32 | 64 } = $props();

  const UNKNOWN = apiUrl("/resource", { id: "minecraft:textures/misc/unknown_server.png" });
  let unknownFailed = $state(false);
</script>

<span class="icon" style:--size="{size}px" aria-hidden="true">
  <Base64Icon {icon} {size}>
    {#snippet fallback()}
      {#if !unknownFailed}
        <img src={UNKNOWN} alt="" width={size} height={size} draggable="false" onerror={() => (unknownFailed = true)} />
      {:else}
        <ItemIcon id="minecraft:grass_block" size={size === 64 ? 48 : 32} />
      {/if}
    {/snippet}
  </Base64Icon>
</span>

<style>
  .icon {
    width: var(--size);
    height: var(--size);
    flex: none;
    display: grid;
    place-items: center;
    border-radius: calc(var(--size) / 6);
    overflow: hidden;
  }
  img { display: block; image-rendering: pixelated; }
</style>
