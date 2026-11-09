// Helpers for module settings trees: walking groups the way the inspector shows them, building PUT patches,
// and formatting names and numbers.
import type {
  Argb,
  BooleanValue,
  ChoiceGroup,
  FloatValue,
  FloatRangeValue,
  IntRangeValue,
  IntValue,
  Module,
  ValueGroup,
  ValueNode,
  ValuePatch,
} from "../../lib/api/types";

/** One group on the way from the module root to a value; `choice` is set when the value sits in a CHOICE's mode. */
export type Step = { node: ValueGroup; choice?: string };
/** Groups from the module root (first) down to a value's parent. */
export type Trail = Step[];
export type Item = { node: ValueNode; trail: Trail };

export function isGroup(node: ValueNode): node is ValueGroup {
  return node.valueType === "CONFIGURABLE" || node.valueType === "TOGGLEABLE" || node.valueType === "CHOICE";
}

/** The BOOLEAN "Enabled" child that carries a nested TOGGLEABLE's state. Module roots have none. */
export function enabledOf(group: ValueGroup): BooleanValue | undefined {
  if (group.valueType !== "TOGGLEABLE") return undefined;
  return group.value.find((node): node is BooleanValue => node.name === "Enabled" && node.valueType === "BOOLEAN");
}

/** Values shown inside a group: its own values without "Enabled", then a CHOICE's active mode values. */
export function contents(group: ValueGroup, trail: Trail): Item[] {
  const own: Trail = [...trail, { node: group }];
  const items: Item[] = [];
  for (const node of group.value) {
    if (group.valueType === "TOGGLEABLE" && node.name === "Enabled" && node.valueType === "BOOLEAN") continue;
    items.push({ node, trail: own });
  }
  if (group.valueType === "CHOICE") {
    const mode = group.choices[group.active];
    if (mode) {
      const modeTrail: Trail = [...trail, { node: group, choice: group.active }];
      for (const node of mode.value) items.push({ node, trail: modeTrail });
    }
  }
  return items;
}

/** Finds a group by the names on its way down from the root (CHOICE modes are followed through the active one). */
export function locate(root: ValueGroup, names: string[]): { group: ValueGroup; trail: Trail } | undefined {
  let group = root;
  let trail: Trail = [];
  for (const name of names) {
    const item = contents(group, trail).find((candidate) => candidate.node.name === name && isGroup(candidate.node));
    if (!item) return undefined;
    trail = item.trail;
    group = item.node as ValueGroup;
  }
  return { group, trail };
}

/** Stable id of a value inside its module: group names and the value name joined by "/". */
export function pathKey(trail: Trail, name: string): string {
  return [...trail.slice(1).map((step) => step.node.name), name].join("/");
}

/**
 * Empty patches for every mode of a CHOICE. The client reads `active` and every mode under `choices` when it
 * applies a CHOICE; leaving `choices` out makes it skip the whole group.
 */
export function choicePatches(node: ChoiceGroup, choice?: string, inner?: ValuePatch): Record<string, ValuePatch> {
  const patches: Record<string, ValuePatch> = {};
  for (const name of Object.keys(node.choices)) {
    patches[name] = { name, value: name === choice && inner ? [inner] : [] };
  }
  return patches;
}

/** Wraps a value patch in its groups up to the module root; the root name is the module name. */
export function patchFor(trail: Trail, leaf: ValuePatch): ValuePatch {
  let patch = leaf;
  for (let i = trail.length - 1; i >= 0; i--) {
    const { node, choice } = trail[i];
    patch =
      node.valueType === "CHOICE"
        ? { name: node.name, value: choice ? [] : [patch], active: node.active, choices: choicePatches(node, choice, patch) }
        : { name: node.name, value: [patch] };
  }
  return patch;
}

/** "MaxPerTick" -> "Max per tick", keeps acronyms such as CPS and FOV. */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ");
  return words.map((word, i) => (i === 0 || /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase())).join(" ");
}

