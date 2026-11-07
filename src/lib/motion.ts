import { cubicOut } from "svelte/easing";
import { fade, slide, type TransitionConfig } from "svelte/transition";

// Mirrors --spring in tokens.css; Svelte transitions take an easing function, not a CSS curve
export function spring(t: number) {
  return 1 - Math.exp(-6.4 * t) * Math.cos(5.6 * t);
}

let reduced = false;

export function setReducedMotion(value: boolean) {
  reduced = value;
  document.documentElement.classList.toggle("reduce-motion", value);
}

export const isReducedMotion = () => reduced;

/** Glass surfaces arrive by rising a few pixels and settling; under reduce motion they only fade. */
export function rise(_: Element, { delay = 0, duration = 360, y = 12, scale = 0.98 } = {}): TransitionConfig {
  if (reduced) return { delay, duration: 160, css: (t) => `opacity: ${t}` };
  return {
    delay,
    duration,
    easing: spring,
    css: (t, u) => `opacity: ${Math.min(1, t * 1.6)}; transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t})`,
  };
}

/** Sheets and panes arrive sideways with the spring; under reduce motion they fade. */
export function slideIn(_: Element, { delay = 0, x = 16 } = {}): TransitionConfig {
  if (reduced) return { delay, duration: 160, css: (t) => `opacity: ${t}` };
  return {
    delay,
    duration: 420,
    easing: spring,
    css: (t, u) => `opacity: ${Math.min(1, t * 1.8)}; transform: translateX(${u * x}px)`,
  };
}

/** Leaving is quicker and only fades, so the layout can take the room back at once. */
export function fadeOut(_: Element): TransitionConfig {
  return { duration: 120, css: (t) => `opacity: ${t}` };
}

/** Inline groups open by height; under reduce motion they fade. */
export function expand(node: Element, { duration = 300 } = {}): TransitionConfig {
  return reduced ? fade(node, { duration: 160 }) : slide(node, { duration, easing: cubicOut });
}

export const flipDuration = (ms = 260) => (reduced ? 0 : ms);

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
