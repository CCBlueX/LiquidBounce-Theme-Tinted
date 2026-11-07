<script lang="ts">
  import { apiUrl } from "../api/client";
  import { resources } from "../api/routes";

  // Item art is 16px (rendered icons are scaled to 64), effect art is 18px; only whole multiples stay crisp
  let {
    id,
    size = 32,
    kind = "item",
    label = "",
  }: { id: string; size?: 16 | 32 | 48 | 64 | 18 | 36; kind?: "item" | "effect"; label?: string } = $props();

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
  let attempt = $state({ key: "", index: 0, round: 0 });
  const index = $derived(attempt.key === key ? attempt.index : 0);
  const round = $derived(attempt.key === key ? attempt.round : 0);
  const src = $derived(sources[index] + (round ? `&retry=${round}` : ""));
  let loadedSrc = $state("");

  function next() {
    if (index + 1 < sources.length) {
      attempt = { key, index: index + 1, round };
      return;
    }
    const failed = key;
    const retry = { key, index: 0, round: round + 1 };
    setTimeout(() => {
      if (key === failed) attempt = retry;
    }, Math.min(30_000, 1500 * 2 ** Math.min(round, 5)));
  }
</script>

<img
  {src}
  width={size}
  height={size}
  alt={label}
  aria-hidden={label ? undefined : "true"}
  class:loaded={loadedSrc === src}
  onload={() => (loadedSrc = src)}
  onerror={next}
  draggable="false"
/>

<style>
  img { image-rendering: pixelated; flex: none; display: block; visibility: hidden; }
  img.loaded { visibility: visible; }
</style>