/** "minecraft:magma_cream" -> "Magma cream". */
export function idName(id: string): string {
  const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const text = path.replace(/[_/.]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Ranged = IntValue | FloatValue | IntRangeValue | FloatRangeValue;

export function isInt(node: Ranged): boolean {
  return node.valueType === "INT" || node.valueType === "INT_RANGE";
}

/** Slider step: whole numbers for INT, a step that gives about 100 to 500 positions for FLOAT. */
export function stepOf(node: Ranged): number {
  if (isInt(node)) return 1;
  const span = node.range.to - node.range.from;
  return span <= 1 ? 0.01 : span <= 10 ? 0.05 : span <= 50 ? 0.1 : 1;
}

export function formatNumber(value: number, int: boolean): string {
  if (int) return String(Math.round(value));
  return Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

export function withSuffix(text: string, suffix: string | undefined): string {
  if (!suffix) return text;
  return /^[%°]/.test(suffix) ? text + suffix : `${text} ${suffix}`;
}

export function formatRanged(node: Ranged): string {
  const int = isInt(node);
  if (node.valueType === "INT_RANGE" || node.valueType === "FLOAT_RANGE") {
    const { from, to } = node.value;
    return withSuffix(from === to ? formatNumber(from, int) : `${formatNumber(from, int)} – ${formatNumber(to, int)}`, node.suffix);
  }
  return withSuffix(formatNumber(node.value, int), node.suffix);
}

// Colors are signed 32-bit ARGB ints
export function channels(argb: Argb) {
  const u = argb >>> 0;
  return { a: (u >>> 24) & 255, r: (u >>> 16) & 255, g: (u >>> 8) & 255, b: u & 255 };
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

/** "#RRGGBB" for opaque colors, "#RRGGBBAA" otherwise. */
export function toHex(argb: Argb): string {
  const { a, r, g, b } = channels(argb);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a === 255 ? "" : hex2(a)}`;
}

/** Parses #RGB, #RRGGBB or #RRGGBBAA; undefined when the text is not a color. */
export function fromHex(text: string): Argb | undefined {
  let hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return undefined;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return ((a << 24) | (r << 16) | (g << 8) | b) | 0;
}

export function withAlpha(argb: Argb, alpha: number): Argb {
  return ((Math.round(alpha) & 255) << 24) | ((argb >>> 0) & 0xffffff) | 0;
}

export function cssColor(argb: Argb, opaque = false): string {
  const { a, r, g, b } = channels(argb);
  return `rgb(${r} ${g} ${b} / ${opaque ? 1 : (a / 255).toFixed(3)})`;
}

// Search

/** Where a hit opens: a module's inspector, or the Settings view ("tinted" for the theme's values, "client" for global). */
export type SettingsArea = "tinted" | "client";
type Entry = { names: string[]; label: string; where: string };
export type SettingHit = Entry & ({ module: Module; area?: undefined } | { area: SettingsArea; module?: undefined });

// Every module has these two at its root; they would flood every search for "bind" or "hidden"
const SKIPPED_ROOT_VALUES: Record<string, true> = { Bind: true, Hidden: true };

/**
 * Every value and group below `root` (active modes only) with its names from `root` down; `where` starts with
 * `place`, followed by the labels of the groups on the way.
 */
export function treeEntries(
  root: ValueGroup,
  place: string[],
  title: (name: string) => string = humanize,
  skipAtRoot: Record<string, true> = {},
): Entry[] {
  const entries: Entry[] = [];
  const walk = (group: ValueGroup, trail: Trail, names: string[], where: string[]) => {
    for (const { node, trail: inner } of contents(group, trail)) {
      if (names.length === 0 && skipAtRoot[node.name]) continue;
      const label = title(node.name);
      entries.push({ names: [...names, node.name], label, where: where.join(" › ") });
      if (isGroup(node)) walk(node, inner, [...names, node.name], [...where, label]);
    }
  };
  walk(root, [], [], place);
  return entries;
}

/** Every value reachable in the inspector, as search entries. */
export function settingEntries(module: Module, root: ValueGroup): SettingHit[] {
  return treeEntries(root, [module.name], humanize, SKIPPED_ROOT_VALUES).map((entry) => ({ ...entry, module }));
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** 0 when the module does not match; higher is better. */
export function moduleScore(module: Module, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = module.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  const aliases = module.aliases.map((alias) => alias.toLowerCase());
  if (aliases.some((alias) => alias.startsWith(q))) return 50;
  if (aliases.some((alias) => alias.includes(q))) return 40;
  if (module.description.toLowerCase().includes(query.trim().toLowerCase())) return 20;
  return 0;
}

export function settingScore(hit: SettingHit, query: string): number {
  const q = normalize(query);
  const name = normalize(hit.label);
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  return name.includes(q) ? 1 : 0;
}
