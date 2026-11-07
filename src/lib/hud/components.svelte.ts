// The theme's HUD components with their user-set alignment, shared by the HUD browser and the HUD editor.
import { request } from "../api/client";
import { on, onReconnect } from "../api/events";
import type { Alignment, HudComponent } from "../api/types";
import { moduleStore } from "../modules.svelte";
import { live } from "./live.svelte";

export const THEME_ID = "tinted";
export const COMPONENT_NAMES = ["Island", "Modules", "Scoreboard", "Armor", "Effects", "Target"];

/** Context key the editor sets, so its live copies of the components stay silent. */
export const EDITING = Symbol("hud-editing");

type Declaration = { name: string; description?: string; enabled: boolean; alignment: Alignment };

/**
 * Inline style that puts a component where the client's alignment says, moved by `shiftX`/`shiftY` to stay inside
 * the window; the HUD and the editor both use it.
 */
export function place(
  { horizontalAlignment: h, horizontalOffset: x, verticalAlignment: v, verticalOffset: y }: Alignment,
  shiftX = 0,
  shiftY = 0,
) {
  const style: string[] = [];
  if (h === "Left") style.push(`left: ${x}px`);
  else if (h === "Right") style.push(`right: ${x}px`);
  else style.push(`left: calc(50% + ${x}px)`);
  if (v === "Top") style.push(`top: ${y}px`);
  else if (v === "Bottom") style.push(`bottom: ${y}px`);
  else style.push(`top: calc(50% + ${y}px)`);
  const tx = h === "CenterTranslated" ? `calc(-50% + ${shiftX}px)` : `${shiftX}px`;
  const ty = v === "CenterTranslated" ? `calc(-50% + ${shiftY}px)` : `${shiftY}px`;
  style.push(`translate: ${tx} ${ty}`);
  // The anchored edge decides which way a component grows when its content changes
  style.push(`align-items: ${h === "Right" ? "flex-end" : h === "Left" ? "flex-start" : "center"}`);
  return style.join("; ");
}

class HudComponents {
  list = $state.raw<HudComponent[]>([]);
  shown = $derived(this.list.filter((component) => component.settings.enabled && COMPONENT_NAMES.includes(component.name)));

  isOn(name: string) {
    return this.list.some((component) => component.name === name && component.settings.enabled);
  }

  // The client lists the theme's components. Until it knows the theme (a dev server, a theme loaded from outside the
  // client) the theme's own declarations are the layout, with their names as ids.
  async #load(): Promise<HudComponent[]> {
    try {
      const list = await request<HudComponent[]>("GET", `/components/${THEME_ID}`);
      // An empty list means the client does not know this theme (loaded from a URL), not that nothing is enabled
      if (Array.isArray(list) && list.length > 0) return list;
    } catch {
      // fall through to the declarations
    }
    return Promise.all(
      COMPONENT_NAMES.map(async (name) => {
        const response = await fetch(new URL(`components/${name.toLowerCase()}.json`, document.baseURI));
        const declaration: Declaration = await response.json();
        return {
          name: declaration.name,
          description: declaration.description ?? "",
          id: declaration.name,
          settings: { enabled: declaration.enabled, zIndex: 0, alignment: declaration.alignment },
        } satisfies HudComponent;
      }),
    );
  }

  #patch(id: string, settings: { alignment: Alignment } | { enabled: boolean }) {
    this.list = this.list.map((component) =>
      component.id === id ? { ...component, settings: { ...component.settings, ...settings } } : component,
    );
  }

  /** Moves a component here only; saveAlignment tells the client. */
  move(id: string, alignment: Alignment) {
    this.#patch(id, { alignment });
  }

  saveAlignment(id: string, alignment: Alignment) {
    this.move(id, alignment);
    return request("POST", `/components/${encodeURIComponent(id)}/alignment`, { body: alignment });
  }

  /** Adding enables the theme's instance; there is no removal, a component is switched off in its settings. */
  async setEnabled(component: HudComponent, enabled: boolean) {
    this.#patch(component.id, { enabled });
    const path = `/components/${encodeURIComponent(component.id)}`;
    try {
      if (enabled) await request("POST", path);
      else await request("PUT", `${path}/settings`, { body: { name: component.name, value: [{ name: "Enabled", value: false }] } });
    } catch (error) {
      this.#patch(component.id, { enabled: !enabled });
      throw error;
    }
  }

  /** Loads the components and keeps them, the module list and the live game state current; returns the stop. */
  start() {
    let running = true;
    // Moves and switches made while the event socket was down are lost, so a reconnect loads the list again
    const load = () =>
      this.#load()
        .then((list) => {
          if (running) this.list = list;
        })
        .catch(() => {});
    load();
    const offs = [
      on("componentsUpdate", (event) => {
        if (event.source === "theme" && (event.themeId ?? THEME_ID) === THEME_ID) this.list = event.components;
      }),
      onReconnect(load),
      moduleStore.start(),
      live.start(),
    ];
    return () => {
      running = false;
      for (const off of offs) off();
    };
  }
}

export const hud = new HudComponents();
