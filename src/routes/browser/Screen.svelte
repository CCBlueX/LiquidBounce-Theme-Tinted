<script lang="ts">
  import { onMount, tick } from "svelte";
  import { request } from "../../lib/api/client";
  import { on } from "../../lib/api/events";
  import { client } from "../../lib/api/routes";
  import type { BrowserState } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import { reportTyping } from "../../lib/typing";

  // The in-game browser draws the page itself, from 20 px in at the top left to 50 GUI px (less those 20 px) short
  // of the bottom. The toolbar lives in that bottom strip, so it is sized from the GUI scale and the page zoom.
  const BAND_GUI = 50;
  const OFFSET_PX = 20;
  const BAR = 38;
  const BAR_COMPACT = 32;

  let url = $state("");
  let draft = $state("");
  let editing = $state(false);
  let error = $state<string | undefined>();
  let scaleFactor = $state(2);
  let rootHeight = $state(900);
  let windowHeight = $state(innerHeight);
  let input: HTMLInputElement | undefined = $state();
  let back: HTMLButtonElement | undefined = $state();

  onMount(() => {
    tick().then(() => back?.focus());
    request<BrowserState>("GET", "/browser").then((state) => setUrl(state?.url)).catch(() => {});
    client.window().then((info) => (scaleFactor = info.scaleFactor)).catch(() => {});
    const offUrl = on("browserUrlChange", ({ url: next }) => setUrl(next));
    const offScale = on("scaleFactorChange", ({ scaleFactor: next }) => (scaleFactor = next));
    return () => {
      offUrl();
      offScale();
    };
  });

  function setUrl(next: string | undefined) {
    if (next === undefined) return;
    url = next;
    if (!editing) draft = next;
  }

  // App zooms the canvas; the strip is in window pixels, the toolbar in canvas pixels
  const zoom = $derived(rootHeight > 0 ? windowHeight / rootHeight : 1);
  const band = $derived((BAND_GUI * scaleFactor - OFFSET_PX) / zoom);
  const compact = $derived(band < BAR + 12);
  const height = $derived(compact ? BAR_COMPACT : BAR);
  const bottom = $derived(Math.max(2, (band - height) / 2));

  async function send(path: string, body?: unknown, failure = "The browser did not respond.") {
    error = undefined;
    try {
      await request("POST", `/browser/${path}`, body === undefined ? {} : { body });
    } catch {
      error = failure;
      play("error");
    }
  }

  function action(path: string) {
    play("tap");
    send(path);
  }

  // Bare host names get https://; anything with a scheme goes as typed
  function target(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const next = target(draft);
    if (!next) return;
    play("confirm");
    draft = next;
    send("navigate", { url: next }, "That address did not open.");
    input?.blur();
  }

  function focus() {
    editing = true;
    input?.select();
    reportTyping(true);
  }

  function blur() {
    editing = false;
    draft = url;
    reportTyping(false);
  }

  function fieldKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // Esc also reaches vanilla, which closes the browser; the field just lets go of the draft
      draft = url;
    }
  }
</script>

<svelte:window bind:innerHeight={windowHeight} />

<div class="frame" bind:clientHeight={rootHeight}>
  <nav
    class="bar glass on-glass"
    class:compact
    aria-label="Browser"
    style:bottom="{bottom}px"
    style:height="{height}px"
    in:rise={{ y: 8 }}
  >
    <h1 class="sr-only">Browser</h1>
    <div class="buttons">
      <button class="round" bind:this={back} onclick={() => action("back")} aria-label="Back" title="Back">‹</button>
      <button class="round" onclick={() => action("forward")} aria-label="Forward" title="Forward">›</button>
      <button class="round reload" onclick={() => action("reload")} aria-label="Reload" title="Reload">↻</button>
    </div>
    <form class="address" onsubmit={submit}>
      <input
        bind:this={input}
        bind:value={draft}
        aria-label="Address"
        placeholder="Enter an address"
        spellcheck="false"
        autocomplete="off"
        onfocus={focus}
        onblur={blur}
        onkeydown={fieldKey}
      />
    </form>
    {#if error}<span class="error t-footnote" role="alert">{error}</span>{/if}
    <button class="close" onclick={() => action("closeTab")} aria-label="Close tab">
      <span aria-hidden="true">×</span><span class="close-label">Close tab</span>
    </button>
  </nav>
</div>

<style>
  .frame { position: absolute; inset: 0; pointer-events: none; }
  .bar {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    translate: -50% 0;
    width: min(800px, calc(100% - 48px));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px;
    border-radius: 999px;
  }
  .buttons { display: flex; gap: 2px; flex: none; }
  .round {
    width: 30px;
    height: 30px;
    border-radius: 15px;
    display: grid;
    place-items: center;
    font-size: 24px;
    line-height: 1;
    padding-bottom: 2px;
    color: var(--label);
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .round.reload { font-size: 18px; padding-bottom: 0; }
  .round:hover { background: var(--fill); }
  .round:active { transform: scale(0.92); }
  .address { flex: 1; min-width: 0; height: 30px; }
  .address input {
    width: 100%;
    height: 100%;
    padding: 0 14px;
    border-radius: 15px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 13px;
    text-overflow: ellipsis;
  }
  .address input:focus { box-shadow: inset 0 0 0 0.5px var(--line), 0 0 0 2px var(--accent); }
  .address input:focus-visible { outline: none; }
  .address input::placeholder { color: var(--label-2); }
  .error { flex: none; max-width: 220px; color: var(--label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .close {
    flex: none;
    height: 30px;
    padding: 0 14px 0 10px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    background: var(--fill);
    transition: background-color var(--t-pop) var(--ease), transform var(--t-press) var(--ease);
  }
  .close span:first-child { font-size: 17px; font-weight: 400; line-height: 1; padding-bottom: 2px; }
  .close:hover { background: var(--fill-2); }
  .close:active { transform: scale(0.96); }
  .compact .round, .compact .address, .compact .close { height: 26px; }
  .compact .round { width: 26px; }
  .compact .close-label { display: none; }
  .compact .close { padding: 0 9px; }
</style>
