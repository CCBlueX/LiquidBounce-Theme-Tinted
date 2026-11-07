// Live state of the Island: active effects for the compact capsule, and the live activities it expands into.
// Activities are queued by priority (target > scaffold > notification > toggle); whatever shows stays at least
// MIN_DWELL_MS so bursts never flicker. One timer drives every expiry, so 20 Hz event streams cost a comparison each.
import { on } from "../../lib/api/events";
import { player } from "../../lib/api/routes";
import type { MobEffect, PlayerData, Vec3 } from "../../lib/api/types";
import { moduleItem } from "../../lib/icons";
import { moduleStore } from "../../lib/modules.svelte";
import { onCaption, play } from "../../lib/sound";
import { settings } from "../../lib/settings.svelte";

const TOGGLE_MS = 1600;
const NOTE_MS = 3000;
const SCAFFOLD_IDLE_MS = 1500;
const TARGET_IDLE_MS = 3000;
const MIN_DWELL_MS = 600;
// Queued toggles and notifications that waited behind a fight this long are no longer news
const TOGGLE_STALE_MS = 2500;
const NOTE_STALE_MS = 12000;
const NOTE_QUEUE = 6;
const CAPTION_MS = 2500;
// Effects tick 20 times a second, targets and block counts can change as fast; the capsule redraws at most 4/s
const THROTTLE_MS = 250;
const TICK_MS = 50;

const LEVELS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export type EffectChip = { id: string; name: string; level: string; time: string };
export type ToggleActivity = { name: string; item: string; category: string; enabled: boolean; others: number };
export type NoteActivity = { id: number; title: string; message: string; error: boolean; at: number };
export type ScaffoldActivity = { block?: string; blockName: string; count: number; peak: number };
export type TargetActivity = {
  name: string;
  uuid: string;
  health: number;
  maxHealth: number;
  absorption: number;
  distance?: number;
};
export type ActivityKind = "target" | "scaffold" | "notification" | "toggle";

function clock(ticks: number) {
  const seconds = Math.max(0, Math.floor(ticks / 20));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "minecraft:oak_planks" as "Oak planks" (sentence case, the namespace dropped). */
export function blockName(id: string) {
  const path = id.slice(id.indexOf(":") + 1).replaceAll("_", " ");
  return path.charAt(0).toUpperCase() + path.slice(1);
}

function throttle<T>(ms: number, apply: (value: T) => void) {
  let last = 0;
  let timer: number | undefined;
  let pending: T;
  const run = (value: T) => {
    pending = value;
    const wait = last + ms - performance.now();
    if (wait <= 0) {
      last = performance.now();
      apply(value);
    } else if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        last = performance.now();
        apply(pending);
      }, wait);
    }
  };
  run.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return run;
}

export class IslandState {
  effects = $state.raw<EffectChip[]>([]);
  target = $state.raw<TargetActivity>();
  scaffold = $state.raw<ScaffoldActivity>();
  notes = $state.raw<NoteActivity[]>([]);
  toggle = $state.raw<ToggleActivity>();
  kind = $state<ActivityKind>();
  caption = $state("");

  #shownAt = 0;
  #targetSeen = 0;
  #scaffoldSeen = 0;
  #scaffoldKey = "";
  #toggleAt = 0;
  #burst = new Set<string>();
  #effectsUntil = Infinity;
  #ownPosition: Vec3 | undefined;
  #noteId = 0;
  #timer: number | undefined;
  #timerAt = Infinity;
  #captionTimer: number | undefined;

  #applyEffects = throttle(THROTTLE_MS, (effects: MobEffect[]) => {
    const shown = effects.filter((effect) => effect.showIcon);
    this.effects = shown.map((effect) => ({
      id: effect.effect,
      name: LEVELS[effect.amplifier] ? `${effect.localizedName} ${LEVELS[effect.amplifier]}` : effect.localizedName,
      level: LEVELS[effect.amplifier] ?? String(effect.amplifier + 1),
      time: effect.infinite ? "∞" : clock(effect.duration),
    }));
    // The client stops sending once the last effect ends instead of sending an empty list
    const longest = shown.some((effect) => effect.infinite)
      ? Infinity
      : Math.max(0, ...shown.map((effect) => effect.duration));
    this.#effectsUntil = shown.length ? performance.now() + longest * TICK_MS + 1000 : Infinity;
    if (this.#effectsUntil !== Infinity) this.#wake(this.#effectsUntil);
  });

  #applyTarget = throttle(THROTTLE_MS, (target: PlayerData) => {
    const own = this.#ownPosition;
    const at = target.position;
    this.target = {
      name: target.username,
      uuid: target.uuid,
      health: target.health,
      maxHealth: target.maxHealth || 20,
      absorption: target.absorption,
      distance: own && at ? Math.hypot(at.x - own.x, at.y - own.y, at.z - own.z) : undefined,
    };
    this.#pick();
  });

  #applyScaffold = throttle(THROTTLE_MS, ({ block, count }: { block?: string; count: number }) => {
    const previous = this.scaffold;
    // A new block type, or a refilled hotbar, starts a new full bar
    const peak = previous && previous.block === block ? Math.max(previous.peak, count) : count;
    this.scaffold = { block, blockName: block ? blockName(block) : "", count, peak };
    this.#pick();
  });

  start() {
    player
      .data()
      .then((data) => {
        if (!data) return;
        this.#ownPosition = data.position;
        if (data.effects?.length) this.#applyEffects(data.effects);
      })
      .catch(() => {});

    const offs = [
      on("clientPlayerEffect", (event) => this.#applyEffects(event.effects)),
      on("clientPlayerData", (event) => {
        this.#ownPosition = event.playerData.position;
      }),
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
        play("notify");
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
      on("targetChange", (event) => {
        this.#targetSeen = performance.now();
        this.#applyTarget(event.target);
      }),
      on("death", () => {
        this.#applyEffects.cancel();
        this.effects = [];
        this.#effectsUntil = Infinity;
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
      this.#applyEffects.cancel();
      this.#applyTarget.cancel();
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
    this.toggle = { name, item: moduleItem(name, category), category, enabled, others: this.#burst.size - 1 };
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

    if (this.target && now - this.#targetSeen >= TARGET_IDLE_MS) this.target = undefined;
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
    if (this.effects.length && now >= this.#effectsUntil) {
      this.effects = [];
      this.#effectsUntil = Infinity;
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

    if (this.target) next = Math.min(next, this.#targetSeen + TARGET_IDLE_MS);
    if (this.scaffold) next = Math.min(next, this.#scaffoldSeen + SCAFFOLD_IDLE_MS);
    if (this.kind === "notification") next = Math.min(next, this.#shownAt + NOTE_MS);
    if (this.kind === "toggle") next = Math.min(next, this.#shownAt + TOGGLE_MS);
    if (this.toggle && this.kind !== "toggle") next = Math.min(next, this.#toggleAt + TOGGLE_STALE_MS);
    if (this.effects.length) next = Math.min(next, this.#effectsUntil);
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
