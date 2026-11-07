<script lang="ts">
  import { apiUrl } from "../api/client";
  import { resources } from "../api/routes";
  import ItemIcon from "./ItemIcon.svelte";

  // A player's face with its hat layer. Accounts and the session carry an avatar URL, a face cut from the profile's
  // real skin, which comes first. In a world the skin route gives the skin the game draws for a player, which for a
  // cracked account is a default skin and for anyone not in the world too; it fails outside a world, so menus pass
  // inWorld={false}. The default Steve skin and a player head item are the last fallbacks.
  let {
    uuid,
    avatar,
    size = 32,
    radius = size / 4,
    lazy = false,
    inWorld = true,
  }: {
    uuid: string | undefined;
    avatar?: string;
    size?: 16 | 24 | 32 | 48;
    radius?: number;
    lazy?: boolean;
    inWorld?: boolean;
  } = $props();

  const STEVE = apiUrl("/resource", { id: "minecraft:textures/entity/player/wide/steve.png" });
  let failed = $state<string[]>([]);
  // Skins are cut to the face and hat; avatars are the face already
  const source = $derived.by(() => {
    if (!uuid) return undefined;
    const sources = [
      ...(avatar ? [{ url: avatar, skin: false }] : []),
      ...(inWorld ? [{ url: resources.skinUrl(uuid), skin: true }] : []),
      { url: STEVE, skin: true },
    ];
    return sources.find(({ url }) => !failed.includes(url));
  });
  const scale = $derived(size / 8);
  const loading = $derived(lazy ? "lazy" : "eager");

  function fail() {
    if (source) failed = [...failed, source.url];
  }
</script>

{#if !uuid || source}
  <span class="head" style:--size="{size}px" style:--scale={scale} style:border-radius="{radius}px" aria-hidden="true">
    {#if source?.skin}
      <img src={source.url} alt="" class="face" {loading} draggable="false" onerror={fail} />
      <img src={source.url} alt="" class="hat" {loading} draggable="false" />
    {:else if source}
      <img src={source.url} alt="" class="avatar" {loading} draggable="false" onerror={fail} />
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
    max-width: none;
    image-rendering: pixelated;
  }
  .face, .hat {
    width: calc(64px * var(--scale));
    height: calc(64px * var(--scale));
    top: calc(-8px * var(--scale));
  }
  .face { left: calc(-8px * var(--scale)); }
  .hat { left: calc(-40px * var(--scale)); }
  .avatar { inset: 0; width: 100%; height: 100%; }
</style>
