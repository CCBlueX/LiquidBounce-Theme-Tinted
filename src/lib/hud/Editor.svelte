<script lang="ts">
  import { setContext, tick } from "svelte";
  import { request } from "../api/client";
  import { on } from "../api/events";
  import type { Alignment, HorizontalAlignment, HudComponent, VerticalAlignment } from "../api/types";
  import { rise } from "../motion";
  import { play } from "../sound";
  import Switch from "../ui/Switch.svelte";
  import { COMPONENT_NAMES, EDITING, hud } from "./components.svelte";
  import Placed from "./Placed.svelte";
  import { VIEWS } from "./views";

  // While open, the client hides the HUD browser (PUT /hud-editor) and this layer draws every component with live
  // data at the spot the HUD would. Offsets are canvas units, the same CSS pixels the HUD places with.
  let { onclose }: { onclose: () => void } = $props();

  const GRID = 10;
  const MAGNET = 6;
  const DRAG_START = 3;
  const SAVE_DELAY_MS = 300;
  const HINTS: Record<string, string> = {
    Island: "Shows modules and live activity",
    Modules: "Shows enabled and bound modules",
    Scoreboard: "Shows the server's sidebar",
    Armor: "Shows while you wear armor",
    Effects: "Shows active effects",
    Target: "Shows after you hit a player",
  };

  setContext(EDITING, true);

  type Box = { left: number; top: number; width: number; height: number };
  type Drag = {
    id: string;
    x: number;
    y: number;
    box: Box;
    others: Box[];
    moved: boolean;
    alignment: Alignment;
  };

  let root = $state<HTMLDivElement>();
  let drag = $state.raw<Drag>();
  let guides = $state.raw<{ x?: number; y?: number }>({});
  let zone = $state.raw<{ h: number; v: number }>();
  let heights = $state<Record<string, number>>({});
  let selected = $state<string>();
  let leftShift = false;
  // The panel moves out of the way by its background; where it sits is not saved
  let panel = $state({ x: 0, y: 0 });
  let panelGrab: { x: number; y: number; zoom: number } | undefined;
  const saves = new Map<string, { timer: ReturnType<typeof setTimeout>; alignment: Alignment }>();

  const listed = $derived(hud.list.filter((component) => COMPONENT_NAMES.includes(component.name)));

  $effect(() => {
    document.documentElement.classList.add("ctx-hud");
    request("PUT", "/hud-editor", { body: { selected: true } }).catch(() => {});
    const stop = hud.start();
    const off = on("keyboardKey", (event) => {
      if (event.key === "key.keyboard.left.shift") leftShift = event.action !== 0;
    });
    return () => {
      off();
      stop();
      for (const [id, save] of saves) {
        clearTimeout(save.timer);
        hud.saveAlignment(id, save.alignment).catch(() => {});
      }
      saves.clear();
      request("PUT", "/hud-editor", { body: { selected: false } }).catch(() => {});
      document.documentElement.classList.remove("ctx-hud");
    };
  });

  // Keyboard users start on the first component
  let focused = false;
  $effect(() => {
    if (focused || !hud.shown.length || !root) return;
    focused = true;
    tick().then(() => root?.querySelector<HTMLElement>(".item")?.focus());
  });

  function close() {
    play("close");
    onclose();
  }

  function metrics() {
    const rect = root!.getBoundingClientRect();
    const zoom = rect.width / root!.offsetWidth || 1;
    return { rect, zoom, width: root!.offsetWidth, height: root!.offsetHeight };
  }

  function boxOf(element: Element, m: ReturnType<typeof metrics>): Box {
    const r = element.getBoundingClientRect();
    return {
      left: (r.left - m.rect.left) / m.zoom,
      top: (r.top - m.rect.top) / m.zoom,
      width: r.width / m.zoom,
      height: r.height / m.zoom,
    };
  }

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));

  // Offset of an edge for an anchor, and back; Right and Bottom count from the far edge
  function offsetOf(anchor: string, start: number, size: number, total: number) {
    if (anchor === "Left" || anchor === "Top") return start;
    if (anchor === "Right" || anchor === "Bottom") return total - start - size;
    if (anchor === "CenterTranslated") return start + size / 2 - total / 2;
    return start - total / 2;
  }

  function startOf(anchor: string, offset: number, size: number, total: number) {
    if (anchor === "Left" || anchor === "Top") return offset;
    if (anchor === "Right" || anchor === "Bottom") return total - offset - size;
    if (anchor === "CenterTranslated") return total / 2 + offset - size / 2;
    return total / 2 + offset;
  }

  // The offset on the grid (or exact when a magnet holds it), rounded to the whole units the client stores, and kept
  // on screen
  function settle(anchor: string, start: number, size: number, total: number, snapped: boolean) {
    let offset = offsetOf(anchor, start, size, total);
    if (snapped) offset = Math.round(offset / GRID) * GRID;
    const kept = clamp(startOf(anchor, offset, size, total), 0, total - size);
    return Math.round(offsetOf(anchor, kept, size, total));
  }

  /** The closest of the dragged box's edges and centre within MAGNET of a target line. */
  function magnet(start: number, size: number, lines: number[]) {
    let best: { start: number; line: number; distance: number } | undefined;
    for (const [point, shift] of [
      [start, 0],
      [start + size / 2, size / 2],
      [start + size, size],
    ]) {
      for (const line of lines) {
        const distance = Math.abs(point - line);
        if (distance <= MAGNET && (!best || distance < best.distance)) best = { start: line - shift, line, distance };
      }
    }
    return best;
  }

  function pickUp(event: PointerEvent, component: HudComponent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    element.focus();
    element.setPointerCapture(event.pointerId);
    const m = metrics();
    const others = [...root!.querySelectorAll(".item")]
      .filter((other) => other !== element)
      .map((other) => boxOf(other, m));
    drag = {
      id: component.id,
      x: (event.clientX - m.rect.left) / m.zoom,
      y: (event.clientY - m.rect.top) / m.zoom,
      box: boxOf(element, m),
      others,
      moved: false,
      alignment: component.settings.alignment,
    };
    selected = component.id;
    play("tap");
  }

  function move(event: PointerEvent) {
    const current = drag;
    if (!current) return;
    const m = metrics();
    const x = (event.clientX - m.rect.left) / m.zoom;
    const y = (event.clientY - m.rect.top) / m.zoom;
    if (!current.moved && Math.hypot(x - current.x, y - current.y) < DRAG_START) return;
    const { width, height } = current.box;
    let left = clamp(current.box.left + x - current.x, 0, m.width - width);
    let top = clamp(current.box.top + y - current.y, 0, m.height - height);

    // Anchors follow the third of the screen the cursor is in, like the client's own editor
    const h = x < m.width / 3 ? 0 : x > (m.width * 2) / 3 ? 2 : 1;
    const v = y < m.height / 3 ? 0 : y > (m.height * 2) / 3 ? 2 : 1;
    const horizontal = (["Left", "CenterTranslated", "Right"] as HorizontalAlignment[])[h];
    const vertical = (["Top", "CenterTranslated", "Bottom"] as VerticalAlignment[])[v];

    const free = leftShift;
    const snapX = free
      ? undefined
      : magnet(left, width, [m.width / 2, ...current.others.flatMap((o) => [o.left, o.left + o.width / 2, o.left + o.width])]);
    const snapY = free
      ? undefined
      : magnet(top, height, [m.height / 2, ...current.others.flatMap((o) => [o.top, o.top + o.height / 2, o.top + o.height])]);
    if (snapX) left = snapX.start;
    if (snapY) top = snapY.start;

    drag = {
      ...current,
      moved: true,
      alignment: {
        horizontalAlignment: horizontal,
        horizontalOffset: settle(horizontal, left, width, m.width, !free && !snapX),
        verticalAlignment: vertical,
        verticalOffset: settle(vertical, top, height, m.height, !free && !snapY),
      },
    };
    if (guides.x !== snapX?.line || guides.y !== snapY?.line) guides = { x: snapX?.line, y: snapY?.line };
    if (zone?.h !== h || zone?.v !== v) zone = { h, v };
  }

  function drop() {
    const current = drag;
    drag = undefined;
    guides = {};
    zone = undefined;
    if (!current?.moved) return;
    clearTimeout(saves.get(current.id)?.timer);
    saves.delete(current.id);
    play("tap");
    hud.saveAlignment(current.id, current.alignment).catch(() => play("error"));
  }

  function cancel() {
    drag = undefined;
    guides = {};
    zone = undefined;
  }

  // Arrow keys move the focused component a unit (Shift: ten) and keep its anchor; the save waits for the last press
  function nudge(event: KeyboardEvent, component: HudComponent) {
    const step = event.shiftKey ? GRID : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const m = metrics();
    const box = boxOf(event.currentTarget as Element, m);
    const { horizontalAlignment: h, verticalAlignment: v } = component.settings.alignment;
    const left = clamp(box.left + delta[0], 0, m.width - box.width);
    const top = clamp(box.top + delta[1], 0, m.height - box.height);
    const alignment: Alignment = {
      horizontalAlignment: h,
      horizontalOffset: Math.round(offsetOf(h, left, box.width, m.width)),
      verticalAlignment: v,
      verticalOffset: Math.round(offsetOf(v, top, box.height, m.height)),
    };
    hud.move(component.id, alignment);
    clearTimeout(saves.get(component.id)?.timer);
    saves.set(component.id, {
      alignment,
      timer: setTimeout(() => {
        saves.delete(component.id);
        hud.saveAlignment(component.id, alignment).catch(() => play("error"));
      }, SAVE_DELAY_MS),
    });
  }

  function windowKey(event: KeyboardEvent) {
    if (event.code === "ShiftLeft") leftShift = true;
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  }

  function windowKeyUp(event: KeyboardEvent) {
    if (event.code === "ShiftLeft") leftShift = false;
  }

  function setShown(component: HudComponent, shown: boolean) {
    hud.setEnabled(component, shown).catch(() => play("error"));
  }

  function grabPanel(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    const zoom = metrics().zoom;
    panelGrab = { x: event.clientX / zoom - panel.x, y: event.clientY / zoom - panel.y, zoom };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePanel(event: PointerEvent) {
    if (!panelGrab) return;
    const { width, height } = metrics();
    panel = {
      x: clamp(event.clientX / panelGrab.zoom - panelGrab.x, -width / 2, width / 2),
      y: clamp(event.clientY / panelGrab.zoom - panelGrab.y, -height * 0.26, height * 0.7),
    };
  }

  const describe = (alignment: Alignment) =>
    `${alignment.horizontalAlignment.replace("CenterTranslated", "Center")} ${alignment.horizontalOffset}, ` +
    `${alignment.verticalAlignment.replace("CenterTranslated", "Center")} ${alignment.verticalOffset}`;
</script>

<svelte:window onkeydown={windowKey} onkeyup={windowKeyUp} onblur={() => (leftShift = false)} />

<div class="editor" class:dragging={!!drag} bind:this={root}>
  {#if zone}
    <div class="zone" style:left="{(zone.h * 100) / 3}%" style:top="{(zone.v * 100) / 3}%"></div>
  {/if}

  <div class="stage" role="region" aria-label="HUD layout">
    {#each hud.shown as component (component.id)}
      {@const View = VIEWS[component.name]}
      {@const alignment = drag?.id === component.id ? drag.alignment : component.settings.alignment}
      <Placed
        {alignment}
        zIndex={component.settings.zIndex}
        class="item {selected === component.id ? 'selected' : ''}"
        data-id={component.id}
        role="button"
        tabindex={0}
        aria-roledescription="movable component"
        aria-label="{component.name}, {describe(alignment)}. Drag or use the arrow keys to move."
        onpointerdown={(event: PointerEvent) => pickUp(event, component)}
        onpointermove={move}
        onpointerup={drop}
        onpointercancel={cancel}
        onkeydown={(event: KeyboardEvent) => nudge(event, component)}
        onfocus={() => (selected = component.id)}
      >
        <div class="view" bind:offsetHeight={heights[component.id]}><View /></div>
        {#if !heights[component.id]}
          <div class="placeholder glass on-glass">
            <span class="name">{component.name}</span>
            <span class="t-footnote l2">{HINTS[component.name]}</span>
          </div>
        {/if}
      </Placed>
    {/each}
  </div>

  {#if guides.x !== undefined}<div class="guide vertical" style:left="{guides.x}px"></div>{/if}
  {#if guides.y !== undefined}<div class="guide horizontal" style:top="{guides.y}px"></div>{/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (the panel's background is a pointer-only grip) -->
  <section
    class="panel glass layered on-glass"
    aria-labelledby="hud-editor-title"
    style:translate="calc(-50% + {panel.x}px) {panel.y}px"
    onpointerdown={grabPanel}
    onpointermove={movePanel}
    onpointerup={() => (panelGrab = undefined)}
    in:rise
  >
    <div class="bar">
      <h2 id="hud-editor-title">Edit HUD</h2>
      <ul>
        {#each listed as component (component.id)}
          <li class:off={!component.settings.enabled}>
            <span class="name">{component.name}</span>
            <Switch
              small
              checked={component.settings.enabled}
              label="Show {component.name}"
              onchange={(shown) => setShown(component, shown)}
            />
          </li>
        {/each}
      </ul>
      <button class="done" onclick={close}>Done</button>
    </div>
    <p class="t-footnote l2">Drag a component to move it, arrow keys nudge. Hold Left Shift to place freely.</p>
  </section>
</div>

<style>
  .editor {
    position: absolute;
    inset: 0;
    z-index: 10;
    user-select: none;
  }
  .stage {
    position: absolute;
    inset: 0;
    isolation: isolate;
  }
  .editor :global(.item) {
    cursor: grab;
    touch-action: none;
    outline: 1px dashed rgb(255 255 255 / 0.5);
    outline-offset: 3px;
    border-radius: var(--r-group);
  }
  .editor :global(.item.selected),
  .editor :global(.item:focus-visible) {
    outline: 2px solid var(--accent);
  }
  .dragging :global(.item) {
    cursor: grabbing;
  }
  .view {
    display: flex;
    flex-direction: column;
    align-items: inherit;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 168px;
    height: 52px;
    padding: 0 14px;
    border-radius: var(--r-group);
    white-space: nowrap;
  }
  .placeholder .name {
    font-size: 13px;
    font-weight: 600;
  }
  .zone {
    position: absolute;
    width: calc(100% / 3);
    height: calc(100% / 3);
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
    pointer-events: none;
  }
  .guide {
    position: absolute;
    z-index: 2;
    background: var(--accent);
    pointer-events: none;
  }
  .guide.vertical {
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .guide.horizontal {
    left: 0;
    right: 0;
    height: 1px;
  }
  .panel {
    position: absolute;
    z-index: 3;
    left: 50%;
    top: 26%;
    padding: 6px 6px 6px;
    border-radius: var(--r-card);
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.18), 0 1px 4px rgb(0 0 0 / 0.1);
    cursor: grab;
    touch-action: none;
    transition: opacity var(--t-pop) var(--ease);
  }
  /* A drag never lands on the panel */
  .dragging .panel {
    opacity: 0.3;
    pointer-events: none;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  h2 {
    margin: 0 8px 0 6px;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    white-space: nowrap;
  }
  .done {
    height: 26px;
    margin-left: 6px;
    padding: 0 12px;
    border-radius: 13px;
    font-size: 13px;
    font-weight: 600;
    background: var(--accent-fill);
    color: #fff;
    text-shadow: none;
    cursor: default;
  }
  ul {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 0 2px 0 10px;
    border-radius: 15px;
    background: var(--fill);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: default;
  }
  li.off .name {
    color: var(--label-2);
  }
  p {
    margin: 4px 6px 0;
    text-align: center;
  }
</style>
