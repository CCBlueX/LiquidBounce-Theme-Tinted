<script lang="ts">
  import { apiUrl } from "../api/client";
  import { resources } from "../api/routes";
  import ItemIcon from "./ItemIcon.svelte";

  // A player's face and hat layer cut from the 64x64 skin at a whole-number scale. The skin route fails with a server
  // error outside a world, so screens shown before joining pass inWorld={false} and start at the default Steve skin;
  // a player head item is the last fallback.
  let {
    uuid,
    size = 32,
    radius = size / 4,
    lazy = false,
    inWorld = true,
  }: { uuid: string | undefined; size?: 16 | 24 | 32 | 48; radius?: number; lazy?: boolean; inWorld?: boolean } =
    $props();

  const STEVE = apiUrl("/resource", { id: "minecraft:textures/entity/player/wide/steve.png" });
  let failed = $state<string[]>([]);
  const src = $derived(
    uuid ? (inWorld ? [resources.skinUrl(uuid), STEVE] : [STEVE]).find((url) => !failed.includes(url)) : undefined,
  );
  const scale = $derived(size / 8);
</script>

{#if !uuid || src}
  <span class="head" style:--size="{size}px" style:--scale={scale} style:border-radius="{radius}px" aria-hidden="true">
    {#if src}
      <img {src} alt="" class="face" loading={lazy ? "lazy" : "eager"} draggable="false" onerror={() => src && (failed = [...failed, src])} />
      <img {src} alt="" class="hat" loading={lazy ? "lazy" : "eager"} draggable="false" />
    {/if}
  </span>
{:else}
  <ItemIcon id="minecraft:player_head" size={size === 24 ? 16 : size} fallback />
{/if}

<style>
  .head {
    position: relative;
    flex: none;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    background: var(--fill);
  }
  img {
    position: absolute;
    width: calc(64px * var(--scale));
    height: calc(64px * var(--scale));
    max-width: none;
    image-rendering: pixelated;
    top: calc(-8px * var(--scale));
  }
  .face { left: calc(-8px * var(--scale)); }
  .hat { left: calc(-40px * var(--scale)); }
</style>
