<script lang="ts">
  import ItemIcon from "../../../lib/ui/ItemIcon.svelte";

  // A server icon or thumbnail from the web; until it loads, or when it fails, an item stands in
  let { src, fallback, size = 32 }: { src?: string; fallback: string; size?: 32 | 48 } = $props();

  let failed = $state<string>();
  let loaded = $state<string>();
</script>

<span class="icon" style:width="{size}px" style:height="{size}px" style:border-radius="{size / 5}px">
  {#if !src || failed === src || loaded !== src}
    <ItemIcon id={fallback} {size} />
  {/if}
  {#if src && failed !== src}
    <img {src} alt="" class:hidden={loaded !== src} onload={() => (loaded = src)} onerror={() => (failed = src)} />
  {/if}
</span>

<style>
  .icon { flex: none; position: relative; display: grid; place-items: center; overflow: hidden; background: var(--fill); }
  img { width: 100%; height: 100%; object-fit: cover; }
  .hidden { position: absolute; opacity: 0; }
</style>
