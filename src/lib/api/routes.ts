// Typed functions for the routes the theme uses. Every call goes through `call`, which takes its types from ApiRoutes.
// Gotchas: validation errors are mostly 403 (ApiError.status), ids are list indices, colors are signed ARGB ints.

import { ApiError, apiUrl, request, type HttpMethod, type QueryValue } from "./client";
import { closeScreen } from "./screen";
import type {
  Account,
  ApiRoutes,
  ClientInfo,
  Module,
  ModuleCategory,
  PlayerData,
  PlayerInventory,
  ScreenRoute,
  Server,
  Session,
  ToggleableGroup,
  ValuePatch,
  WindowInfo,
  World,
} from "./types";

type RouteKey = keyof ApiRoutes;
type CallOptions<K extends RouteKey> = {
  params?: Record<string, string | number>;
  query?: ApiRoutes[K]["query"];
  body?: ApiRoutes[K]["body"];
};

function call<K extends RouteKey>(route: K, options: CallOptions<K> = {}): Promise<ApiRoutes[K]["response"]> {
  const space = route.indexOf(" ");
  const method = route.slice(0, space) as HttpMethod;
  const path = route.slice(space + 1).replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = options.params?.[name];
    if (value === undefined) throw new Error(`${route}: missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
  return request(method, path, { query: options.query as Record<string, QueryValue> | undefined, body: options.body });
}

export const modules = {
  list: (): Promise<Module[]> => call("GET /modules"),
  categories: (): Promise<ModuleCategory[]> => call("GET /modules/categories"),
  /** true enables, false disables, undefined flips. Enable/disable give 403 when already in that state. */
  toggle: (name: string, enabled?: boolean): Promise<void> =>
    call(enabled === undefined ? "POST /modules/toggle" : enabled ? "PUT /modules/toggle" : "DELETE /modules/toggle", {
      body: { name },
    }),
  /** 403 for an unknown module. */
  settings: (name: string): Promise<ToggleableGroup> => call("GET /modules/settings", { query: { name } }),
  /** `partialTree` carries only the values to change, matched by name; its root name must be the module name. */
  putSettings: (name: string, partialTree: ValuePatch): Promise<void> =>
    call("PUT /modules/settings", { query: { name }, body: partialTree }),
};

export const player = {
  /** undefined when not in a world (204). */
  data: (): Promise<PlayerData | undefined> => call("GET /player"),
  /** undefined when not in a world (204). */
  inventory: (): Promise<PlayerInventory | undefined> => call("GET /player/inventory"),
};

export const servers = {
  /** Reloads servers.dat and pings every server; results arrive as serverPinged events. There is no ping route. */
  list: (): Promise<Server[]> => call("GET /servers"),
  /** Connects to the address; unknown addresses get a temporary server entry. */
  join: (address: string): Promise<void> => call("POST /servers/connect", { body: { address } }),
};

export const worlds = {
  list: (): Promise<World[]> => call("GET /worlds"),
  /** `name` is the world's folder id (World.name), not its display name. */
  join: (name: string): Promise<void> => call("POST /worlds/join", { body: { name } }),
};

export const session = {
  get: (): Promise<Session> => call("GET /session"),
};

export const accounts = {
  list: (): Promise<Account[]> => call("GET /accounts"),
  /** `id` is Account.id (a list index). The result arrives as accountManagerLogin plus a session event. */
  login: (id: number): Promise<void> => call("POST /account/login", { body: { id } }),
};

export const screen = {
  /** 403 for an unknown route name. */
  open: (name: ScreenRoute): Promise<void> => call("PUT /screen", { body: { name } }),
  /** Back to the screen this one was opened from, else the game or title screen. 403 when no screen is open. */
  close: closeScreen,
};

export const client = {
  info: (): Promise<ClientInfo> => call("GET /info"),
  window: (): Promise<WindowInfo> => call("GET /window"),
  /** Quits Minecraft. */
  exit: (): Promise<void> => call("POST /exit"),
};

/** The client's own key-value store, kept in its config across starts (the pages' localStorage is not). */
export const storage = {
  /** undefined for a key that was never set (the client answers 403). */
  get: (key: string): Promise<string | undefined> =>
    call("GET /localStorage", { query: { key } }).then(
      (entry) => entry.value,
      (error) => {
        if (error instanceof ApiError && error.status === 403) return undefined;
        throw error;
      },
    ),
  set: (key: string, value: string): Promise<void> => call("PUT /localStorage", { body: { key, value } }),
};

/** URLs for <img src>; they carry the lb_auth cookie like any request to the interop server. */
export const resources = {
  /** Rendered item or block icon. 503 with Retry-After: 5 until the item atlas is ready, 400 for unknown items. */
  itemTextureUrl: (id: string): string => apiUrl("/resource/itemTexture", { id }),
  effectTextureUrl: (id: string): string => apiUrl("/resource/effectTexture", { id }),
  /** Full 64x64 skin PNG (face at 8,8 size 8x8, hat at 40,8). Needs a world; default skin for unknown players. */
  skinUrl: (uuid: string): string => apiUrl("/resource/skin", { uuid }),
};
