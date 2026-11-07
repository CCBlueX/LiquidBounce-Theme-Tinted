<script lang="ts" module>
  // Server and world icons arrive as base64 PNGs, server icons again on every list load and ping; each distinct
  // payload is decoded once
  const urls = new Map<string, string>();

  function iconUrl(base64: string | undefined): string | undefined {
    if (!base64) return undefined;
    let url = urls.get(base64);
    if (!url) {
      try {
        const binary = atob(base64.replace(/^data:image\/png;base64,/, "").replace(/\s/g, ""));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      } catch {
        return undefined;
      }
      urls.set(base64, url);
    }
    return url;
  }

  /** Drops decoded icons no longer in use. */
  export function keepIcons(inUse: Iterable<string | undefined>) {
    const keep = new Set(inUse);
    for (const [base64, url] of urls) {
      if (!keep.has(base64)) {
        URL.revokeObjectURL(url);
        urls.delete(base64);
      }
    }
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  // World icons are photos: `smooth` scales them down without dropping pixels
  let {
    icon,
    size,
    smooth = false,
    fallback,
  }: { icon: string | undefined; size: number; smooth?: boolean; fallback?: Snippet } = $props();

  let failed = $state<string>();
  const src = $derived(icon === failed ? undefined : iconUrl(icon));
</script>

{#if src}
  <img {src} alt="" width={size} height={size} class:smooth draggable="false" onerror={() => (failed = icon)} />
{:else}
  {@render fallback?.()}
{/if}

<style>
  img { display: block; flex: none; image-rendering: pixelated; }
  img.smooth { image-rendering: auto; object-fit: cover; }
</style>
