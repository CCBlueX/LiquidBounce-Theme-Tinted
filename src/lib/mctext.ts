// Server text (MOTD, player samples, version) arrives as text component JSON, as plain strings with legacy § codes,
// or as a mix of both. It is flattened into lines of styled runs, and every Minecraft color is mapped onto a small
// palette that keeps 4.5:1 on the glass.

import type { TextComponent } from "./api/types";

export type Tone = "white" | "gray" | "dim" | "red" | "gold" | "green" | "aqua" | "blue" | "purple";

export type Run = {
  text: string;
  tone?: Tone;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
};

type Style = Omit<Run, "text">;

const NAMED: Record<string, Tone> = {
  black: "dim",
  dark_blue: "blue",
  dark_green: "green",
  dark_aqua: "aqua",
  dark_red: "red",
  dark_purple: "purple",
  gold: "gold",
  gray: "gray",
  dark_gray: "dim",
  blue: "blue",
  green: "green",
  aqua: "aqua",
  red: "red",
  light_purple: "purple",
  yellow: "gold",
  white: "white",
};

const LEGACY = "0123456789abcdef";
const LEGACY_NAMES = Object.keys(NAMED);

/** Vanilla keys the client sends for server states; anything else falls back to its `fallback` text or nothing. */
const TRANSLATIONS: Record<string, string> = {
  "multiplayer.status.cannot_connect": "Can't connect to server",
  "multiplayer.status.cannot_resolve": "Can't resolve hostname",
  "multiplayer.status.no_connection": "No connection",
  "multiplayer.status.pinging": "Pinging",
  "multiplayer.status.old": "Old",
  "multiplayer.status.unknown": "Unknown",
  "multiplayer.status.incompatible": "Incompatible version",
  "multiplayer.status.request_handled": "Status request handled",
  "multiplayer.status.unrequested": "Unrequested status",
  "multiplayer.status.finished": "Finished",
  "multiplayer.status.and_more": "... and %s more ...",
};

function toneOfHex(hex: string): Tone | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return undefined;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const chroma = max - min;
  if (chroma < 0.15) return light > 0.75 ? "white" : light > 0.4 ? "gray" : "dim";
  let hue = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 20 || hue >= 335) return "red";
  if (hue < 65) return "gold";
  if (hue < 165) return "green";
  if (hue < 200) return "aqua";
  if (hue < 260) return "blue";
  return "purple";
}

function toneOf(color: unknown): Tone | undefined {
  if (typeof color !== "string") return undefined;
  return NAMED[color] ?? toneOfHex(color);
}

/** Splits a string with § codes into runs; a color code resets formatting, §r returns to the component's style. */
function legacy(text: string, base: Style, out: Run[]) {
  let style: Style = { ...base };
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ text: buffer, ...style });
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "§" || i + 1 >= text.length) {
      buffer += text[i];
      continue;
    }
    const code = text[i + 1].toLowerCase();
    i++;
    flush();
    const color = LEGACY.indexOf(code);
    if (color >= 0) style = { tone: NAMED[LEGACY_NAMES[color]] };
    else if (code === "x" && /^(§[0-9a-f]){6}$/i.test(text.slice(i + 1, i + 13))) {
      const hex = text.slice(i + 1, i + 13).replace(/§/g, "");
      style = { tone: toneOfHex(`#${hex}`) };
      i += 12;
    } else if (code === "k") style.obfuscated = true;
    else if (code === "l") style.bold = true;
    else if (code === "m") style.strikethrough = true;
    else if (code === "n") style.underlined = true;
    else if (code === "o") style.italic = true;
    else if (code === "r") style = { ...base };
  }
  flush();
}

function walk(component: TextComponent | null | undefined, inherited: Style, out: Run[]) {
  if (component === null || component === undefined) return;
  if (typeof component === "string") {
    legacy(component, inherited, out);
    return;
  }
  if (Array.isArray(component)) {
    for (const part of component as TextComponent[]) walk(part, inherited, out);
    return;
  }
  const style: Style = { ...inherited };
  const tone = toneOf(component.color);
  if (tone) style.tone = tone;
  for (const key of ["bold", "italic", "underlined", "strikethrough", "obfuscated"] as const) {
    if (typeof component[key] === "boolean") style[key] = component[key];
  }
  if (typeof component.text === "string") legacy(component.text, style, out);
  else if (typeof component.translate === "string") {
    const pattern = TRANSLATIONS[component.translate] ?? (typeof component.fallback === "string" ? component.fallback : "");
    const args = component.with ?? [];
    let next = 0;
    pattern.split(/(%(?:\d+\$)?s)/).forEach((piece) => {
      const arg = /^%(?:(\d+)\$)?s$/.exec(piece);
      if (arg) walk(args[arg[1] ? Number(arg[1]) - 1 : next++], style, out);
      else if (piece) legacy(piece, style, out);
    });
  }
  for (const part of component.extra ?? []) walk(part, style, out);
}

/** Lines of runs with surrounding spaces trimmed (MOTDs pad with spaces to center themselves in vanilla). */
export function textLines(component: TextComponent | null | undefined): Run[][] {
  const runs: Run[] = [];
  walk(component, {}, runs);
  const lines: Run[][] = [[]];
  for (const run of runs) {
    const pieces = run.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...run, text: piece });
    });
  }
  return lines
    .map((line) => {
      const trimmed = line.map((run) => ({ ...run }));
      while (trimmed.length && !(trimmed[0].text = trimmed[0].text.replace(/^\s+/, ""))) trimmed.shift();
      while (trimmed.length && !(trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.replace(/\s+$/, ""))) {
        trimmed.pop();
      }
      return trimmed;
    })
    .filter((line) => line.length > 0);
}

/** Plain text for accessible names and search. */
export function plainText(component: TextComponent | null | undefined): string {
  return textLines(component)
    .map((line) => line.map((run) => run.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
