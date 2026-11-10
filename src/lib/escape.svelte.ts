// The client closes a theme screen on Esc unless the page keeps the key (PUT /screen/escape). While something Esc
// closes is open (a menu, a dialog, a sheet, a search with text, a page drilled into), the page keeps it and closes
// that instead. Popovers and modal dialogs count by themselves; other layers register with keepEscape.
import { ApiError, request } from "./api/client";
import { readLocation } from "./api/screen";

const layers = new Set<() => boolean>();
let screen = readLocation().route;
/** What the client was last told; undefined when that is not known, so the next sync tells it again. */
let kept: boolean | undefined = false;
let queued = false;
/** Clients without the route close the screen on Esc whatever the page has open. */
let unsupported = false;
let requests: Promise<unknown> = Promise.resolve();

/** Whether Esc now closes something in the page rather than the screen. */
export function escapeKept() {
  return [...layers].some((isOpen) => isOpen()) || !!document.querySelector(":popover-open, dialog:modal");
}

function sync() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    const keep = !!screen && escapeKept();
    if (keep === kept || unsupported) return;
    kept = keep;
    const name = screen;
    requests = requests
      .then(() => request("PUT", "/screen/escape", { body: { name, keep } }))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) unsupported = true;
        // 403: that screen is no longer open, and the next one starts without the key kept
        kept = error instanceof ApiError && error.status === 403 ? false : undefined;
      });
  });
}

/** The client gives every screen it opens Esc back, so open layers keep it again. */
export function screenOpened(name: string) {
  screen = name;
  kept = false;
  sync();
}

/** Keeps Esc while isOpen() holds. Call during component setup; its reactive reads are followed. */
export function keepEscape(isOpen: () => boolean) {
  layers.add(isOpen);
  $effect(() => {
    isOpen();
    sync();
  });
  $effect(() => () => {
    layers.delete(isOpen);
    sync();
  });
}

// Popovers and dialogs fire toggle, which does not bubble but passes the document while capturing; layers that need
// focus inside them change with it, and a key press may have closed one
for (const type of ["toggle", "focusin", "focusout", "keydown"]) document.addEventListener(type, sync, true);
