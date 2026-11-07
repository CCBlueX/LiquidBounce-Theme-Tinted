// Page routing state. The client opens <themeBase>/?lb_code=<code>#/<route>[?port=<port>][&static]; route, port and
// static sit after the hash. The main browser is not reloaded on screen changes: it gets virtualScreen events and
// acknowledges the screen it shows with POST /virtualScreen.

import { request } from "./client";
import { on, type Unsubscribe } from "./events";
import type { PlayerData, ScreenAction, ScreenInfo, ScreenRoute, VirtualScreenAck, VirtualScreenState } from "./types";

export type PageLocation = {
  /** Route after "#/", e.g. "clickgui"; "" when the hash has none. */
  route: ScreenRoute | (string & {});
  /** API port from ?port= (external themes), else the page's own port. */
  port: number;
  /** The page is a standalone browser (HUD, cached ClickGUI) that does not follow virtualScreen. */
  isStatic: boolean;
};

export type ScreenChange = {
  name: ScreenRoute | (string & {});
  action: ScreenAction;
  /** CustomScreenType enum name, e.g. "CLICK_GUI". */
  type: string;
};

export function readLocation(): PageLocation {
  const hash = location.hash.replace(/^#\/?/, "");
  const queryStart = hash.indexOf("?");
  const route = queryStart === -1 ? hash : hash.slice(0, queryStart);
  const params = new URLSearchParams(queryStart === -1 ? "" : hash.slice(queryStart + 1));
  const port = Number(params.get("port")) || Number(location.port) || (location.protocol === "https:" ? 443 : 80);
  return { route, port, isStatic: params.has("static") };
}

/** Tells the client which screen the page shows ("none" for none). 403 "Wrong virtual screen" on mismatch. */
export function ackScreen(name: ScreenRoute | "none" | (string & {})): Promise<void> {
  return request<undefined>("POST", "/virtualScreen", { body: { name } satisfies VirtualScreenAck });
}

/** Calls `handler` whenever the client opens or closes a virtual screen. */
export function onScreenChange(handler: (change: ScreenChange) => void): Unsubscribe {
  return on("virtualScreen", (event) => {
    if (typeof event.screenName === "string" && event.screenName) {
      handler({ name: event.screenName, action: event.action, type: event.type });
    }
  });
}

// The longest the client takes to open the screen it goes back to; and once it reported this screen closed, how long
// another may still follow
const BACK_WAIT_MS = 1000;
const AFTER_CLOSE_WAIT_MS = 300;
// Screens the client shows while it leaves a world; nothing replaces them once the world is gone
const PASSING_SCREEN = /\.(ProgressScreen|GenericMessageScreen)$/;

/**
 * Closes the page's screen like its close button should: DELETE /screen goes back to the screen it was opened from.
 * Multiplayer opened by leaving a server sits over the client's empty "Disconnecting" screen, and going back there
 * leaves the game on a blank screen (the client's own Esc goes to the title screen instead). So when no theme screen
 * follows, no world is loaded and the client shows such a screen, the title screen opens.
 */
export async function closeScreen(): Promise<void> {
  const { promise: reopened, resolve: settle } = Promise.withResolvers<boolean>();
  let timer = setTimeout(() => settle(false), BACK_WAIT_MS);
  const off = onScreenChange(({ action }) => {
    clearTimeout(timer);
    if (action === "open") settle(true);
    else timer = setTimeout(() => settle(false), AFTER_CLOSE_WAIT_MS);
  });
  try {
    await request("DELETE", "/screen");
    if (await reopened) return;
    const [virtual, shown, player] = await Promise.all([
      request<VirtualScreenState>("GET", "/virtualScreen"),
      request<ScreenInfo>("GET", "/screen").catch(() => undefined),
      request<PlayerData | undefined>("GET", "/player"),
    ]);
    if (!virtual.name && !player && (!shown || PASSING_SCREEN.test(shown.name))) {
      await request("PUT", "/screen", { body: { name: "title" } });
    }
  } finally {
    off();
    clearTimeout(timer);
  }
}
