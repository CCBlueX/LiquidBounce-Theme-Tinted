// The module list as the HUD and the overlays show it. Enabled state follows moduleToggle
// right away; binds have no event of their own, so bind edits refetch the list.
import { on, onReconnect } from "./api/events";
import { modules as api } from "./api/routes";
import type { Module } from "./api/types";

const REFETCH_DEBOUNCE_MS = 300;
// A config load or a module that switches others flips many modules at once; those are not the player's toggles
const BURST_MS = 250;
const BURST_SIZE = 4;

type ToggleState = { enabled: boolean; hidden: boolean };

class ModuleStore {
  list = $state.raw<Module[]>([]);
  byName = $derived(new Map(this.list.map((module) => [module.name, module])));
  /** Modules switched on or off since this page loaded, one at a time. */
  toggled = $state.raw<ReadonlySet<string>>(new Set());

  #timer: number | undefined;
  #loading = 0;
  // Toggles that land while a fetch is in flight; the fetched list may predate them
  #pending = new Map<string, ToggleState>();
  #recent: { name: string; at: number }[] = [];

  async load() {
    const run = ++this.#loading;
    this.#pending.clear();
    let list: Module[];
    try {
      list = await api.list();
    } catch {
      return;
    }
    if (run !== this.#loading) return;
    this.list = list.map((module) => {
      const toggled = this.#pending.get(module.name);
      return toggled ? { ...module, ...toggled } : module;
    });
    this.#pending.clear();
  }

  refetchSoon() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.load(), REFETCH_DEBOUNCE_MS);
  }

  #touch(name: string) {
    const now = performance.now();
    this.#recent = this.#recent.filter((toggle) => now - toggle.at < BURST_MS);
    this.#recent.push({ name, at: now });
    const next = new Set(this.toggled);
    if (this.#recent.length >= BURST_SIZE) for (const toggle of this.#recent) next.delete(toggle.name);
    else next.add(name);
    this.toggled = next;
  }

  #toggle(name: string, state: ToggleState) {
    this.#pending.set(name, state);
    const index = this.list.findIndex((module) => module.name === name);
    if (index < 0) return;
    const current = this.list[index];
    if (current.enabled !== state.enabled) this.#touch(name);
    if (current.enabled === state.enabled && current.hidden === state.hidden) return;
    const next = this.list.slice();
    next[index] = { ...current, ...state };
    this.list = next;
  }

  /** Loads the list and keeps it live; returns the unsubscribe. */
  start() {
    this.load();
    // moduleActivation is not used: it fires on disable as well and carries no state
    const offs = [
      on("moduleToggle", (event) => this.#toggle(event.moduleName, { enabled: event.enabled, hidden: event.hidden })),
      on("refreshArrayList", () => this.refetchSoon()),
      onReconnect(() => this.load()),
      on("keybindChange", () => this.refetchSoon()),
      on("valueChanged", (event) => {
        const type = event.value?.valueType;
        if (type === "BIND" || type === "KEY") this.refetchSoon();
      }),
    ];
    return () => {
      for (const off of offs) off();
      clearTimeout(this.#timer);
    };
  }
}

export const moduleStore = new ModuleStore();
