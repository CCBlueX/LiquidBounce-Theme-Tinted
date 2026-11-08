// UI sounds. They play through the game's sound engine (POST /sound, the files are listed under "sounds" in
// metadata.json), so Minecraft's volume sliders apply and pages that never get a click, like the HUD, are heard too.
// Clients without that route get Web Audio, mixed outside the game. The theme's Volume setting applies to both;
// Reduce sound keeps only sounds that carry information.

import { ApiError, request } from "./api/client";

export type SoundRole = "tap" | "toggleOn" | "toggleOff" | "open" | "close" | "notify" | "confirm" | "error";

// Files are peak-normalized; gains set the level of each role (RMS after the peak, before Volume): tap -32 dB,
// toggle -26, open -30, close -33, notify -26, confirm -24, error -24. Close is the open swish, lower.
const FILES: Record<SoundRole, { file: string; pitch: number; gain: number; essential: boolean; caption: string }> = {
  tap: { file: "tap", pitch: 1, gain: 0.34, essential: false, caption: "Tick" },
  toggleOn: { file: "toggle", pitch: 1.06, gain: 1, essential: true, caption: "Switch on" },
  toggleOff: { file: "toggle", pitch: 0.92, gain: 0.9, essential: true, caption: "Switch off" },
  open: { file: "open", pitch: 1, gain: 0.33, essential: false, caption: "Panel opens" },
  close: { file: "open", pitch: 0.86, gain: 0.23, essential: false, caption: "Panel closes" },
  notify: { file: "notify", pitch: 1, gain: 0.34, essential: true, caption: "Notification" },
  confirm: { file: "confirm", pitch: 1, gain: 0.72, essential: true, caption: "Confirmed" },
  error: { file: "error", pitch: 1, gain: 0.84, essential: true, caption: "Error" },
};

// Minecraft varies pitch per play; a few percent keeps repeated ticks from sounding mechanical
const PITCH_JITTER = 0.03;
// Overlapping taps from fast keyboard navigation turn into a buzz; drop repeats inside this window
const MIN_GAP_MS = 35;
// A running context keeps an audio thread and the output stream busy even in silence, and the theme's pages stay
// loaded, hidden, for hours; it sleeps once nothing has played for this long
const IDLE_SUSPEND_MS = 10_000;

const THEME_ID = "tinted";

// Undefined until the client first answers; false once it turned out not to have the route
let inGame: boolean | undefined;

async function playInGame(file: string, volume: number, pitch: number): Promise<boolean> {
  if (inGame === false) return false;
  try {
    await request("POST", "/sound", { body: { sound: `liquidbounce:theme/${THEME_ID}/${file}`, volume, pitch } });
    inGame = true;
    return true;
  } catch (error) {
    if (lacksRoute(error)) inGame = false;
    return false;
  }
}

// An unknown sound is a 404 with a reason; a client without the route answers a bare 404
const lacksRoute = (error: unknown) =>
  error instanceof ApiError && error.status === 404 && !(typeof error.body === "object" && error.body);

// Pages tell each other which module switches they already sounded, so the HUD, which hears every toggle, only sounds
// those made elsewhere (binds, commands, modules that switch others)
const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("tinted-module-switch");
const switchedElsewhere = new Map<string, number>();
const SWITCH_HEARD_MS = 1500;
const SWITCH_WAIT_MS = 60;
channel?.addEventListener("message", (event: MessageEvent<string>) => switchedElsewhere.set(event.data, performance.now()));

/** Marks a module switch made from this page, which plays its own sound. */
export function markModuleSwitch(name: string) {
  channel?.postMessage(name);
}

/** The toggle sound for a module switched outside the theme's pages. */
export function playModuleToggle(name: string, enabled: boolean) {
  // The client's toggle event can beat the switching page's mark here by a few frames
  setTimeout(() => {
    const at = switchedElsewhere.get(name);
    switchedElsewhere.delete(name);
    if (at !== undefined && performance.now() - at < SWITCH_HEARD_MS) return;
    play(enabled ? "toggleOn" : "toggleOff");
  }, SWITCH_WAIT_MS);
}

let context: AudioContext | undefined;
let master: GainNode | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
const lastPlayed = new Map<SoundRole, number>();
const captionListeners = new Set<(caption: string) => void>();
let playing = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let suspending: Promise<void> | undefined;

function sleepSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (playing === 0) suspending = context?.suspend();
  }, IDLE_SUSPEND_MS);
}

const state = { volume: 0.6, reduceSound: false, captions: false };

export function configureSound(options: Partial<typeof state>) {
  Object.assign(state, options);
  if (master) master.gain.value = state.volume;
}

export function onCaption(listener: (caption: string) => void) {
  captionListeners.add(listener);
  return () => captionListeners.delete(listener);
}

function audio() {
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = state.volume;
    master.connect(context.destination);
    sleepSoon();
  }
  return context;
}

function load(file: string) {
  let buffer = buffers.get(file);
  if (!buffer) {
    buffer = fetch(new URL(`./sounds/${file}.ogg`, document.baseURI))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
      .then((data) => audio().decodeAudioData(data))
      .catch(() => undefined);
    buffers.set(file, buffer);
  }
  return buffer;
}

/** Loads the Web Audio files on clients that cannot play theme sounds, so the first one is not late. */
export async function preloadSounds() {
  // A request without a sound is refused (400) by a client that has the route
  await request("POST", "/sound", { body: {} }).catch((error) => {
    if (lacksRoute(error)) inGame = false;
  });
  if (inGame === false) for (const { file } of Object.values(FILES)) load(file);
}

export async function play(role: SoundRole) {
  const sound = FILES[role];
  if (state.volume <= 0 || (state.reduceSound && !sound.essential)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(role) ?? 0) < MIN_GAP_MS) return;
  lastPlayed.set(role, now);

  if (state.captions && sound.essential) {
    for (const listener of captionListeners) listener(sound.caption);
  }

  const pitch = sound.pitch * (1 + (Math.random() * 2 - 1) * PITCH_JITTER);
  if (await playInGame(sound.file, sound.gain * state.volume, pitch)) return;

  playing++;
  clearTimeout(idleTimer);
  let started = false;
  try {
    const buffer = await load(sound.file);
    if (!buffer || !master) return;
    const ctx = audio();
    await suspending;
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = sound.gain;
    source.connect(gain).connect(master);
    source.onended = () => {
      if (--playing === 0) sleepSoon();
    };
    source.start();
    started = true;
  } finally {
    if (!started && --playing === 0) sleepSoon();
  }
}
