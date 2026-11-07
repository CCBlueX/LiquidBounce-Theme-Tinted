// The module list as the HUD and the overlays show it. Enabled state follows moduleToggle
// right away; binds have no event of their own, so bind edits refetch the list.
import { on, onReconnect } from "./api/events";
import { modules as api, storage } from "./api/routes";
import type { Module } from "./api/types";

const REFETCH_DEBOUNCE_MS = 300;
// A config load or a module that switches others flips many modules at once; those are not the player's toggles
const BURST_SIZE = 4;
const BURST_MS = 250;
// The HUD page reloads on every world join and theme switch, so the toggled modules live in the client's storage;
// the most recent ones stay, older ones drop back into the count
const TOGGLED_KEY = "tinted.toggledModules";
const TOGGLED_KEEP = 16;

type ToggleState = { enabled: boolean; hidden: boolean };

class ModuleStore {
  list = $state.raw<Module[]>([]);
  byName = $derived(new Map(this.list.map((module) => [module.name, module])));
  /** Modules the player switched on or off one at a time lately, oldest first, kept across page loads. */
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
    let names = [...this.toggled].filter((toggled) => toggled !== name);
    if (this.#recent.length >= BURST_SIZE) {
      const burst = new Set(this.#recent.map((toggle) => toggle.name));
      names = names.filter((toggled) => !burst.has(toggled));
    } else {
      names.push(name);
    }
    this.toggled = new Set(names.slice(-TOGGLED_KEEP));
    storage.set(TOGGLED_KEY, JSON.stringify([...this.toggled])).catch(() => {});
  }

  async #restoreToggled() {
    let saved: unknown;
    try {
      saved = JSON.parse((await storage.get(TOGGLED_KEY)) ?? "[]");
    } catch {
      return;
    }
    if (!Array.isArray(saved)) return;
    // Toggles that arrived while loading are newer than the saved ones
    const names = saved.filter((name): name is string => typeof name === "string" && !this.toggled.has(name));
    this.toggled = new Set([...names, ...this.toggled].slice(-TOGGLED_KEEP));
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
    this.#restoreToggled();
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
