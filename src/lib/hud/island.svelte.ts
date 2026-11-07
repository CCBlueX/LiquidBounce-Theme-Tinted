// The live activities the Island expands into, queued by priority (target > scaffold > notification > toggle).
// Whatever shows stays at least MIN_DWELL_MS so bursts never flicker. One timer drives every expiry, so 20 Hz event
// streams cost a comparison each. Effects and the target come from the shared live state.
import { on } from "../api/events";
import { moduleStore } from "../modules.svelte";
import { onCaption, play } from "../sound";
import { settings } from "../settings.svelte";
import { live, throttle, type TargetInfo } from "./live.svelte";

const TOGGLE_MS = 1600;
const NOTE_MS = 3000;
const SCAFFOLD_IDLE_MS = 1500;
const MIN_DWELL_MS = 600;
// Queued toggles and notifications that waited behind a fight this long are no longer news
const TOGGLE_STALE_MS = 2500;
const NOTE_STALE_MS = 12000;
const NOTE_QUEUE = 6;
const CAPTION_MS = 2500;
const THROTTLE_MS = 250;

export type ToggleActivity = { name: string; category: string; enabled: boolean; others: number };
export type NoteActivity = { id: number; title: string; message: string; error: boolean; at: number };
export type ScaffoldActivity = { block?: string; blockName: string; count: number; peak: number };
export type ActivityKind = "target" | "scaffold" | "notification" | "toggle";

/** "minecraft:oak_planks" as "Oak planks" (sentence case, the namespace dropped). */
export function blockName(id: string) {
  const path = id.slice(id.indexOf(":") + 1).replaceAll("_", " ");
  return path.charAt(0).toUpperCase() + path.slice(1);
}

export class IslandState {
  scaffold = $state.raw<ScaffoldActivity>();
  notes = $state.raw<NoteActivity[]>([]);
  toggle = $state.raw<ToggleActivity>();
  kind = $state<ActivityKind>();
  caption = $state("");
  // Off while the Target component shows the fight on its own
  #showTarget = $state(true);

  #shownAt = 0;
  #scaffoldSeen = 0;
  #scaffoldKey = "";
  #toggleAt = 0;
  #burst = new Set<string>();
  #noteId = 0;
  #timer: number | undefined;
  #timerAt = Infinity;
  #captionTimer: number | undefined;

  readonly #quiet: boolean;

  /** A quiet Island (the editor's copy) leaves the notification sound to the HUD. */
  constructor(quiet = false) {
    this.#quiet = quiet;
  }

  get target(): TargetInfo | undefined {
    return this.#showTarget ? live.target : undefined;
  }

