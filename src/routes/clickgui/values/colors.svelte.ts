// Color math for the picker and the colors the player used last, kept in the client's store across starts.
import { storage } from "../../../lib/api/routes";

export type Hsv = { h: number; s: number; v: number };

/** r, g, b in 0..255 to hue 0..360, saturation and brightness 0..1. */
export function toHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

export function fromHsv({ h, s, v }: Hsv): { r: number; g: number; b: number } {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

const KEY = "tinted.recentColors";
const LIMIT = 6;

class RecentColors {
  /** "#RRGGBB" or "#RRGGBBAA", newest first. */
  list = $state<string[]>([]);
  #loaded = false;

  load() {
    if (this.#loaded) return;
    this.#loaded = true;
    storage
      .get(KEY)
      .then((saved) => {
        const parsed: unknown = JSON.parse(saved ?? "[]");
        if (Array.isArray(parsed)) this.list = parsed.filter((entry) => typeof entry === "string").slice(0, LIMIT);
      })
      .catch(() => (this.#loaded = false));
  }

  add(hex: string) {
    this.list = [hex, ...this.list.filter((entry) => entry !== hex)].slice(0, LIMIT);
    storage.set(KEY, JSON.stringify(this.list)).catch(() => {});
  }
}

export const recentColors = new RecentColors();
