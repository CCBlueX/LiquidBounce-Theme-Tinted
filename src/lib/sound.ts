// UI sounds through Web Audio. The browser mixes outside Minecraft's sound engine, so the theme's own Volume
// setting is the only level control; Reduce sound keeps only sounds that carry information.

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

let context: AudioContext | undefined;
let master: GainNode | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
const lastPlayed = new Map<SoundRole, number>();
const captionListeners = new Set<(caption: string) => void>();

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

export function preloadSounds() {
  for (const { file } of Object.values(FILES)) load(file);
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

  const buffer = await load(sound.file);
  if (!buffer || !master) return;
  const ctx = audio();
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = sound.pitch * (1 + (Math.random() * 2 - 1) * PITCH_JITTER);
  const gain = ctx.createGain();
  gain.gain.value = sound.gain;
  source.connect(gain).connect(master);
  source.start();
}
