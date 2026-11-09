<script module lang="ts">
  import { request } from "../api/client";

  // Opening and closing in quick succession must reach the client in order, or the HUD stays hidden
  let hudEditorWrites: Promise<unknown> = Promise.resolve();
  function setHudEditor(selected: boolean) {
    hudEditorWrites = hudEditorWrites.then(() => request("PUT", "/hud-editor", { body: { selected } })).catch(() => {});
  }
</script>

<script lang="ts">
  import { setContext, tick } from "svelte";
  import { on } from "../api/events";
  import type { Alignment, HorizontalAlignment, HudComponent, VerticalAlignment } from "../api/types";
  import { rise } from "../motion";
  import { play } from "../sound";
  import PopoverMenu from "../ui/PopoverMenu.svelte";
  import "../ui/manager.css";
  import "../ui/values.css";
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
    Modules: "Shows the modules you toggle and their binds",
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
  const off = $derived(listed.filter((component) => !component.settings.enabled));

  $effect(() => {
    document.documentElement.classList.add("ctx-hud");
    setHudEditor(true);
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
      setHudEditor(false);
      document.documentElement.classList.remove("ctx-hud");
    };
  });

  // Keyboard users start on the first component, or on Add when none is on
  let focused = false;
  $effect(() => {
    if (focused || !listed.length || !root) return;
    focused = true;
    tick().then(() => root?.querySelector<HTMLElement>(".item, .add")?.focus());
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
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
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

  // Arrow keys move the focused component a unit (Shift: ten) and keep its anchor; the save waits for the last press.
  // Delete or Backspace switches it off.
  function itemKey(event: KeyboardEvent, component: HudComponent) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      showOnStage(component, false);
      return;
    }
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

  // A hidden component waits in the Add menu; focus moves on to the next component, or to Add, and to a component
  // as it comes back
  function showOnStage(component: HudComponent, shown: boolean) {
    play(shown ? "toggleOn" : "toggleOff");
    if (!shown && selected === component.id) selected = undefined;
    const items = [...(root?.querySelectorAll<HTMLElement>(".item") ?? [])];
    const next = items[items.findIndex((item) => item.dataset.id === component.id) + 1];
    setShown(component, shown);
    tick().then(() =>
      (shown ? root?.querySelector<HTMLElement>(`.item[data-id="${component.id}"]`) : (next ?? root?.querySelector<HTMLElement>(".add")))?.focus(),
    );
  }

  // The remove badge sits on the top left corner, inside it where the component touches the screen's edge
  const atEdge = (alignment: Alignment) => ({
    left: alignment.horizontalAlignment === "Left" && alignment.horizontalOffset < 12,
    top: alignment.verticalAlignment === "Top" && alignment.verticalOffset < 12,
  });

  function grabPanel(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    const zoom = metrics().zoom;
    panelGrab = { x: event.clientX / zoom - panel.x, y: event.clientY / zoom - panel.y, zoom };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  // The whole bar stays on screen, so Done can always be reached
  function movePanel(event: PointerEvent) {
    if (!panelGrab) return;
    const { width, height } = metrics();
    const box = event.currentTarget as HTMLElement;
    const spareX = Math.max(0, (width - box.offsetWidth) / 2);
    const top = height * 0.22;
    panel = {
      x: clamp(event.clientX / panelGrab.zoom - panelGrab.x, -spareX, spareX),
      y: clamp(event.clientY / panelGrab.zoom - panelGrab.y, -top, height - box.offsetHeight - top),
    };
  }

  const describe = (alignment: Alignment) =>
    `${alignment.horizontalAlignment.replace("CenterTranslated", "Center")} ${alignment.horizontalOffset}, ` +
    `${alignment.verticalAlignment.replace("CenterTranslated", "Center")} ${alignment.verticalOffset}`;
</script>

<svelte:window onkeydown={windowKey} onkeyup={windowKeyUp} onblur={() => (leftShift = false)} />

<div class="editor" class:dragging={!!drag} bind:this={root}>
  <div class="veil" aria-hidden="true"></div>
  {#if zone}
    <div class="zone" style:left="{(zone.h * 100) / 3}%" style:top="{(zone.v * 100) / 3}%"></div>
  {/if}

  <div class="stage" role="region" aria-label="HUD layout">
    {#each hud.shown as component (component.id)}
      {@const View = VIEWS[component.name]}
      {@const alignment = drag?.id === component.id ? drag.alignment : component.settings.alignment}
      {@const edge = atEdge(alignment)}
      <Placed
        {alignment}
        zIndex={component.settings.zIndex}
        class="item {selected === component.id ? 'selected' : ''} {drag?.id === component.id && drag.moved ? 'lifted' : ''}"
        data-id={component.id}
        role="button"
        tabindex={0}
        aria-roledescription="movable component"
        aria-label="{component.name}, {describe(alignment)}. Drag or use the arrow keys to move, Delete to hide."
        onpointerdown={(event: PointerEvent) => pickUp(event, component)}
        onpointermove={move}
        onpointerup={drop}
        onpointercancel={cancel}
        onkeydown={(event: KeyboardEvent) => itemKey(event, component)}
        onfocus={() => (selected = component.id)}
      >
        <div class="view" bind:offsetHeight={heights[component.id]}><View /></div>
        {#if !heights[component.id]}
          <div class="placeholder glass on-glass">
            <span class="name">{component.name}</span>
            <span class="t-footnote l2">{HINTS[component.name]}</span>
          </div>
        {/if}
        <button
          class="remove"
          class:inside-left={edge.left}
          class:inside-top={edge.top}
          tabindex={-1}
          aria-label="Hide {component.name}"
          onclick={() => showOnStage(component, false)}
        >
          <span aria-hidden="true">−</span>
        </button>
      </Placed>
    {/each}
  </div>

  {#if guides.x !== undefined}<div class="guide vertical" style:left="{guides.x}px"></div>{/if}
  {#if guides.y !== undefined}<div class="guide horizontal" style:top="{guides.y}px"></div>{/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (the bar's background is a pointer-only grip) -->
  <section
    class="bar glass deep on-glass"
    aria-labelledby="hud-editor-title"
    style:translate="calc(-50% + {panel.x}px) {panel.y}px"
    onpointerdown={grabPanel}
    onpointermove={movePanel}
    onpointerup={() => (panelGrab = undefined)}
    in:rise
  >
    <h2 id="hud-editor-title">Edit HUD</h2>
    <PopoverMenu label="Add a component" class="mg-pop glass deep on-glass add-menu">
      {#snippet trigger(props)}
        <button class="add" {...props} disabled={!off.length} aria-label={off.length ? "Add a component" : "Every component is shown"}>
          <span aria-hidden="true">+</span>
        </button>
      {/snippet}
      {#snippet children(pick)}
        {#each off as component (component.id)}
          <button class="mg-item" role="menuitem" tabindex="-1" onclick={() => pick(() => showOnStage(component, true))}>
            <span class="grow"><span class="label">{component.name}</span><span>{HINTS[component.name]}</span></span>
          </button>
        {/each}
      {/snippet}
    </PopoverMenu>
    <button class="done" onclick={close}>Done</button>
  </section>
  <p class="hint t-footnote" style:translate="calc(-50% + {panel.x}px) {panel.y}px" aria-hidden="true">
    Drag to move. Hold Left Shift to place freely.
  </p>
</div>

<style>
  .editor {
    position: absolute;
    inset: 0;
    z-index: 10;
    user-select: none;
  }
  /* The world steps back, so the components and the bar read as the thing being edited */
  .veil {
    position: absolute;
    inset: 0;
    background: rgb(6 8 12 / 0.3);
    pointer-events: none;
  }
  .stage {
    position: absolute;
    inset: 0;
    isolation: isolate;
  }
  .editor :global(.item) {
    cursor: grab;
    touch-action: none;
    border-radius: var(--r-group);
    outline: 1px solid transparent;
    outline-offset: 4px;
    transition: outline-color var(--t-hover) ease, scale var(--t-pop) var(--ease), filter var(--t-pop) var(--ease);
  }
  .editor :global(.item:hover) {
    outline-color: rgb(255 255 255 / 0.4);
  }
  .editor :global(.item.selected),
  .editor :global(.item:focus-visible) {
    outline: 2px solid var(--accent);
  }
  /* Picked up, a component lifts off the screen */
  .editor :global(.item.lifted) {
    scale: 1.03;
    filter: drop-shadow(0 14px 28px rgb(0 0 0 / 0.35));
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
  /* The remove badge, as on the home screen: a small dark disc with a minus on the top left corner */
  .remove {
    position: absolute;
    top: -9px;
    left: -9px;
    z-index: 1;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgb(58 60 68 / 0.94);
    box-shadow: inset 0 0.5px 0 rgb(255 255 255 / 0.35), inset 0 0 0 0.5px rgb(255 255 255 / 0.14), 0 2px 6px rgb(0 0 0 / 0.35);
    color: #fff;
    font-size: 17px;
    font-weight: 700;
    line-height: 1;
    text-shadow: none;
    cursor: default;
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease), opacity var(--t-pop) var(--ease);
  }
  .remove span { margin-top: -2px; }
  .remove:hover { background: rgb(78 80 88 / 0.96); }
  .remove:active { transform: scale(0.95); }
  .remove.inside-left { left: 4px; }
  .remove.inside-top { top: 4px; }
  .dragging .remove {
    opacity: 0;
    pointer-events: none;
  }
  .zone {
    position: absolute;
    width: calc(100% / 3);
    height: calc(100% / 3);
    border-radius: 24px;
    background: rgb(255 255 255 / 0.035);
    pointer-events: none;
  }
  .guide {
    position: absolute;
    z-index: 2;
    background: var(--accent);
    box-shadow: 0 0 6px rgb(70 119 255 / 0.6);
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
  .bar {
    position: absolute;
    z-index: 3;
    left: 50%;
    top: 22%;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    padding: 0 6px 0 16px;
    border-radius: 22px;
    cursor: grab;
    touch-action: none;
    transition: opacity var(--t-pop) var(--ease);
  }
  /* A drag never lands on the bar */
  .dragging .bar,
  .dragging .hint {
    opacity: 0.3;
    pointer-events: none;
  }
  h2 {
    margin-right: 6px;
    font-size: 15px;
    line-height: 20px;
    font-weight: 620;
    letter-spacing: -0.008em;
    white-space: nowrap;
  }
  .add {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--fill-2);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 20px;
    font-weight: 500;
    line-height: 1;
    cursor: default;
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease);
  }
  .add span { margin-top: -2px; }
  .add:hover { background: var(--fill-3); }
  .add:active { transform: scale(0.94); }
  .add:disabled { opacity: 0.4; }
  .add:disabled:hover { background: var(--fill-2); }
  .done {
    height: 32px;
    padding: 0 16px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;
    background: var(--accent-fill);
    color: #fff;
    text-shadow: none;
    cursor: default;
    transition: background-color var(--t-hover) ease, transform var(--t-press) var(--ease);
  }
  .done:hover { background: var(--accent-strong); }
  .done:active { transform: scale(0.97); }
  .hint {
    position: absolute;
    z-index: 3;
    left: 50%;
    top: calc(22% + 52px);
    margin: 0;
    color: var(--label-2);
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
    white-space: nowrap;
    pointer-events: none;
    transition: opacity var(--t-pop) var(--ease);
  }
  /* Centred under the bar's plus */
  :global(.mg-pop.add-menu) {
    left: anchor(center);
    right: auto;
    translate: -50% 0;
    width: 240px;
  }
</style>
