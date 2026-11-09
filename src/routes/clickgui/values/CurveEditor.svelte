<script lang="ts">
  import { tick } from "svelte";
  import type { CurveAxis, Vec2 } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import { curveY, DEFAULT_TENSION } from "./curve";

  // A plot of the curve as the client evaluates it, with draggable points
  let {
    value,
    xAxis,
    yAxis,
    tension = DEFAULT_TENSION,
    label,
    onchange,
  }: {
    value: Vec2[];
    xAxis: CurveAxis;
    yAxis: CurveAxis;
    tension?: number;
    label: string;
    onchange: (points: Vec2[], delay?: number) => void;
  } = $props();

  const id = $props.id();
  const MIN_POINTS = 2;
  const DRAG_DELAY = 150;

  const points = $derived([...value].map(({ x, y }) => ({ x, y })).sort((a, b) => a.x - b.x));
  const xSpan = $derived(xAxis.range.to - xAxis.range.from || 1);
  const ySpan = $derived(yAxis.range.to - yAxis.range.from || 1);
  const hue = $derived(yAxis.label === "Hue" && yAxis.range.from === 0 && yAxis.range.to === 360);

  let width = $state(0);
  let height = $state(0);
  let field: HTMLDivElement;
  let pointsBox: HTMLDivElement;

  const fx = (x: number) => (x - xAxis.range.from) / xSpan;
  const fy = (y: number) => 1 - (y - yAxis.range.from) / ySpan;

  const path = $derived.by(() => {
    if (!width || !height || points.length === 0) return "";
    const columns = Math.max(2, Math.ceil(width / 2));
    let d = "";
    for (let i = 0; i <= columns; i++) {
      const x = xAxis.range.from + (i / columns) * xSpan;
      const y = curveY(points, x, tension);
      d += `${i ? "L" : "M"}${((i / columns) * width).toFixed(1)} ${(fy(y) * height).toFixed(1)}`;
    }
    return d;
  });

  // Whole numbers for wide ranges, more digits for narrow ones, so values stay readable and steps stay fine
  const decimals = (span: number) => Math.max(0, Math.min(4, Math.ceil(-Math.log10(span / 1000))));
  const round = (n: number, span: number) => Number(n.toFixed(decimals(span)));
  const clampX = (x: number) => Math.min(xAxis.range.to, Math.max(xAxis.range.from, round(x, xSpan)));
  const clampY = (y: number) => Math.min(yAxis.range.to, Math.max(yAxis.range.from, round(y, ySpan)));
  const format = (n: number, span: number) => n.toFixed(Math.max(0, decimals(span) - 1));

  /** Writes points sorted by x (the client evaluates them in list order) and returns where `moved` ended up. */
  function write(next: Vec2[], moved: Vec2 | undefined, delay: number): number {
    const sorted = [...next].sort((a, b) => a.x - b.x);
    onchange(sorted, delay);
    return moved ? sorted.indexOf(moved) : -1;
  }

  function at(event: PointerEvent): Vec2 {
    const box = field.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const py = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    return { x: clampX(xAxis.range.from + px * xSpan), y: clampY(yAxis.range.from + (1 - py) * ySpan) };
  }

  let dragging = $state(-1);
  let hovered = $state(-1);
  let focused = $state(-1);
  let moved = false;
  // The plot captures the pointer, so clicks land on it; this is the point the last press started on
  let pressed = -1;

  function focusPoint(index: number) {
    tick().then(() => pointsBox?.querySelectorAll<HTMLElement>(".point")[index]?.focus());
  }

  function plotDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(".point");
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    moved = false;
    if (target) {
      dragging = pressed = Number(target.dataset.index);
      target.focus();
      return;
    }
    event.preventDefault();
    pressed = -1;
    const point = at(event);
    play("tap");
    dragging = write([...points, point], point, 0);
    focusPoint(dragging);
  }

  function plotMove(event: PointerEvent) {
    if (dragging < 0) return;
    const point = at(event);
    const current = points[dragging];
    if (!current || (current.x === point.x && current.y === point.y)) return;
    moved = true;
    dragging = write(
      points.map((entry, index) => (index === dragging ? point : entry)),
      point,
      DRAG_DELAY,
    );
    focused = dragging;
  }

  function plotUp() {
    if (dragging >= 0 && moved) focusPoint(dragging);
    dragging = -1;
  }

  function remove(index: number) {
    if (points.length <= MIN_POINTS) {
      play("error");
      return;
    }
    play("tap");
    write(
      points.filter((_, i) => i !== index),
      undefined,
      0,
    );
    hovered = -1;
    focusPoint(Math.min(index, points.length - 2));
  }

  function insertAfter(index: number) {
    const a = points[index];
    const b = points[index + 1] ?? points[index - 1];
    if (!b) return;
    const point = { x: clampX((a.x + b.x) / 2), y: clampY(curveY(points, (a.x + b.x) / 2, tension)) };
    play("tap");
    focusPoint(write([...points, point], point, 0));
  }

  function pointKey(event: KeyboardEvent, index: number) {
    const point = points[index];
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(index);
      return;
    }
    if (event.key === "+" || event.key === "Insert") {
      event.preventDefault();
      insertAfter(index);
      return;
    }
    const scale = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-xSpan / 100, 0],
      ArrowRight: [xSpan / 100, 0],
      ArrowUp: [0, ySpan / 100],
      ArrowDown: [0, -ySpan / 100],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = { x: clampX(point.x + move[0] * scale), y: clampY(point.y + move[1] * scale) };
    if (next.x === point.x && next.y === point.y) return;
    const landed = write(
      points.map((entry, i) => (i === index ? next : entry)),
      next,
      DRAG_DELAY,
    );
    if (landed !== index) focusPoint(landed);
  }

  const shown = $derived(dragging >= 0 ? dragging : hovered >= 0 ? hovered : focused);
  const readout = $derived.by(() => {
    const point = points[shown];
    if (!point) return `${yAxis.label} by ${xAxis.label}`;
    return `${xAxis.label} ${format(point.x, xSpan)} · ${yAxis.label} ${format(point.y, ySpan)}`;
  });

  const hueStrip = $derived(
    `linear-gradient(to top, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 100% 50%)`).join(", ")})`,
  );
</script>

<div class="curve" class:hue>
  {#if hue}<span class="strip" style:background={hueStrip} aria-hidden="true"></span>{/if}
  <div
    class="plot"
    class:dragging={dragging >= 0}
    role="group"
    aria-label="{label} curve"
    aria-describedby="curve-{id}-hint"
    onpointerdown={plotDown}
    onpointermove={plotMove}
    onpointerup={plotUp}
    onpointercancel={plotUp}
    ondblclick={() => !moved && pressed >= 0 && remove(pressed)}
  >
    <span class="corner top" aria-hidden="true">{format(yAxis.range.to, ySpan)}</span>
    <span class="corner bottom" aria-hidden="true">{format(yAxis.range.from, ySpan)}</span>
    <div class="field" bind:this={field} bind:clientWidth={width} bind:clientHeight={height}>
      <svg viewBox="0 0 {width || 1} {height || 1}" preserveAspectRatio="none" aria-hidden="true">
        {#each [0.25, 0.5, 0.75] as f (f)}
          <line class="grid" x1={f * width} x2={f * width} y1="0" y2={height} />
          <line class="grid" x1="0" x2={width} y1={f * height} y2={f * height} />
        {/each}
        <path class="line" d={path} />
      </svg>
      <div class="points" bind:this={pointsBox}>
        {#each points as point, index (index)}
          <button
            class="point"
            class:active={index === shown}
            data-index={index}
            style:left="{fx(point.x) * 100}%"
            style:top="{fy(point.y) * 100}%"
            aria-label="Point {index + 1} of {points.length}: {xAxis.label} {format(point.x, xSpan)}, {yAxis.label} {format(point.y, ySpan)}"
            onpointerenter={() => (hovered = index)}
            onpointerleave={() => (hovered = -1)}
            onfocus={() => (focused = index)}
            onblur={() => (focused = -1)}
            onkeydown={(event) => pointKey(event, index)}
          ></button>
        {/each}
      </div>
    </div>
  </div>
  <div class="axis t-footnote" aria-hidden="true">
    <span>{format(xAxis.range.from, xSpan)}</span>
    <span class="readout" class:live={shown >= 0}>{readout}</span>
    <span>{format(xAxis.range.to, xSpan)}</span>
  </div>
  <p class="hint" id="curve-{id}-hint">
    Click to add a point, drag to move it, double-click to remove it. Arrow keys move the focused point, Shift for bigger
    steps, Delete removes it and plus adds one after it.
  </p>
  <span class="live-region" aria-live="polite">{shown >= 0 ? readout : ""}</span>
</div>

<style>
  .curve { position: relative; margin-top: 6px; }
  .curve.hue { padding-left: 12px; }
  .strip { position: absolute; left: 0; top: 8px; width: 6px; height: 124px; border-radius: 3px; }
  .plot {
    position: relative;
    height: 140px;
    border-radius: var(--r-control);
    background: rgb(0 0 0 / 0.14);
    box-shadow: inset 0 0 0 0.5px var(--line);
    touch-action: none;
    cursor: crosshair;
  }
  .field { position: absolute; inset: 8px; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .grid { stroke: rgb(255 255 255 / 0.08); stroke-width: 0.5; vector-effect: non-scaling-stroke; }
  .line {
    fill: none;
    stroke: var(--label);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .corner {
    position: absolute;
    left: 6px;
    font-size: 10px;
    line-height: 12px;
    color: var(--label-3);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .corner.top { top: 4px; }
  .corner.bottom { bottom: 4px; }
  .points { position: absolute; inset: 0; }
  /* A 20px hit area around a 10px dot */
  .point {
    position: absolute;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: grab;
    outline: none;
  }
  .point::after {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 1.5px #fff, 0 1px 3px rgb(0 0 0 / 0.4);
    transition: transform var(--t-press) var(--ease);
  }
  .point.active::after { transform: scale(1.2); }
  .point:focus-visible::after { box-shadow: 0 0 0 1.5px #fff, 0 0 0 3.5px var(--accent), 0 1px 3px rgb(0 0 0 / 0.4); }
  .dragging, .dragging .point { cursor: grabbing; }
  .axis {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
    padding: 0 2px;
    color: var(--label-3);
    font-variant-numeric: tabular-nums;
  }
  .readout { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .readout.live { color: var(--label-2); }
  .hint,
  .live-region {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
