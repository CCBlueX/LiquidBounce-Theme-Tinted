// Page routing state. The client opens <themeBase>/?lb_code=<code>#/<route>[?port=<port>][&static]; route, port and
// static sit after the hash. The main browser is not reloaded on screen changes: it gets virtualScreen events and
// acknowledges the screen it shows with POST /virtualScreen.

import { request } from "./client";
import { on, type Unsubscribe } from "./events";
import type { ScreenAction, ScreenRoute, VirtualScreenAck } from "./types";

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
  return on("virtualScreen", (event) => handler({ name: event.screenName, action: event.action, type: event.type }));
}
