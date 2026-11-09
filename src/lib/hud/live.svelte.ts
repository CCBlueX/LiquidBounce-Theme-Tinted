// Live game state shared by the HUD components: the own armor, scoreboard and effects, and the last attacked player.
// The client sends player data up to 20 times a second; it applies at most every THROTTLE_MS, and only parts that
// changed are written, so standing still re-renders nothing.
import { on, onReconnect } from "../api/events";
import { player } from "../api/routes";
import type { ItemStack, MobEffect, PlayerData, Scoreboard, Vec3 } from "../api/types";

const THROTTLE_MS = 250;
// There is no target-lost event; a target nobody attacked for this long is gone
const TARGET_IDLE_MS = 5000;

const LEVELS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export type EffectChip = { id: string; name: string; level: string; time: string };
export type Me = { name: string; uuid: string; ping: number; dimension: string };
export type TargetInfo = {
  name: string;
  uuid: string;
  health: number;
  maxHealth: number;
  absorption: number;
  distance?: number;
};

// Vanilla's format: minutes and seconds, with hours in front once there are any
function clock(ticks: number) {
  const seconds = Math.max(0, Math.floor(ticks / 20));
  const hours = Math.floor(seconds / 3600);
  const mmss = `${Math.floor(seconds / 60) % 60}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss.padStart(5, "0")}` : mmss;
}

function chipsOf(effects: MobEffect[]): EffectChip[] {
  return effects
    .filter((effect) => effect.showIcon)
    .map((effect) => {
      // Levels past X are numbers, as the client sends amplifiers up to 255
      const level = LEVELS[effect.amplifier] ?? String(effect.amplifier + 1);
      return {
        id: effect.effect,
        name: level ? `${effect.localizedName} ${level}` : effect.localizedName,
        level,
        time: effect.infinite ? "∞" : clock(effect.duration),
      };
    });
}

export function throttle<T>(ms: number, apply: (value: T) => void) {
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

class LiveState {
  armor = $state.raw<ItemStack[]>([]);
  scoreboard = $state.raw<Scoreboard>();
  effects = $state.raw<EffectChip[]>([]);
  target = $state.raw<TargetInfo>();
  me = $state.raw<Me>();

  #position: Vec3 | undefined;
  #armorKey = "[]";
  #scoreboardKey = "";
  #effectsKey = "[]";
  #meKey = "";
  #targetListeners = new Set<() => void>();
  #targetTimer: number | undefined;

  #updatePlayer(data: PlayerData) {
    this.#position = data.position;
    const me = { name: data.username, uuid: data.uuid, ping: data.ping, dimension: data.dimension };
    const meKey = JSON.stringify(me);
    if (meKey !== this.#meKey) {
      this.#meKey = meKey;
      this.me = me;
    }
    const armor = data.armorItems ?? [];
    const armorKey = JSON.stringify(armor);
    if (armorKey !== this.#armorKey) {
      this.#armorKey = armorKey;
      this.armor = armor;
    }
    const scoreboardKey = data.scoreboard ? JSON.stringify(data.scoreboard) : "";
    if (scoreboardKey !== this.#scoreboardKey) {
      this.#scoreboardKey = scoreboardKey;
      this.scoreboard = data.scoreboard;
    }
    // Player data carries the full list, so milk or /effect clear empty it; clientPlayerEffect stops instead
    this.#showEffects(chipsOf(data.effects ?? []));
  }

  #applyPlayer = throttle(THROTTLE_MS, (data: PlayerData) => this.#updatePlayer(data));

  #showEffects(chips: EffectChip[]) {
    const key = JSON.stringify(chips);
    if (key === this.#effectsKey) return;
    this.#effectsKey = key;
    this.effects = chips;
  }

  #applyTarget = throttle(THROTTLE_MS, (target: PlayerData) => {
    const own = this.#position;
    const at = target.position;
    this.target = {
      name: target.username,
      uuid: target.uuid,
      health: target.health,
      maxHealth: target.maxHealth || 20,
      absorption: target.absorption,
      distance: own && at ? Math.hypot(at.x - own.x, at.y - own.y, at.z - own.z) : undefined,
    };
    this.#notifyTarget();
  });

  /** Called whenever the target appears, changes or expires; returns the unsubscribe. */
  onTarget(listener: () => void) {
    this.#targetListeners.add(listener);
    return () => this.#targetListeners.delete(listener);
  }

  #notifyTarget() {
    for (const listener of this.#targetListeners) listener();
  }

  start() {
    // Player data only arrives by event; after a dropped socket the current state comes from the REST route again
    const fetchPlayer = (always: boolean) =>
      player
        .data()
        .then((data) => {
          if (data && (always || !this.#position)) this.#updatePlayer(data);
        })
        .catch(() => {});
    fetchPlayer(false);

    const offs = [
      onReconnect(() => fetchPlayer(true)),
      on("clientPlayerData", (event) => this.#applyPlayer(event.playerData)),
      on("targetChange", (event) => {
        clearTimeout(this.#targetTimer);
        this.#targetTimer = setTimeout(() => {
          this.#applyTarget.cancel();
          this.target = undefined;
          this.#notifyTarget();
        }, TARGET_IDLE_MS);
        this.#applyTarget(event.target);
      }),
    ];

    return () => {
      for (const off of offs) off();
      this.#applyPlayer.cancel();
      this.#applyTarget.cancel();
      this.effects = [];
      this.#effectsKey = "[]";
      clearTimeout(this.#targetTimer);
    };
  }
}

export const live = new LiveState();
