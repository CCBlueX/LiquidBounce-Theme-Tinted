// Writes inspector edits to the client: the local tree changes at once, the PUT carries only the changed value
// wrapped in its groups, and a failed write puts the old value back.
import { SvelteSet } from "svelte/reactivity";
import { modules } from "../../lib/api/routes";
import type { ChoiceGroup, JsonValue, ValueNode } from "../../lib/api/types";
import { play } from "../../lib/sound";
import { choicePatches, pathKey, patchFor, type Trail } from "./tree";

type Burst = { timer: number; before: JsonValue };
/** Every ValueNode holds its value in `value`; the union just cannot be assigned through without narrowing. */
type Writable = { value: JsonValue };

/** Plain copy of a value for the wire; typed through unknown because Snapshot<JsonValue> recurses without end. */
function snapshot(value: JsonValue): JsonValue {
  return $state.snapshot<unknown>(value) as JsonValue;
}

export class SettingsEditor {
  readonly module: string;
  /** Path keys of the inline groups that are open. */
  readonly expanded = new SvelteSet<string>();
  /** Writes scheduled or in flight; a refresh from the client waits until this is 0. */
  pending = $state(0);
  #bursts = new Map<string, Burst>();

  constructor(module: string) {
    this.module = module;
  }

  /**
   * Sets a value and writes it. With `delay` (sliders), changes within the delay go out as one write and a
   * failure restores the value from before the first of them. The promise tells whether the client took it.
   */
  set(trail: Trail, node: ValueNode, next: JsonValue, delay = 0): Promise<boolean> {
    const target: Writable = node;
    const key = pathKey(trail, node.name);
    const burst = this.#bursts.get(key);
    const before = burst ? burst.before : snapshot(target.value);
    if (burst) clearTimeout(burst.timer);
    else this.pending++;
    target.value = next;

    let settle!: (written: boolean) => void;
    const promise = new Promise<boolean>((done) => (settle = done));
    const timer = window.setTimeout(async () => {
      this.#bursts.delete(key);
      try {
        await modules.putSettings(this.module, patchFor(trail, { name: node.name, value: snapshot(target.value) }));
        settle(true);
      } catch {
        target.value = before;
        play("error");
        settle(false);
      } finally {
        this.pending--;
      }
    }, delay);
    this.#bursts.set(key, { timer, before });
    return promise;
  }

  /** Switches a CHOICE to another mode. */
  async choose(trail: Trail, node: ChoiceGroup, active: string): Promise<void> {
    const before = node.active;
    if (before === active) return;
    node.active = active;
    this.pending++;
    try {
      await modules.putSettings(this.module, patchFor(trail, { name: node.name, value: [], active, choices: choicePatches(node) }));
    } catch {
      node.active = before;
      play("error");
    } finally {
      this.pending--;
    }
  }

  dispose() {
    for (const burst of this.#bursts.values()) clearTimeout(burst.timer);
    this.#bursts.clear();
  }
}
