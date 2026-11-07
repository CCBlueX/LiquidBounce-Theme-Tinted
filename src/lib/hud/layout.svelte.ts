// Keeps every HUD component inside the window and tells the growing ones how much room they have. Components claim
// room in a fixed order: fixed-size ones first, then the Scoreboard, Modules, Effects and last the Island, which is
// the most transient. Each one stops short of the window edge and of the components placed before it in the
// direction it grows, so a long list never runs off screen or under another component.
import { getContext, setContext } from "svelte";
import type { Alignment } from "../api/types";

const EDGE = 8;
const GAP = 8;
const SLOT = Symbol("hud-slot");

type Grow = "x" | "y";
type Box = { left: number; top: number; right: number; bottom: number };

/** One placed component: its clamp shift and, once its view claims an axis, the room it may fill along it. */
export class Slot {
  width = $state(Infinity);
  height = $state(Infinity);
  shiftX = $state(0);
  shiftY = $state(0);

  grow: Grow | undefined;
  rank = 0;
  alignment: Alignment;
  // The widest cross-axis extent seen since the last move; a list that narrows when rows hide keeps its column
  cross = 0;
  #layout: Layout | undefined;

  constructor(alignment: Alignment) {
    this.alignment = alignment;
  }

  /** A view grows along `grow`; a lower rank claims room first. */
  claim(grow: Grow, rank: number) {
    this.grow = grow;
    this.rank = rank;
    this.#layout?.update();
  }

  align(alignment: Alignment) {
    this.alignment = alignment;
    this.cross = 0;
    this.#layout?.update();
  }

  mount(element: HTMLElement) {
    const container = element.offsetParent as HTMLElement | null;
    if (!container) return () => {};
    let layout = layouts.get(container);
    if (!layout) {
      layout = new Layout(container);
      layouts.set(container, layout);
    }
    this.#layout = layout;
    layout.add(this, element);
    return () => {
      layout.remove(this);
      this.#layout = undefined;
    };
  }
}

const layouts = new WeakMap<HTMLElement, Layout>();

class Layout {
  #container: HTMLElement;
  #slots = new Map<Slot, HTMLElement>();
  #observer = new ResizeObserver(() => this.update());
  #frame = 0;
  #width = 0;
  #height = 0;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.#observer.observe(container);
  }

  add(slot: Slot, element: HTMLElement) {
    this.#slots.set(slot, element);
    this.#observer.observe(element);
    this.update();
  }

  remove(slot: Slot) {
    const element = this.#slots.get(slot);
    if (element) this.#observer.unobserve(element);
    this.#slots.delete(slot);
    if (this.#slots.size === 0) {
      this.#observer.disconnect();
      cancelAnimationFrame(this.#frame);
      layouts.delete(this.#container);
    } else this.update();
  }

  // Next frame, so writes never land inside a ResizeObserver delivery
  update() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#run();
    });
  }

  #run() {
    // Unrounded sizes in canvas pixels; offsetWidth rounds, which can leave a clamped box half a pixel outside
    const zoom = this.#container.currentCSSZoom;
    const outer = this.#container.getBoundingClientRect();
    const W = outer.width / zoom;
    const H = outer.height / zoom;
    if (W !== this.#width || H !== this.#height) {
      this.#width = W;
      this.#height = H;
      for (const slot of this.#slots.keys()) slot.cross = 0;
    }
    const placed: Box[] = [];
    const order = [...this.#slots].sort(([a], [b]) => (a.grow ? a.rank : -1) - (b.grow ? b.rank : -1));
    for (const [slot, element] of order) {
      const rect = element.getBoundingClientRect();
      const w = rect.width / zoom;
      const h = rect.height / zoom;
      const { horizontalAlignment: ha, horizontalOffset: x, verticalAlignment: va, verticalOffset: y } = slot.alignment;
      const left = ha === "Left" ? x : ha === "Right" ? W - x - w : W / 2 + x - w / 2;
      const top = va === "Top" ? y : va === "Bottom" ? H - y - h : H / 2 + y - h / 2;
      const shiftX = clamp(left, 0, W - w) - left;
      const shiftY = clamp(top, 0, H - h) - top;
      slot.shiftX = shiftX;
      slot.shiftY = shiftY;
      const box = { left: left + shiftX, top: top + shiftY, right: left + shiftX + w, bottom: top + shiftY + h };

      if (slot.grow === "y") {
        slot.cross = Math.max(slot.cross, w);
        const [from, to] = band(ha, box.left, box.right, slot.cross);
        const blockers = placed.filter((other) => other.left < to && other.right > from).map((o) => [o.top, o.bottom]);
        slot.height = room(va, top, top + h, H, blockers);
      } else if (slot.grow === "x") {
        slot.cross = Math.max(slot.cross, h);
        const [from, to] = band(va, box.top, box.bottom, slot.cross);
        const blockers = placed.filter((other) => other.top < to && other.bottom > from).map((o) => [o.left, o.right]);
        slot.width = room(ha, left, left + w, W, blockers);
      }
      placed.push(box);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** The cross-axis stretch a component covers, from its anchored edge out to the widest extent it has had. */
function band(anchor: string, start: number, end: number, extent: number): [number, number] {
  if (anchor === "Left" || anchor === "Top") return [start, start + extent];
  if (anchor === "Right" || anchor === "Bottom") return [end - extent, end];
  const middle = (start + end) / 2;
  return [middle - extent / 2, middle + extent / 2];
}

/**
 * Room along one axis from the anchored edge (or the centre) to the window edge or the nearest blocker that way. A
 * component anchored at or past the window edge is pinned there by the clamp and grows back in; it gets at least a
 * third of the window unless a blocker is what stops it.
 */
function room(anchor: string, start: number, end: number, size: number, blockers: number[][]) {
  const forward = anchor === "Left" || anchor === "Top";
  const backward = anchor === "Right" || anchor === "Bottom";
  const point = clamp(forward ? start : backward ? end : (start + end) / 2, 0, size);
  let low = EDGE;
  let high = size - EDGE;
  for (const [from, to] of blockers) {
    if (to <= point) low = Math.max(low, to + GAP);
    else if (from >= point) high = Math.min(high, from - GAP);
  }
  const ahead = high - point;
  const behind = point - low;
  const value = forward ? ahead : backward ? behind : 2 * Math.min(behind, ahead);
  const limit = forward || (!backward && ahead <= behind) ? high : low;
  const open = limit === size - EDGE || limit === EDGE;
  return Math.max(0, Math.floor(open ? Math.max(value, (size - 2 * EDGE) / 3) : value));
}

export function provideSlot(slot: Slot) {
  setContext(SLOT, slot);
}

/** The slot of the component a view is placed in; views outside a placed box get none. */
export function slotOf(): Slot | undefined {
  return getContext<Slot | undefined>(SLOT);
}
