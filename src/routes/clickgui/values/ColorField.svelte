<script lang="ts">
  import type { Argb } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import { channels, cssColor, fromHex, toHex, withAlpha } from "../tree";
  import { fromHsv, recentColors, toHsv, type Hsv } from "./colors.svelte";

  // Hex code and swatch; the popover is a picker: saturation and brightness area, hue, opacity, hex code, swatches
  let { value, label, onchange }: { value: Argb; label: string; onchange: (value: Argb, delay?: number) => void } = $props();

  const id = $props.id();
  const DRAG_DELAY = 150;
  const ACCENT = "#4677FF";

  const hex = $derived(toHex(value));
  const rgba = $derived(channels(value));
  const rgb = $derived(value & 0xffffff);

  // Gray and black carry no hue, so the picker keeps the hue and saturation it last set while the color stays the same
  let kept = $state<Hsv & { rgb: number }>();
  const hsv = $derived<Hsv>(kept && kept.rgb === rgb ? kept : toHsv(rgba.r, rgba.g, rgba.b));
  const alpha = $derived(rgba.a / 255);

  let draft = $state("");
  let editing = $state(false);
  let invalid = $state(false);
  let openedWith: Argb | undefined;
  let accent = $state(ACCENT);

  $effect(() => {
    if (!editing) draft = hex;
  });

  const swatches = $derived([accent, ...recentColors.list.filter((entry) => entry !== accent)]);

  function toggled(event: ToggleEvent) {
    if (event.newState === "open") {
      openedWith = value;
      invalid = false;
      recentColors.load();
      const token = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      accent = fromHex(token) === undefined ? ACCENT : toHex(fromHex(token)!);
      play("open");
    } else {
      if (openedWith !== undefined && openedWith !== value) recentColors.add(hex);
      openedWith = undefined;
      play("close");
    }
  }

  function emitHsv(next: Hsv, delay: number) {
    const { r, g, b } = fromHsv(next);
    const argb = ((rgba.a << 24) | (r << 16) | (g << 8) | b) | 0;
    kept = { ...next, rgb: argb & 0xffffff };
    if (argb !== value) onchange(argb, delay);
  }

  function emitAlpha(next: number, delay: number) {
    const argb = withAlpha(value, Math.round(Math.min(1, Math.max(0, next)) * 255));
    if (argb !== value) onchange(argb, delay);
  }

  function applyHex() {
    editing = false;
    const next = fromHex(draft);
    if (next === undefined) {
      invalid = true;
      play("error");
      return;
    }
    invalid = false;
    draft = toHex(next);
    if (next !== value) onchange(next);
  }

  function pickSwatch(text: string) {
    const next = fromHex(text);
    if (next === undefined || next === value) return;
    play("tap");
    onchange(next);
  }

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

  // Saturation and brightness area
  let area: HTMLDivElement;
  let dragging = $state<"area" | "hue" | "alpha" | null>(null);

  function areaAt(event: PointerEvent) {
    const box = area.getBoundingClientRect();
    emitHsv({ h: hsv.h, s: clamp01((event.clientX - box.left) / box.width), v: 1 - clamp01((event.clientY - box.top) / box.height) }, DRAG_DELAY);
  }

  function areaKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    emitHsv({ h: hsv.h, s: clamp01(hsv.s + move[0]), v: clamp01(hsv.v + move[1]) }, DRAG_DELAY);
  }

  // Hue and opacity tracks; the knob stays inside its track, so its center runs from 8px to width - 8px
  const KNOB = 16;

  function trackAt(event: PointerEvent, which: "hue" | "alpha") {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const p = clamp01((event.clientX - box.left - KNOB / 2) / (box.width - KNOB));
    if (which === "hue") emitHsv({ ...hsv, h: p * 360 }, DRAG_DELAY);
    else emitAlpha(p, DRAG_DELAY);
  }

  function trackKey(event: KeyboardEvent, which: "hue" | "alpha") {
    const big = event.shiftKey;
    const deltas: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    let delta = deltas[event.key];
    const edge = event.key === "Home" ? 0 : event.key === "End" ? 1 : undefined;
    if (delta === undefined && edge === undefined) return;
    event.preventDefault();
    if (big && delta) delta *= 10;
    if (which === "hue") {
      const h = edge !== undefined ? edge * 360 : Math.min(360, Math.max(0, hsv.h + delta));
      emitHsv({ ...hsv, h }, DRAG_DELAY);
    } else {
      emitAlpha(edge !== undefined ? edge : alpha + delta / 100, DRAG_DELAY);
    }
  }

  function down(event: PointerEvent, which: "area" | "hue" | "alpha") {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    (event.currentTarget as HTMLElement).focus();
    dragging = which;
    move(event);
  }

  function move(event: PointerEvent) {
    if (dragging === "area") areaAt(event);
    else if (dragging) trackAt(event, dragging);
  }

  const pure = $derived(`hsl(${hsv.h} 100% 50%)`);
  const opaque = $derived(cssColor(value, true));
