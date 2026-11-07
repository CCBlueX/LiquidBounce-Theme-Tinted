// Quick module switches for the overlays. The switch moves at once; the module store follows the
// client's moduleToggle event, which also clears the pending state. A refused toggle flips back with the error sound.
import { on } from "./api/events";
import { modules } from "./api/routes";
import type { Module } from "./api/types";
import { play } from "./sound";
import { moduleStore } from "./modules.svelte";

// Some modules switch themselves straight back off without a moduleToggle; after this the list is asked again
const SETTLE_MS = 1500;

const pending = $state<Record<string, boolean>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function settle(name: string) {
  clearTimeout(timers.get(name));
  timers.delete(name);
  delete pending[name];
}

/** The state a switch shows: the pending choice while the client has not confirmed it yet. */
export function isOn(module: Module): boolean {
  return pending[module.name] ?? module.enabled;
}

export async function setModule(name: string, enabled: boolean) {
  pending[name] = enabled;
  clearTimeout(timers.get(name));
  timers.set(
    name,
    setTimeout(() => {
      settle(name);
      moduleStore.refetchSoon();
    }, SETTLE_MS),
  );
  try {
    await modules.toggle(name, enabled);
  } catch {
    settle(name);
    play("error");
  }
}

/** Starts the module list and clears pending switches as the client confirms them; returns the stop function. */
export function startModules() {
  const stopStore = moduleStore.start();
  const off = on("moduleToggle", (event) => {
    if (event.moduleName in pending) settle(event.moduleName);
  });
  return () => {
    off();
    stopStore();
    for (const name of [...timers.keys()]) settle(name);
  };
}