  set showTarget(value: boolean) {
    if (value === this.#showTarget) return;
    this.#showTarget = value;
    this.#pick();
  }

  #applyScaffold = throttle(THROTTLE_MS, ({ block, count }: { block?: string; count: number }) => {
    const previous = this.scaffold;
    // A new block type, or a refilled hotbar, starts a new full bar
    const peak = previous && previous.block === block ? Math.max(previous.peak, count) : count;
    this.scaffold = { block, blockName: block ? blockName(block) : "", count, peak };
    this.#pick();
  });

  start() {
    const offs = [
      live.onTarget(() => this.#pick()),
      on("moduleToggle", (event) => this.#onToggle(event.moduleName, event.enabled)),
      on("notification", (event) => {
        // Module notifications repeat what the toggle activity already shows
        if ((event.severity === "ENABLED" || event.severity === "DISABLED") && moduleStore.byName.has(event.message)) {
          return;
        }
        const note = {
          id: ++this.#noteId,
          title: event.title,
          message: event.message,
          error: event.severity === "ERROR",
          at: performance.now(),
        };
        const queue = [...this.notes, note];
        // Keep the one on screen and the newest few
        this.notes = queue.length > NOTE_QUEUE ? [queue[0], ...queue.slice(queue.length - NOTE_QUEUE + 1)] : queue;
        if (!this.#quiet) play("notify");
        this.#pick();
      }),
      on("blockCountChange", (event) => {
        if (event.count === undefined) {
          this.#scaffoldKey = "";
          this.#applyScaffold.cancel();
          if (this.scaffold) {
            this.scaffold = undefined;
            this.#pick();
          }
          return;
        }
        this.#scaffoldSeen = performance.now();
        const key = `${event.nextBlock ?? ""}|${event.count}`;
        if (key === this.#scaffoldKey) return;
        this.#scaffoldKey = key;
        this.#applyScaffold({ block: event.nextBlock, count: event.count });
      }),
      onCaption((caption) => {
        if (!settings.soundCaptions) return;
        this.caption = caption;
        clearTimeout(this.#captionTimer);
        this.#captionTimer = setTimeout(() => (this.caption = ""), CAPTION_MS);
      }),
    ];

    return () => {
      for (const off of offs) off();
      this.#applyScaffold.cancel();
      clearTimeout(this.#timer);
      clearTimeout(this.#captionTimer);
    };
  }

  #onToggle(name: string, enabled: boolean) {
    const now = performance.now();
    const fresh = !this.toggle || (this.kind !== "toggle" && now - this.#toggleAt > TOGGLE_STALE_MS);
    if (fresh) this.#burst.clear();
    this.#burst.add(name);
    const category = moduleStore.byName.get(name)?.category ?? "";
    this.toggle = { name, category, enabled, others: this.#burst.size - 1 };
    this.#toggleAt = now;
    // A toggle on screen restarts its time with the newest change
    if (this.kind === "toggle") this.#shownAt = now;
    this.#pick();
  }

  #valid(kind: ActivityKind | undefined) {
    if (kind === "target") return !!this.target;
    if (kind === "scaffold") return !!this.scaffold;
    if (kind === "notification") return this.notes.length > 0;
    if (kind === "toggle") return !!this.toggle;
    return false;
  }

  #pick() {
    const now = performance.now();

    if (this.scaffold && now - this.#scaffoldSeen >= SCAFFOLD_IDLE_MS) {
      this.scaffold = undefined;
      this.#scaffoldKey = "";
    }
    if (this.kind === "notification" && now - this.#shownAt >= NOTE_MS) {
      this.notes = this.notes.slice(1);
      this.#shownAt = now;
    }
    if (this.kind === "toggle" && now - this.#shownAt >= TOGGLE_MS) {
      this.toggle = undefined;
      this.#burst.clear();
    }
    if (this.toggle && this.kind !== "toggle" && now - this.#toggleAt > TOGGLE_STALE_MS) {
      this.toggle = undefined;
      this.#burst.clear();
    }
    const showing = this.kind === "notification" ? 1 : 0;
    if (this.notes.slice(showing).some((note) => now - note.at > NOTE_STALE_MS)) {
      this.notes = this.notes.filter((note, index) => index < showing || now - note.at <= NOTE_STALE_MS);
    }

    const best: ActivityKind | undefined = this.target
      ? "target"
      : this.scaffold
        ? "scaffold"
        : this.notes.length
          ? "notification"
          : this.toggle
            ? "toggle"
            : undefined;

    let next = Infinity;
    if (best !== this.kind) {
      if (this.#valid(this.kind) && now - this.#shownAt < MIN_DWELL_MS) {
        next = this.#shownAt + MIN_DWELL_MS;
      } else {
        this.kind = best;
        this.#shownAt = now;
      }
    }

    if (this.scaffold) next = Math.min(next, this.#scaffoldSeen + SCAFFOLD_IDLE_MS);
    if (this.kind === "notification") next = Math.min(next, this.#shownAt + NOTE_MS);
    if (this.kind === "toggle") next = Math.min(next, this.#shownAt + TOGGLE_MS);
    if (this.toggle && this.kind !== "toggle") next = Math.min(next, this.#toggleAt + TOGGLE_STALE_MS);
    if (next !== Infinity) this.#wake(next);
  }

  #wake(at: number) {
    if (this.#timer !== undefined && this.#timerAt <= at) return;
    clearTimeout(this.#timer);
    this.#timerAt = at;
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        this.#timerAt = Infinity;
        this.#pick();
      },
      Math.max(0, at - performance.now()) + 1,
    );
  }
}
