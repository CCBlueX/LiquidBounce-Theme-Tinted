<script lang="ts">
  import type { MarkdownImage } from "../../../lib/markdown";
  import { rise } from "../../../lib/motion";
  import { play } from "../../../lib/sound";

  // The images of a description: one at the pane's width, more as a strip. Each opens enlarged in a modal dialog
  // with previous and next; Esc, a click beside it or × closes it. Images that fail to load leave.
  let { images }: { images: MarkdownImage[] } = $props();

  let failed = $state<string[]>([]);
  let open = $state<number>();
  let dialog = $state<HTMLDialogElement>();
  const shown = $derived(images.filter((image) => !failed.includes(image.src)));

  $effect(() => {
    void images;
    failed = [];
    open = undefined;
  });

  $effect(() => {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.focus();
  });

  function show(index: number) {
    open = index;
    play("open");
  }

  function fail(src: string) {
    failed = [...failed, src];
    if (open !== undefined && open >= shown.length) open = shown.length ? shown.length - 1 : undefined;
  }

  const go = (index: number) => (open = (index + shown.length) % shown.length);
  const step = (delta: number) => open !== undefined && go(open + delta);

  // Keys stay in the dialog: the screen behind would take letters as a search and Tab out of it
  function key(event: KeyboardEvent) {
    event.stopPropagation();
    if (open === undefined) return;
    const last = shown.length - 1;
    const target =
      event.key === "ArrowLeft" ? open - 1 : event.key === "ArrowRight" ? open + 1 : event.key === "Home" ? 0 : event.key === "End" ? last : undefined;
    if (target !== undefined) {
      event.preventDefault();
      go(target);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const stops = [...(dialog?.querySelectorAll("button") ?? [])];
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      stops.at(at < 0 ? 0 : (at + (event.shiftKey ? -1 : 1)) % stops.length)?.focus();
    }
  }

  function closed() {
    open = undefined;
    play("close");
  }
</script>

<!-- Esc closes it here, before the screen takes Esc for its search or, as the cached in-game page, hides with it open -->
<svelte:window onkeydowncapture={(event) => event.key === "Escape" && dialog?.close()} />

{#if shown.length}
  <div class="gallery" class:single={shown.length === 1}>
    {#each shown as image, index (image.src)}
      <button class="shot" aria-label={image.alt ? `Enlarge ${image.alt}` : `Enlarge image ${index + 1}`} onclick={() => show(index)}>
        <img src={image.src} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror={() => fail(image.src)} />
      </button>
    {/each}
  </div>
{/if}

{#if open !== undefined && shown[open]}
  {@const image = shown[open]}
  <!-- It covers the window, since vw and vh ignore the canvas zoom; a click beside the image lands on it -->
  <dialog
    bind:this={dialog}
    class="viewer"
    tabindex="-1"
    aria-label={image.alt || "Image"}
    onclose={closed}
    onkeydown={key}
    onclick={(event) => event.target === event.currentTarget && dialog?.close()}
  >
    <img class="big" src={image.src} alt={image.alt} referrerpolicy="no-referrer" draggable="false" onerror={() => fail(image.src)} in:rise={{ scale: 0.97 }} />
    <div class="bar glass deep layered on-glass" in:rise>
      {#if shown.length > 1}<button aria-label="Previous" onclick={() => step(-1)}>‹</button>{/if}
      {#if image.alt}<span class="caption t-footnote">{image.alt}</span>{/if}
      {#if shown.length > 1}<span class="count t-footnote num">{open + 1} of {shown.length}</span>{/if}
      {#if shown.length > 1}<button aria-label="Next" onclick={() => step(1)}>›</button>{/if}
      <button aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </div>
  </dialog>
{/if}

<style>
  .gallery { display: flex; gap: 6px; margin: 6px 0 4px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; }
  .shot {
    flex: none;
    height: 112px;
    padding: 0;
    border-radius: var(--r-group);
    overflow: hidden;
    background: var(--fill);
    scroll-snap-align: start;
    transition: transform var(--t-press) var(--ease);
  }
  .shot:active { transform: scale(0.98); }
  .shot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .shot img { display: block; height: 100%; width: auto; max-width: 280px; aspect-ratio: auto 16 / 9; object-fit: cover; transition: filter var(--t-hover) ease; }
  .shot:hover img { filter: brightness(1.08); }
  .single .shot { width: 100%; height: auto; }
  .single .shot img { width: 100%; max-width: none; height: auto; max-height: 240px; object-fit: contain; }

  .viewer { inset: 0; width: auto; height: auto; max-width: none; max-height: none; margin: 0; padding: 24px; border: 0; background: none; color: var(--label); outline: none; }
  .viewer[open] { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
  .viewer:modal { overscroll-behavior: contain; }
  .viewer::backdrop { background: rgb(6 8 12 / 0.72); overflow: hidden; overscroll-behavior: contain; transition: opacity 200ms ease-out; }
  @starting-style {
    .viewer[open]::backdrop { opacity: 0; }
  }
  .big {
    flex: none;
    display: block;
    min-height: 0;
    max-width: min(1600px, 100%);
    max-height: calc(100% - 46px);
    object-fit: contain;
    border-radius: var(--r-card);
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.5);
  }
  .bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 18px; }
  .bar button {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    font-size: 17px;
    line-height: 1;
    padding-bottom: 2px;
    color: var(--label);
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease);
  }
  .bar button:hover { background: var(--fill-2); }
  .bar button:active { transform: scale(0.92); }
  .bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .caption { max-width: 60ch; padding-left: 8px; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .caption, .count { padding-right: 8px; }
  .count { color: var(--label-3); white-space: nowrap; }
  button + .count { padding-left: 8px; }
</style>
