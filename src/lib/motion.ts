import { quintOut } from "svelte/easing";
import { fade, slide, type TransitionConfig } from "svelte/transition";

/** A damped spring with a little overshoot, for the Island, which should feel alive; everything else eases out. */
export function spring(t: number) {
  return 1 - Math.exp(-6.4 * t) * Math.cos(5.6 * t);
}

/** --ease in tokens.css, cubic-bezier(0.23, 1, 0.32, 1): fast start, long settle. */
export const easeOut = quintOut;

let reduced = false;

export function setReducedMotion(value: boolean) {
  reduced = value;
  document.documentElement.classList.toggle("reduce-motion", value);
}

export const isReducedMotion = () => reduced;

/** Glass surfaces arrive by rising a few pixels and settling; under reduce motion they only fade. */
export function rise(_: Element, { delay = 0, duration = 220, y = 6, scale = 0.985 } = {}): TransitionConfig {
  if (reduced) return { delay, duration: 160, css: (t) => `opacity: ${t}` };
  return {
    delay,
    duration,
    easing: easeOut,
    css: (t, u) => `opacity: ${t}; transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t})`,
  };
}

/** Sheets and panes arrive sideways; under reduce motion they fade. */
export function slideIn(_: Element, { delay = 0, x = 8, duration = 220 } = {}): TransitionConfig {
  if (reduced) return { delay, duration: 160, css: (t) => `opacity: ${t}` };
  return { delay, duration, easing: easeOut, css: (t, u) => `opacity: ${t}; transform: translateX(${u * x}px)` };
}

/** Leaving is quicker and only fades, so the layout can take the room back at once. */
export function fadeOut(_: Element): TransitionConfig {
  return { duration: 120, easing: easeOut, css: (t) => `opacity: ${t}` };
}

/** Inline groups open by height; under reduce motion they fade. */
export function expand(node: Element, { duration = 200 } = {}): TransitionConfig {
  return reduced ? fade(node, { duration: 160 }) : slide(node, { duration, easing: easeOut });
}

export const flipDuration = (ms = 200) => (reduced ? 0 : ms);

/** The HUD island morphs width and height; this drives a numeric tween that respects reduce motion. */
export function tween(from: number, to: number, duration: number, onFrame: (value: number) => void) {
  if (reduced || duration <= 0) {
    onFrame(to);
    return () => {};
  }
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const t = Math.min(1, (now - start) / duration);
    onFrame(t < 1 ? from + (to - from) * spring(t) : to);
    if (t < 1) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}