</script>

<button class="swatch-button" popovertarget="color-{id}" style:anchor-name="--color-{id}" aria-label="{label}: {hex}">
  <span class="cg-val">{hex}</span>
  <span class="swatch checker" aria-hidden="true">
    <span style:background={opaque}></span>
    <span style:background={cssColor(value)}></span>
  </span>
</button>

<div
  id="color-{id}"
  class="cg-pop glass editor"
  popover="auto"
  role="dialog"
  aria-label="{label} color"
  style:position-anchor="--color-{id}"
  ontoggle={toggled}
>
  <div
    class="area"
    class:dragging={dragging === "area"}
    bind:this={area}
    style:--hue={pure}
    role="slider"
    tabindex="0"
    aria-label="{label} saturation and brightness"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(hsv.s * 100)}
    aria-valuetext="Saturation {Math.round(hsv.s * 100)}%, brightness {Math.round(hsv.v * 100)}%"
    onpointerdown={(event) => down(event, "area")}
    onpointermove={move}
    onpointerup={() => (dragging = null)}
    onpointercancel={() => (dragging = null)}
    onkeydown={areaKey}
  >
    <span class="thumb" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%" style:background={opaque}></span>
  </div>

  <div
    class="track hue"
    class:dragging={dragging === "hue"}
    role="slider"
    tabindex="0"
    aria-label="{label} hue"
    aria-valuemin={0}
    aria-valuemax={360}
    aria-valuenow={Math.round(hsv.h)}
    aria-valuetext="{Math.round(hsv.h)}°"
    onpointerdown={(event) => down(event, "hue")}
    onpointermove={move}
    onpointerup={() => (dragging = null)}
    onpointercancel={() => (dragging = null)}
    onkeydown={(event) => trackKey(event, "hue")}
  >
    <span class="thumb" style:--p={hsv.h / 360} style:background={pure}></span>
  </div>

  <div
    class="track alpha checker"
    class:dragging={dragging === "alpha"}
    style:--opaque={opaque}
    role="slider"
    tabindex="0"
    aria-label="{label} opacity"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(alpha * 100)}
    aria-valuetext="{Math.round(alpha * 100)}%"
    onpointerdown={(event) => down(event, "alpha")}
    onpointermove={move}
    onpointerup={() => (dragging = null)}
    onpointercancel={() => (dragging = null)}
    onkeydown={(event) => trackKey(event, "alpha")}
  >
    <span class="thumb" style:--p={alpha}><span style:background={cssColor(value)}></span></span>
  </div>

  <div class="line">
    <span class="preview checker" aria-hidden="true"><span style:background={cssColor(value)}></span></span>
    <input
      class="cg-field hex"
      class:invalid
      bind:value={draft}
      spellcheck="false"
      aria-label="{label} hex code"
      aria-invalid={invalid}
      aria-describedby={invalid ? `color-${id}-error` : undefined}
      onfocus={() => (editing = true)}
      onkeydown={(event) => event.key === "Enter" && applyHex()}
      oninput={() => (editing = true)}
      onblur={applyHex}
    />
    <span class="t-footnote cg-val opacity">{Math.round(alpha * 100)}%</span>
  </div>
  {#if invalid}<div class="t-footnote error" id="color-{id}-error">Use #RGB, #RRGGBB or #RRGGBBAA</div>{/if}

  <div class="swatches" role="group" aria-label="{label} recent colors">
    {#each swatches as entry, index (entry)}
      <button
        class="dot checker"
        class:current={fromHex(entry) === value}
        aria-label={index === 0 ? `Accent ${entry}` : entry}
        title={index === 0 ? `Accent ${entry}` : entry}
        onclick={() => pickSwatch(entry)}
      >
        <span style:background={cssColor(fromHex(entry) ?? 0)}></span>
      </button>
    {/each}
  </div>
</div>

<style>
  .checker {
    background: repeating-conic-gradient(rgb(255 255 255 / 0.32) 0 25%, rgb(255 255 255 / 0.08) 0 50%) 0 0 / 8px 8px,
      rgb(20 20 24);
  }
  /* The swatch is the row's trailing edge; the hover fill runs past it into the inset */
  .swatch-button {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 3px 0 6px;
    margin-right: -3px;
    border-radius: 6px;
    transition: background-color var(--t-hover) ease;
  }
  .swatch-button:hover { background: var(--fill); }
  .swatch {
    display: flex;
    width: 24px;
    height: 16px;
    overflow: hidden;
    border-radius: 4px;
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.3);
  }
  .swatch > span { flex: 1; }

  .editor { width: 240px; padding: 12px; gap: 10px; }
  /* Only while open: an author display value would override the popover's hidden state */
  .editor:popover-open { display: grid; }

  .area {
    position: relative;
    height: 132px;
    border-radius: 8px;
    background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, var(--hue));
    box-shadow: inset 0 0 0 0.5px var(--line);
    touch-action: none;
    outline: none;
  }
  .area .thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px #fff, 0 1px 4px 2px rgb(0 0 0 / 0.35);
    pointer-events: none;
  }
  .area:focus-visible .thumb { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--accent), 0 1px 4px 2px rgb(0 0 0 / 0.35); }

  .track {
    position: relative;
    height: 16px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 0.5px var(--line);
    touch-action: none;
    outline: none;
  }
  .hue {
    background: linear-gradient(to right, #f00 0%, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00 100%);
  }
  .alpha::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(to right, transparent, var(--opaque));
  }
  .track .thumb {
    position: absolute;
    top: 0;
    left: calc(var(--p) * (100% - 16px));
    width: 16px;
    height: 16px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 3px #fff, 0 1px 4px rgb(0 0 0 / 0.35);
    pointer-events: none;
    overflow: hidden;
    transition: transform var(--t-press) var(--ease);
  }
  .track .thumb > span { position: absolute; inset: 3px; border-radius: 50%; }
  .track:focus-visible .thumb { box-shadow: inset 0 0 0 3px #fff, 0 0 0 2px var(--accent), 0 1px 4px rgb(0 0 0 / 0.35); }
  .track.dragging .thumb { transform: scale(1.1); }

  .line { display: flex; align-items: center; gap: 8px; }
  .preview {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.3);
  }
  .preview > span { display: block; width: 100%; height: 100%; }
  .hex { flex: 1; width: 0; font-variant-numeric: tabular-nums; font-family: inherit; }
  .opacity { width: 36px; text-align: right; }
  .invalid { box-shadow: inset 0 0 0 1px var(--negative); }
  .error { color: var(--negative); margin-top: -4px; }

  .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.3);
    transition: transform var(--t-press) var(--ease);
  }
  .dot > span { display: block; width: 100%; height: 100%; }
  .dot:active { transform: scale(0.95); }
  .dot.current { box-shadow: 0 0 0 2px var(--glass-deep), 0 0 0 3.5px var(--label-2); }
</style>
