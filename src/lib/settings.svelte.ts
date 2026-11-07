// Theme settings declared in metadata.json live in the HUD module (HUD > Themes > Tinted). They are read from
// GET /theme and re-read whenever a value under this theme changes.
import { request } from "./api/client";
import { on, onReconnect } from "./api/events";
import { setReducedMotion } from "./motion";
import { configureSound } from "./sound";

const RELOAD_DEBOUNCE_MS = 100;

type Tristate = "Auto" | "On" | "Off";

interface ThemeSettings {
  accessibility?: {
    reduceMotion?: Tristate;
    reduceSound?: boolean;
    increaseContrast?: Tristate;
    reduceTransparency?: boolean;
    soundCaptions?: boolean;
    scale?: number;
  };
  sound?: { volume?: number };
  moduleList?: { show?: ModuleListShow; bindsWhenOff?: boolean; maxRows?: number };
}

/** Which modules that are on get a row of their own; the rest share one count row. */
export type ModuleListShow = "Toggled" | "Bound" | "All";

export const settings = $state({
  reduceMotion: false,
  reduceSound: false,
  increaseContrast: false,
  reduceTransparency: false,
  soundCaptions: false,
  scale: 1,
  volume: 0.6,
  moduleList: { show: "Toggled" as ModuleListShow, bindsWhenOff: true, maxRows: 12 },
});

let raw: ThemeSettings = {};
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const contrastQuery = matchMedia("(prefers-contrast: more), (forced-colors: active)");

function tristate(value: Tristate | undefined, query: MediaQueryList) {
  return value === "On" || ((value ?? "Auto") === "Auto" && query.matches);
}

function apply() {
  const a = raw.accessibility ?? {};
  settings.reduceMotion = tristate(a.reduceMotion, motionQuery);
  settings.increaseContrast = tristate(a.increaseContrast, contrastQuery);
  settings.reduceSound = a.reduceSound ?? false;
  settings.reduceTransparency = a.reduceTransparency ?? false;
  settings.soundCaptions = a.soundCaptions ?? false;
  settings.scale = a.scale ?? 1;
  settings.volume = (raw.sound?.volume ?? 60) / 100;
  const list = raw.moduleList ?? {};
  settings.moduleList = {
    show: list.show === "Bound" || list.show === "All" ? list.show : "Toggled",
    bindsWhenOff: list.bindsWhenOff ?? true,
    maxRows: list.maxRows ?? 12,
  };

  const root = document.documentElement;
  setReducedMotion(settings.reduceMotion);
  root.classList.toggle("contrast-more", settings.increaseContrast);
  root.classList.toggle("reduce-transparency", settings.reduceTransparency);
  root.style.setProperty("--scale", String(settings.scale));
  configureSound({ volume: settings.volume, reduceSound: settings.reduceSound, captions: settings.soundCaptions });
}

async function load() {
  try {
    const theme = await request<{ id: string; settings?: ThemeSettings }>("GET", "/theme");
    raw = theme?.settings ?? {};
  } catch {
    raw = {};
  }
  apply();
}

export function startSettings() {
  motionQuery.addEventListener("change", apply);
  contrastQuery.addEventListener("change", apply);
  // A config load sends one valueChanged per theme value
  let timer: ReturnType<typeof setTimeout> | undefined;
  on("valueChanged", (event) => {
    if (!event.value?.key?.toLowerCase().includes("themes.tinted")) return;
    clearTimeout(timer);
    timer = setTimeout(load, RELOAD_DEBOUNCE_MS);
  });
  onReconnect(load);
  return load();
}
