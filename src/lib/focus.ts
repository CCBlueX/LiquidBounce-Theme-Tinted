import { tick } from "svelte";
import { flipDuration } from "./motion";

/**
 * Runs `change` (a reorder) and keeps keyboard focus on the row `row()` finds. A moved row node loses focus, and a new
 * favorite jumps to the top, out of view; flip draws a moved row at its old place while it runs, so the list scrolls
 * to where the row landed once it has.
 */
export function keepRowFocus(list: HTMLElement | undefined, row: () => HTMLElement | null | undefined, change: () => void) {
  const had = !!list?.contains(document.activeElement);
  change();
  if (!had) return;
  tick().then(() => {
    row()?.focus({ preventScroll: true });
    setTimeout(async () => {
      const flight = row()?.parentElement?.getAnimations().filter((animation) => !(animation instanceof CSSTransition));
      await Promise.allSettled((flight ?? []).map((animation) => animation.finished));
      const target = row();
      if (!target || !list?.contains(document.activeElement)) return;
      target.focus();
      target.scrollIntoView({ block: "nearest" });
    }, flipDuration());
  });
}
