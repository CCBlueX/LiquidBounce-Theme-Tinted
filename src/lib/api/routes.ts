// Typed functions for the routes the theme uses. Every call goes through `call`, which takes its types from ApiRoutes.
// Gotchas: validation errors are mostly 403 (ApiError.status), ids are list indices, colors are signed ARGB ints.

import { ApiError, apiUrl, request, type HttpMethod, type QueryValue } from "./client";
import { markModuleSwitch } from "../sound";
import { closeScreen, leaveFor, openScreen, rememberConnecting } from "./screen";
import type {
  Account,
  ApiRoutes,
  ClientInfo,
  ConfigurableGroup,
  CurrentServer,
  MarketConfig,
  MarketConfigDetail,
  MarketConfigQuery,
  MarketInstalled,
  MarketItem,
  MarketItemDetail,
  MarketItemQuery,
  MarketplacePage,
  Module,
  ModuleCategory,
  PlayerData,
  PlayerInventory,
  PlayerStatistics,
  RandomName,
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
  toggle: (name: string, enabled?: boolean): Promise<void> => {
    // The page that switches plays the sound; the HUD then stays quiet for this toggle
    markModuleSwitch(name);
    return call(enabled === undefined ? "POST /modules/toggle" : enabled ? "PUT /modules/toggle" : "DELETE /modules/toggle", {
      body: { name },
    });
  },
  /** 403 for an unknown module. */
  settings: (name: string): Promise<ToggleableGroup> => call("GET /modules/settings", { query: { name } }),
  /** `partialTree` carries only the values to change, matched by name; its root name must be the module name. */
  putSettings: (name: string, partialTree: ValuePatch): Promise<void> =>
    call("PUT /modules/settings", { query: { name }, body: partialTree }),
};

/** The client's global settings (GET/PUT /global), one tree with root "Settings". */
export const globalSettings = {
  get: (): Promise<ConfigurableGroup> => call("GET /global"),
  /** `partialTree` carries only the values to change, matched by name; its root name must be "Settings". */
  put: (partialTree: ValuePatch): Promise<void> => call("PUT /global", { body: partialTree }),
};

export const player = {
  /** undefined when not in a world (204). */
  data: (): Promise<PlayerData | undefined> => call("GET /player"),
  /** undefined when not in a world (204). */
  inventory: (): Promise<PlayerInventory | undefined> => call("GET /player/inventory"),
  /** undefined when not in a world (204). */
  statistics: (): Promise<PlayerStatistics | undefined> => call("GET /player/statistics"),
};

export const servers = {
  /** Reloads servers.dat and pings every server; results arrive as serverPinged events. There is no ping route. */
  list: (): Promise<Server[]> => call("GET /servers"),
  /** undefined in singleplayer and menus (204). Players come from the last list ping. */
  current: (): Promise<CurrentServer | undefined> => call("GET /servers/current"),
  /** Connects to the address; unknown addresses get a temporary server entry. */
  join: (address: string): Promise<void> => {
    rememberConnecting(address);
    return leaveFor(() => call("POST /servers/connect", { body: { address } }));
  },
};

export const worlds = {
  list: (): Promise<World[]> => call("GET /worlds"),
  /** `name` is the world's folder id (World.name), not its display name. */
  join: (name: string): Promise<void> => leaveFor(() => call("POST /worlds/join", { body: { name } })),
};

export const session = {
  get: (): Promise<Session> => call("GET /session"),
};

export const accounts = {
  list: (): Promise<Account[]> => call("GET /accounts"),
  /** `id` is Account.id (a list index). The result arrives as accountManagerLogin plus a session event. */
  login: (id: number): Promise<void> => call("POST /account/login", { body: { id } }),
  /** A free name in the style of a real player's. */
  randomName: (): Promise<RandomName> => call("POST /account/random-name"),
  /** Logs in without saving the account. The result arrives as accountManagerLogin plus a session event. */
  loginCracked: (username: string): Promise<void> => call("POST /account/login/cracked", { body: { username } }),
};

export const screen = {
  /** 403 for an unknown route name. */
  open: openScreen,
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

/**
 * The ClickGUI marketplace. Actions answer the client's reason on failure and tell the player in chat and a
 * notification themselves; 503 when the marketplace cannot be reached.
 */
export const market = {
  tags: (): Promise<string[]> => call("GET /marketplace/tags"),
  configs: (query: MarketConfigQuery): Promise<MarketplacePage<MarketConfig>> => call("GET /marketplace/configs", { query }),
  config: (id: number): Promise<MarketConfigDetail> => call("GET /marketplace/configs/{id}", { params: { id } }),
  modules: (id: number): Promise<string[]> => call("GET /marketplace/configs/{id}/modules", { params: { id } }),
  /** Without `modules` the whole config loads and is tracked; with them only those modules change. */
  load: (id: number, modules?: string[]): Promise<void> =>
    call("POST /marketplace/configs/{id}/load", { params: { id }, body: { modules } }),
  report: (id: number, works: boolean | undefined): Promise<MarketConfig> =>
    call("PUT /marketplace/configs/{id}/report", { params: { id }, body: { works } }),
  items: (query: MarketItemQuery): Promise<MarketplacePage<MarketItem>> => call("GET /marketplace/items", { query }),
  installed: (): Promise<MarketInstalled[]> => call("GET /marketplace/items/installed"),
  item: (id: number): Promise<MarketItemDetail> => call("GET /marketplace/items/{id}", { params: { id } }),
  install: (id: number): Promise<void> => call("POST /marketplace/items/{id}/install", { params: { id } }),
  update: (id: number): Promise<MarketItem> => call("POST /marketplace/items/{id}/update", { params: { id } }),
  remove: (id: number): Promise<void> => call("POST /marketplace/items/{id}/remove", { params: { id } }),
  /** Makes an installed theme the active one. */
  apply: (id: number): Promise<void> => call("POST /marketplace/items/{id}/apply", { params: { id } }),
};

/** URLs for <img src>; they carry the lb_auth cookie like any request to the interop server. */
export const resources = {
  /** Rendered item or block icon. 503 with Retry-After: 5 until the item atlas is ready, 400 for unknown items. */
  itemTextureUrl: (id: string): string => apiUrl("/resource/itemTexture", { id }),
  effectTextureUrl: (id: string): string => apiUrl("/resource/effectTexture", { id }),
  /** Full 64x64 skin PNG (face at 8,8 size 8x8, hat at 40,8). Needs a world; default skin for unknown players. */
  skinUrl: (uuid: string): string => apiUrl("/resource/skin", { uuid }),
};
