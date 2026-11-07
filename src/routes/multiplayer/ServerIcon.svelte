<script lang="ts">
  import { apiUrl } from "../../lib/api/client";
  import Base64Icon from "../../lib/ui/Base64Icon.svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";

  // The server's own 64px icon at half size; servers without one get vanilla's unknown-server picture, then a grass
  // block
  let { icon }: { icon: string | undefined } = $props();

  const UNKNOWN = apiUrl("/resource", { id: "minecraft:textures/misc/unknown_server.png" });
  let unknownFailed = $state(false);
</script>

<span class="icon" aria-hidden="true">
  <Base64Icon {icon} size={32}>
    {#snippet fallback()}
      {#if !unknownFailed}
        <img src={UNKNOWN} alt="" width="32" height="32" draggable="false" onerror={() => (unknownFailed = true)} />
      {:else}
        <ItemIcon id="minecraft:grass_block" size={32} fallback />
      {/if}
    {/snippet}
  </Base64Icon>
</span>

<style>
  .icon {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 5px;
    overflow: hidden;
  }
  img { display: block; }
</style>
