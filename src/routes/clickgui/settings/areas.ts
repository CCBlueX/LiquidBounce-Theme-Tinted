// The two trees the Settings view shows: Tinted's own values (HUD > Themes > Tinted, written to the HUD module) and
// the client's global settings (root "Settings", written to /global).
import { globalSettings, modules } from "../../../lib/api/routes";
import type { ConfigurableGroup, ToggleableGroup, ValueGroup } from "../../../lib/api/types";
import { humanize, locate, treeEntries, type SettingHit, type SettingsArea, type Trail } from "../tree";

/** The theme's group in the HUD module tree. */
export const TINTED_PATH = ["Themes", "Tinted"];
/** The theme's own values; its Colors and Components groups are edited elsewhere. */
const TINTED_GROUPS = ["Accessibility", "Sound", "ModuleList"];
/** Global groups in the order the view lists them; groups not named here follow in the client's order. */
const CLIENT_ORDER = [
  "Language",
  "Targets",
  "Commands",
  "ClientChat",
  "RichPresence",
  "AutoTranslate",
  "ViewModel",
  "Teleport",
  "GuiRenderer",
  "RotationManager",
  "BlinkManager",
];

const TITLES: Record<string, string> = {
  ClientChat: "Chat",
  RotationManager: "Rotations",
  BlinkManager: "Blink",
  GuiRenderer: "GUI renderer",
};

/** Lines under a section title, for groups whose effect is not obvious from their values. */
export const NOTES: Record<string, string> = {
  ClientChat: "Connects to the LiquidBounce chat while on",
};

export function title(name: string): string {
  return TITLES[name] ?? humanize(name);
}

/** What one area shows: its root group (reduced to the shown sections), the trail above it, and its names from the tree root. */
export type AreaRoot = { group: ValueGroup; trail: Trail; base: string[] };

export function tintedRoot(hud: ToggleableGroup): AreaRoot | undefined {
  const found = locate(hud, TINTED_PATH);
  if (!found) return undefined;
  const value = TINTED_GROUPS.flatMap((name) => found.group.value.filter((node) => node.name === name));
  // A view of the same nodes, so edits reach the loaded tree; patches only take the group's name and type from it
  return { group: { ...found.group, value } as ValueGroup, trail: found.trail, base: TINTED_PATH };
}

export function clientRoot(root: ConfigurableGroup): AreaRoot {
  const rank = (name: string) => {
    const at = CLIENT_ORDER.indexOf(name);
    return at < 0 ? CLIENT_ORDER.length : at;
  };
  const value = [...root.value].sort((a, b) => rank(a.name) - rank(b.name));
  return { group: { ...root, value }, trail: [], base: [] };
}

export const loadHud = (): Promise<ToggleableGroup> => modules.settings("HUD");
export const loadClient = (): Promise<ConfigurableGroup> => globalSettings.get();

/** valueChanged keys are lowerCamelCase paths; Tinted's are under liquidbounce.module.hud.themes.tinted. */
export function changes(key: string | undefined): SettingsArea | undefined {
  if (!key) return undefined;
  const lower = key.toLowerCase();
  if (/\.themes\.tinted\.(accessibility|sound|modulelist)\./.test(lower)) return "tinted";
  return lower.startsWith("liquidbounce.module.") ? undefined : "client";
}

/** Search entries for both areas; `names` run from the area's root group (Tinted, or the global root). */
export async function areaEntries(): Promise<SettingHit[]> {
  const [hud, client] = await Promise.allSettled([loadHud(), loadClient()]);
  const hits: SettingHit[] = [];
  const tinted = hud.status === "fulfilled" ? tintedRoot(hud.value) : undefined;
  if (tinted) {
    for (const entry of treeEntries(tinted.group, ["Settings", "Tinted"], title)) hits.push({ ...entry, area: "tinted" });
  }
  if (client.status === "fulfilled") {
    for (const entry of treeEntries(client.value, ["Settings"], title)) hits.push({ ...entry, area: "client" });
  }
  return hits;
}
