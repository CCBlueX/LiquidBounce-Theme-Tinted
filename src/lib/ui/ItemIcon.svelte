<script module lang="ts">
  // A window resize changes the canvas zoom, and with it how many device pixels every icon covers
  let resizes = $state(0);
  addEventListener("resize", () => resizes++);
</script>

<script lang="ts">
  import { apiUrl } from "../api/client";
  import { resources } from "../api/routes";
  import { settings } from "../settings.svelte";

  // Item art is 16px (rendered icons are scaled to 64), effect art is 18px; only whole multiples stay crisp
  let {
    id,
    size = 32,
    kind = "item",
    label = "",
    fallback = false,
  }: {
    id: string;
    size?: 16 | 32 | 48 | 64 | 18 | 36;
    kind?: "item" | "effect";
    label?: string;
    /** Once every source failed, show the name's initial in the icon's place instead of a blank. */
    fallback?: boolean;
  } = $props();

  // Rendered item icons need item components, which the client binds only once a world is joined. Before that the
  // raw texture files still load, so the title screen falls back to them.
  const sources = $derived.by(() => {
    if (kind === "effect") return [resources.effectTextureUrl(id)];
    const [namespace, path] = id.includes(":") ? id.split(":") : ["minecraft", id];
    const raw = (folder: string, suffix = "") =>
      apiUrl("/resource", { id: `${namespace}:textures/${folder}/${path}${suffix}.png` });
    // Animated items keep frames as _00.._31; blocks often only have per-face textures
    return [
      resources.itemTextureUrl(id),
      raw("item"),
      raw("item", "_00"),
      raw("block"),
      raw("block", "_side"),
      raw("block", "_front"),
      raw("block", "_top"),
    ];
  });

  // Attempts belong to one id; a parent handing over an equal id must not restart them or hide a loaded image
  const key = $derived(`${kind}:${id}`);
  let attempt = $state({ key: "", index: 0, round: 0, failed: false });
  const index = $derived(attempt.key === key ? attempt.index : 0);
  const round = $derived(attempt.key === key ? attempt.round : 0);
  const failed = $derived(attempt.key === key && attempt.failed);
  const src = $derived(sources[index] + (round ? `&retry=${round}` : ""));
  let loadedSrc = $state("");
  const loaded = $derived(loadedSrc === src);

  // The client answers 500 for rendered icons until a world is joined, so failed icons retry with backoff; after about
  // 45 seconds an id is taken as one the client cannot draw (a pack or mod without the art)
  const ROUNDS = 6;
  let retryTimer: number | undefined;
  $effect(() => () => clearTimeout(retryTimer));

  function next() {
    if (index + 1 < sources.length) {
      attempt = { key, index: index + 1, round, failed };
      return;
    }
    attempt = { key, index, round, failed: true };
    if (round + 1 >= ROUNDS) return;
    const lost = key;
    const retry = { key, index: 0, round: round + 1, failed: true };
    retryTimer = setTimeout(() => {
      if (key === lost) attempt = retry;
    }, 1500 * 2 ** round);
  }

  // The canvas zoom puts icons on fractional device sizes, where pixel art shows uneven texels. An icon draws at the
  // largest whole multiple of its art's texel grid that is no more than 30% under its size, centred in its box; it
  // never grows past the box, which clips in tiles and crowds row text. Art drawn smaller than its texels is smoothed.
  let img = $state<HTMLImageElement>();
  let texels = $state(0);
  let drawn = $state<{ size: number; smooth: boolean }>();
  $effect(() => {
    void resizes;
    void settings.scale;
    if (!img || !texels) return;
    const zoom = img.currentCSSZoom * devicePixelRatio;
    const device = size * zoom;
    const below = Math.floor(device / texels) * texels;
    if (below > 0 && device - below <= device * 0.3) drawn = { size: below / zoom, smooth: false };
    else drawn = { size, smooth: device < texels };
  });

  function onload() {
    loadedSrc = src;
    // Rendered item icons are their 16px art scaled by 4
    if (img) texels = kind === "item" && index === 0 ? img.naturalWidth / 4 : img.naturalWidth;
  }

  const initial = $derived((label || id.slice(id.indexOf(":") + 1)).charAt(0).toUpperCase());
  const inset = $derived(drawn ? (size - drawn.size) / 2 : 0);
</script>

{#if fallback && failed && !loaded}
  <span
    class="initial"
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * 0.55)}px"
    role={label ? "img" : undefined}
    aria-label={label || undefined}
    aria-hidden={label ? undefined : "true"}>{initial}</span
  >
{/if}
<img
  bind:this={img}
  {src}
  width={size}
  height={size}
  alt={label}
  aria-hidden={label ? undefined : "true"}
  class:loaded
  class:smooth={drawn?.smooth}
  class:gone={fallback && failed && !loaded}
  style:width={drawn ? `${drawn.size}px` : undefined}
  style:height={drawn ? `${drawn.size}px` : undefined}
  style:margin={inset ? `${inset}px` : undefined}
  {onload}
  onerror={next}
  draggable="false"
/>

<style>
  img { image-rendering: pixelated; object-fit: cover; object-position: top; flex: none; display: block; visibility: hidden; }
  img.loaded { visibility: visible; }
  img.smooth { image-rendering: auto; }
  img.gone { display: none; }
  .initial {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 25%;
    background: var(--fill-2);
    color: var(--label-2);
    font-weight: 600;
    line-height: 1;
  }
</style>
