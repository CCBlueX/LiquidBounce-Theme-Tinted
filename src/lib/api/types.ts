// Wire types of the LiquidBounce interop API (REST under /api/v1/client and the WebSocket on /).
//
// Source of truth: /tmp/ui-reimagine/contract.json, checked against the recorded fixture bodies.
// Gson drops nulls, so every field marked optional can be missing. Colors are signed 32-bit ARGB ints.
// Comments starting with "Recording:" mark places where the recording and the contract disagree.

// ---------------------------------------------------------------------------------------------------------------------
// Shared primitives

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Signed 32-bit ARGB, e.g. 0xFF0000FF is -16776961. */
export type Argb = number;

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };
export type Range = { from: number; to: number };

/** Vanilla text component JSON: a plain string or an object with text/translate, styling and extra parts. */
export type TextComponent = string | TextComponentObject;
export type TextComponentObject = {
  text?: string;
  translate?: string;
  with?: TextComponent[];
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  font?: string;
  extra?: TextComponent[];
  [key: string]: unknown;
};

/** Error body. Validation errors mostly come back as 403, auth failures as 401. */
export type ApiErrorBody = { reason: string; path?: string };

export type BindAction = "Toggle" | "Hold" | (string & {});
export type InputBind = { boundKey: string; action: BindAction; modifiers?: string[] };

export type HorizontalAlignment = "Left" | "Center" | "CenterTranslated" | "Right";
export type VerticalAlignment = "Top" | "Center" | "CenterTranslated" | "Bottom";
/** Offsets are in GUI-scale-2 space; Right/Bottom offsets count from the right/bottom edge. */
export type Alignment = {
  horizontalAlignment: HorizontalAlignment;
  horizontalOffset: number;
  verticalAlignment: VerticalAlignment;
  verticalOffset: number;
};

export type Pagination = { current: number; pages: number; items: number };
export type Paged<T> = { items: T[]; pagination: Pagination };

// ---------------------------------------------------------------------------------------------------------------------
// Value trees (GET /modules/settings, /global, /spoofer, /components/{id}/settings)

export type ValueType =
  | "BOOLEAN"
  | "FLOAT"
  | "FLOAT_RANGE"
  | "INT"
  | "INT_RANGE"
  | "TEXT"
  | "COLOR"
  | "BLOCK"
  | "ITEM"
  | "ENCHANTMENT"
  | "SOUND_EVENT"
  | "MOB_EFFECT"
  | "MENU"
  | "ENTITY_TYPE"
  | "C2S_PACKET"
  | "S2C_PACKET"
  | "CLIENT_MODULE"
  | "KEY"
  | "FILE"
  | "BIND"
  | "VECTOR3_I"
  | "VECTOR3_D"
  | "VECTOR2_F"
  | "LIST"
  | "CHOOSE"
  | "MULTI_CHOOSE"
  | "MUTABLE_LIST"
  | "NAMED_ITEM_LIST"
  | "REGISTRY_LIST"
  | "REGISTRY_MUTABLE_LIST"
  | "CURVE"
  | "CONFIGURABLE"
  | "TOGGLEABLE"
  | "CHOICE"
  | "FRIEND"
  | "PROXY"
  | "ACCOUNT"
  | "SUBSCRIBED_ITEM"
  | "INVALID";

type ValueBase<T extends ValueType, V> = {
  name: string;
  valueType: T;
  value: V;
  /** Translation key path, e.g. "liquidbounce.module.clickGUI.scale". Groups carry none. */
  key?: string;
  /** Translation key or translated text. Groups carry none. */
  description?: string;
};

type RangedBase<T extends ValueType, V> = ValueBase<T, V> & { range: Range; suffix: string };

export type BooleanValue = ValueBase<"BOOLEAN", boolean>;
export type FloatValue = RangedBase<"FLOAT", number>;
export type IntValue = RangedBase<"INT", number>;
export type FloatRangeValue = RangedBase<"FLOAT_RANGE", Range>;
export type IntRangeValue = RangedBase<"INT_RANGE", Range>;
export type TextValue = ValueBase<"TEXT", string>;
export type ColorValue = ValueBase<"COLOR", Argb>;
export type BindValue = ValueBase<"BIND", InputBind>;
/** Translation key of a key, e.g. "key.keyboard.left.alt". */
export type KeyValue = ValueBase<"KEY", string>;
export type FileDialogMode = "OPEN_FILE" | "SAVE_FILE" | "OPEN_DIRECTORY";
export type FileValue = ValueBase<"FILE", string> & { dialogMode?: FileDialogMode; supportedExtensions?: string[] };
export type ChooseValue = ValueBase<"CHOOSE", string> & { choices: string[] };
export type MultiChooseValue = ValueBase<"MULTI_CHOOSE", string[]> & {
  choices: string[];
  canBeNone: boolean;
  isOrderSensitive: boolean;
};
export type MutableListValue = ValueBase<"MUTABLE_LIST", string[]> & { innerValueType: ValueType };
export type RegistryListValue = ValueBase<"REGISTRY_LIST", string[]> & { registry: string; innerValueType: ValueType };
export type RegistryMutableListValue = ValueBase<"REGISTRY_MUTABLE_LIST", string[]> & {
  registry: string;
  innerValueType: ValueType;
};
export type CurveAxis = { label: string; range: Range };
export type CurveValue = ValueBase<"CURVE", Vec2[]> & {
  xAxis: CurveAxis;
  yAxis: CurveAxis;
  tension: number;
  innerValueType: ValueType;
};
export type Vector2Value = ValueBase<"VECTOR2_F", Vec2>;
export type Vector3DValue = ValueBase<"VECTOR3_D", Vec3> & { useLocateButton: boolean };
export type Vector3IValue = ValueBase<"VECTOR3_I", Vec3> & { useLocateButton: boolean };
/** Value types the contract lists but no module tree in the recording uses. */
export type OtherValue = ValueBase<
  "BLOCK" | "ITEM" | "LIST" | "NAMED_ITEM_LIST" | "FRIEND" | "PROXY" | "ACCOUNT" | "SUBSCRIBED_ITEM" | "INVALID",
  JsonValue
> & { innerValueType?: ValueType; items?: JsonValue };

export type ConfigurableGroup = ValueBase<"CONFIGURABLE", ValueNode[]>;
/**
 * State lives in a child BOOLEAN named "Enabled".
 * Recording: module roots (GET /modules/settings) are TOGGLEABLE without an "Enabled" child (238 of 238); nested
 * TOGGLEABLE groups always have one (647 of 647). Read module state from /modules instead.
 */
export type ToggleableGroup = ValueBase<"TOGGLEABLE", ValueNode[]>;
/** `value` holds group-level values (usually empty); each mode's values sit in `choices[mode].value`. */
export type ChoiceGroup = ValueBase<"CHOICE", ValueNode[]> & { active: string; choices: Record<string, ConfigurableGroup> };

export type ValueGroup = ConfigurableGroup | ToggleableGroup | ChoiceGroup;

/** One node of a settings tree, discriminated by `valueType`. Hidden values (visibleCondition false) are left out. */
export type ValueNode =
  | BooleanValue
  | FloatValue
  | IntValue
  | FloatRangeValue
  | IntRangeValue
  | TextValue
  | ColorValue
  | BindValue
  | KeyValue
  | FileValue
  | ChooseValue
  | MultiChooseValue
  | MutableListValue
  | RegistryListValue
  | RegistryMutableListValue
  | CurveValue
  | Vector2Value
  | Vector3DValue
  | Vector3IValue
  | ConfigurableGroup
  | ToggleableGroup
  | ChoiceGroup
  | OtherValue;

/** Root of GET /modules/settings (TOGGLEABLE) and /global, /spoofer (CONFIGURABLE). */
export type SettingsTree = ValueGroup;

/**
 * Body of PUT /modules/settings, /components/{id}/settings, /global, /spoofer: the GET shape, reduced to the values
 * to change. Values are matched by name; the root name must equal the module name.
 */
export type ValuePatch = {
  name: string;
  value: JsonValue | ValuePatch[];
  active?: string;
  choices?: Record<string, ValuePatch>;
};

/** Read-only view (GET /theme, components): lowerCamelCase keys to raw values; ranges as {from, to}. */
export type ReadOnlyValues = { [key: string]: JsonValue };

// ---------------------------------------------------------------------------------------------------------------------
// client

export type ClientInfo = {
  os: string;
  gameVersion: string;
  clientVersion: string;
  clientName: string;
  development: boolean;
  fps: number;
  gameDir: string;
  clientDir: string;
  inGame: boolean;
  viaFabricPlus: boolean;
  hasProtocolHack: boolean;
};

export type UpdateInfo = {
  development: boolean;
  commit: string;
  update?: {
    buildId: number;
    commitId: string;
    branch: string;
    clientVersion: string;
    minecraftVersion: string;
    release: boolean;
    date: string;
    message: string;
    url: string;
  };
};

/** The route of a connection being made: the socket it opens (the proxy when `proxy` is set) and the server. */
export type ConnectionDetails = { remoteAddress: string; serverAddress: string; proxy: boolean };

export type WindowInfo = {
  width: number;
  height: number;
  scaledWidth: number;
  scaledHeight: number;
  scaleFactor: number;
  /** Option value, 0 = auto. */
  guiScale: number;
};

export type HudEditorRequest = { selected: boolean };
/** A key from client_urls.properties; unknown keys give 403. */
export type BrowseRequest = { target: string };
export type BrowsePathRequest = { path: string };
export type FileDialogRequest = { mode: FileDialogMode; supportedExtensions?: string[] };
/** `file` is left out when the dialog was cancelled. */
export type FileDialogResult = { file?: string };

/** Root GET / (outside /api/v1/client). */
export type ServerIdentity = { name: string; version: string; author: string };

// user (LiquidBounce account)

export type User = {
  user_id: string;
  email: string;
  name?: string;
  nickname?: string;
  groups: string[];
  premium: boolean;
  is_admin: boolean;
};

// localStorage

export type LocalStorageEntry = { key: string; value: string };
export type LocalStorageValue = { value: string };
export type LocalStorageAll = { items: LocalStorageEntry[] };

// theme

export type ThemeComponentSettings = {
  enabled: boolean;
  zIndex: number;
  alignment: Alignment;
  [key: string]: JsonValue;
};

export type ThemeSettings = {
  colors: Record<string, Argb>;
  components?: Record<string, ThemeComponentSettings>;
  [key: string]: JsonValue | undefined;
};

/**
 * GET /theme and /theme/{id}.
 * Recording: GET /theme answered 200 with a null body in the boot scenarios (boot, boot-extra).
 */
export type Theme = {
  name: string;
  id: string;
  /** camelCased color names to ARGB. */
  colors: Record<string, Argb>;
  settings: ThemeSettings;
};

export type ShaderState = { shaderEnabled: boolean };

// screen

export type VirtualScreenState = { name?: string; showingSplash: boolean };
/** Body of POST /virtualScreen: the route name the page shows, or "none". */
export type VirtualScreenAck = { name: string };
/** Route name when recognised, else the Java class name of the Minecraft screen. */
export type ScreenInfo = { name: string };
export type ScreenSize = { width: number; height: number };
export type ScreenOpenRequest = { name: ScreenRoute | (string & {}) };

export type ScreenRoute =
  | "hud"
  | "clickgui"
  | "altmanager"
  | "proxymanager"
  | "basicmenu"
  | "title"
  | "multiplayer"
  | "multiplayer_realms"
  | "singleplayer"
  | "create_world"
  | "options"
  | "game_menu"
  | "inventory"
  | "container"
  | "disconnected"
  | "connecting"
  | "viafabricplus_protocol_selection"
  | "browser";

// modules

export type Module = {
  name: string;
  category: string;
  keyBind: InputBind;
  enabled: boolean;
  description: string;
  tag?: string;
  hidden: boolean;
  aliases: string[];
};

/** Recording: `icon` never present (0 of 8 categories in every scenario). */
export type ModuleCategory = { name: string; icon?: string };
export type ModuleNameRequest = { name: string };

// components

export type HudComponent = {
  name: string;
  description: string;
  /** Random UUID per client start; persist by name. */
  id: string;
  settings: ThemeComponentSettings;
  /** Native components only. */
  width?: number;
  height?: number;
};

export type ComponentCatalogEntry = {
  name: string;
  description: string;
  id: string;
  singleton: boolean;
  canAdd: boolean;
};

export type ZIndexResult = { zIndex: number };

// session

export type SessionType = "legacy" | "mojang" | "msa";
export type Session = {
  username: string;
  uuid: string;
  service: string;
  type: SessionType;
  avatar: string;
  online: boolean;
  /** Deprecated duplicate of online. */
  premium: boolean;
};

export type IpData = {
  ip?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  /** "lat,lon" */
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
};

// accounts

export type Ban = { serverName: string; reason: string; bannedUntil: number };
export type Account = {
  /** Index in the full account list (accounts without a profile are skipped but still counted); not stable. */
  id: number;
  username: string;
  uuid: string;
  avatar: string;
  bans: Record<string, Ban>;
  type: string;
  favorite: boolean;
};
/** `{id}` body: ids are list indices (accounts, proxies, servers), not stable across reorder or delete. */
export type IdRequest = { id: number };
export type MicrosoftCredentialsRequest = { email: string; password: string };
export type CrackedAccountRequest = { username: string; online?: boolean };
export type TokenRequest = { token: string };
export type AlteningGenerateRequest = { apiToken: string };
export type SwapRequest = { from: number; to: number };
/** Old indices in the new order. */
export type OrderRequest = { order: number[] };
export type RemovedAccount = { id: number; username?: string; uuid?: string; avatar?: string; type?: string };
export type RandomName = { name: string };

// proxy

export type ProxyType = "HTTP" | "SOCKS5";
export type Proxy = {
  host: string;
  port: number;
  credentials?: { username: string; password: string };
  type?: ProxyType;
  forwardAuthentication: boolean;
  proxyResourcePacks: boolean;
  proxyDns: boolean;
  ipInfo?: IpData;
  favorite: boolean;
};
export type ProxyEntry = Proxy & { id: number; type: ProxyType };
export type ActiveProxy = Proxy & { id: number };
/** All fields required: Gson leaves missing primitives at 0/false. Use "" for no username. */
export type ProxyAddRequest = {
  host: string;
  port: number;
  username: string;
  password: string;
  type: ProxyType;
  forwardAuthentication: boolean;
  proxyResourcePacks: boolean;
  proxyDns: boolean;
};
export type ProxyEditRequest = ProxyAddRequest & { id: number };

// browser

/** `{}` when the in-game browser is not open. */
export type BrowserState = { url?: string };
export type BrowserNavigateRequest = { url: string };

// protocol

export type Protocol = { name: string; version: number };
export type ProtocolSelectRequest = { version: number };

// config, input

export type KeyName = { translationKey: string; localized: string };
export type Keybind = { bindName: string; key: KeyName };
export type TypingState = { typing: boolean };

// player

export type ItemStack = {
  identifier: string;
  displayName: TextComponent;
  count: number;
  damage: number;
  maxDamage: number;
  empty: boolean;
  /** enchantment id to level */
  enchantments?: Record<string, number>;
};

export type MobEffect = {
  effect: string;
  localizedName: string;
  /** ticks */
  duration: number;
  amplifier: number;
  ambient: boolean;
  infinite: boolean;
  visible: boolean;
  showIcon: boolean;
  /** RGB */
  color: number;
};

export type GameMode = "survival" | "creative" | "adventure" | "spectator";

export type Scoreboard = { header: TextComponent; entries: { name: TextComponent; score: TextComponent }[] };

/** GET /server: the world the player is in and this session's stats; 204 outside a world. Unknown values are left out. */
export type ServerSession = {
  singleplayer: boolean;
  /** The saved server's name, else its address; the world's name in singleplayer. */
  name: string;
  address?: string;
  players: { online: number; max?: number };
  tps?: number;
  ping?: number;
  joinedAt: number;
  kills: number;
  deaths: number;
};

export type PlayerData = {
  username: string;
  uuid: string;
  dimension: string;
  position: Vec3;
  netherPosition: Vec3;
  blockPosition: Vec3;
  velocity: Vec3;
  selectedSlot: number;
  gameMode: GameMode;
  health: number;
  actualHealth: number;
  maxHealth: number;
  absorption: number;
  yaw: number;
  pitch: number;
  armor: number;
  food: number;
  air: number;
  maxAir: number;
  experienceLevel: number;
  experienceProgress: number;
  ping: number;
  effects: MobEffect[];
  mainHandStack: ItemStack;
  offHandStack: ItemStack;
  armorItems: ItemStack[];
  scoreboard?: Scoreboard;
};

export type PlayerInventory = {
  armor: ItemStack[];
  /** 36 slots */
  main: ItemStack[];
  crafting: ItemStack[];
  /** Empty until an ender chest was opened. */
  enderChest: ItemStack[];
};

/**
 * GET /crosshair. Contract: unknown (Gson reflection over mc.hitResult).
 * Recording: block hit results only, shaped like this (25 of 25 bodies).
 */
export type Crosshair = {
  direction: "down" | "up" | "north" | "south" | "west" | "east";
  blockPos: Vec3;
  miss: boolean;
  inside: boolean;
  worldBorderHit: boolean;
  location: Vec3;
};

// registry

export type RegistryName =
  | "blocks"
  | "block"
  | "items"
  | "item"
  | "sounds"
  | "sound_event"
  | "mob_effect"
  | "enchantment"
  | "c2s_packet"
  | "s2c_packet"
  | "entity_type"
  | "screen_handler"
  | "menu"
  | "client_module";
export type RegistryEntry = { name: string; icon?: string };
export type Registry = Record<string, RegistryEntry>;
export type RegistryGroups = Record<string, { relation: "group" | "parent"; relative: string }>;

// servers

export type ServerStatus = "INITIAL" | "PINGING" | "UNREACHABLE" | "INCOMPATIBLE" | "SUCCESSFUL";
export type ResourcePackPolicy = "Prompt" | "Enabled" | "Disabled";
export type ServerData = {
  name: string;
  address: string;
  status: ServerStatus;
  playerList: TextComponent[];
  /** MOTD */
  label: TextComponent;
  playerCountLabel: TextComponent;
  version: TextComponent;
  protocolVersion: number;
  protocolVersionMatches: boolean;
  ping: number;
  players: { max?: number; online?: number };
  resourcePackPolicy: ResourcePackPolicy;
  /** Base64 PNG without the data: prefix. */
  icon?: string;
};
/** `id` is the list index. */
export type Server = ServerData & { id: number };
/** `id` is negative (-1, -2, ...). */
export type LanServer = ServerData & { id: number; lan: true; online: boolean };
export type ServerAddRequest = { name: string; address: string; resourcePackPolicy?: ResourcePackPolicy };
export type ServerEditRequest = ServerAddRequest & { id: number };
export type ServerConnectRequest = { address: string };

// worlds

export type World = {
  id: number;
  /** Folder id; used by join/edit/delete. */
  name: string;
  displayName: string;
  /** epoch ms */
  lastPlayed: number;
  gameMode: string;
  difficulty: string;
  /** Base64 PNG without the data: prefix. */
  icon?: string;
  version: string;
  hardcore: boolean;
  commandsAllowed: boolean;
  locked: boolean;
  requiresConversion: boolean;
  isVersionAvailable: boolean;
  shouldPromptBackup: boolean;
  wouldBeDowngraded: boolean;
};
export type WorldNameRequest = { name: string };

// marketplace

export type MarketplaceItemType = "Config" | "Theme" | "Addon" | "Script" | "Other";
export type MarketplaceItemStatus = "Active" | "Inactive" | "Pending" | "Rejected" | "Deleted";
export type MarketplaceItem = {
  id: number;
  uid: string;
  type: MarketplaceItemType;
  name: string;
  branch: string;
  description: string;
  thumbnail_pid?: string;
  featured: boolean;
  created_at: string;
  status: MarketplaceItemStatus;
  author?: string;
  live_revision_id?: number;
  tags?: { id: number; name: string }[];
  target_servers?: string[];
  forked_from_item_id?: number;
  forked_from_revision_id?: number;
  downloads: number;
  score: number;
  visibility?: "public" | "unlisted";
  share_code?: string;
  includes_binds?: boolean;
  updated_at?: string;
  protocol_name?: string;
  protocol_version?: number;
  recent_works: number;
  recent_fails: number;
};
export type MarketplaceListing = { item: MarketplaceItem; isSubscribed: boolean };
export type MarketplaceDetail = { item: MarketplaceItem; isSubscribed: boolean; hasUpdate: boolean };
export type MarketplaceRevision = {
  id: number;
  item_id: number;
  version: string;
  file_pid: string;
  changelog?: string;
  created_at: string;
  status: MarketplaceItemStatus;
  includes_binds?: boolean;
  liquidbounce?: { min: string; max: string };
};
export type MarketplaceReview = {
  id: number;
  item_id: number;
  uid: string;
  rating: number;
  review?: string;
  created_at: string;
};
/** `featured` defaults to true on the client side. */
export type MarketplaceQuery = {
  page?: number;
  limit?: number;
  query?: string;
  type?: MarketplaceItemType;
  featured?: boolean;
};
export type PageQuery = { page?: number; limit?: number };
export type ReviewRequest = { rating: number; comment: string };

// ---------------------------------------------------------------------------------------------------------------------
// Every registered REST route: "<METHOD> <path under /api/v1/client>" to its query, body and response.
// `response: undefined` means 204 No Content.

type Route<Response, Body = never, Query = never> = { response: Response; body: Body; query: Query };
type NoContent = undefined;

export type ApiRoutes = {
  // client
  "GET /info": Route<ClientInfo>;
  "GET /update": Route<UpdateInfo>;
  "POST /exit": Route<NoContent>;
  "PUT /hud-editor": Route<NoContent, HudEditorRequest>;
  "GET /window": Route<WindowInfo>;
  /** While the game connects to a server; 204 otherwise. */
  "GET /connection": Route<ConnectionDetails | NoContent>;
  "POST /browse": Route<NoContent, BrowseRequest>;
  "POST /browsePath": Route<NoContent, BrowsePathRequest>;
  "POST /fileDialog": Route<FileDialogResult, FileDialogRequest>;
  // user
  "GET /user": Route<User>;
  "POST /user/login": Route<User>;
  "POST /user/logout": Route<NoContent>;
  // localStorage
  "GET /localStorage": Route<LocalStorageValue, never, { key: string }>;
  "PUT /localStorage": Route<NoContent, LocalStorageEntry>;
  "DELETE /localStorage": Route<NoContent, never, { key: string }>;
  "GET /localStorage/all": Route<LocalStorageAll>;
  "PUT /localStorage/all": Route<NoContent, LocalStorageAll>;
  // theme
  "GET /theme": Route<Theme | null>;
  "GET /theme/{id}": Route<Theme>;
  "GET /shader": Route<ShaderState>;
  "POST /shader": Route<NoContent>;
  "POST /basic-mode": Route<NoContent>;
  // screen
  "GET /virtualScreen": Route<VirtualScreenState>;
  "POST /virtualScreen": Route<NoContent, VirtualScreenAck>;
  "GET /screen": Route<ScreenInfo>;
  "GET /screen/size": Route<ScreenSize>;
  "PUT /screen": Route<NoContent, ScreenOpenRequest>;
  "DELETE /screen": Route<NoContent>;
  // modules
  "GET /modules": Route<Module[]>;
  "GET /modules/categories": Route<ModuleCategory[]>;
  "PUT /modules/toggle": Route<NoContent, ModuleNameRequest>;
  "DELETE /modules/toggle": Route<NoContent, ModuleNameRequest>;
  "POST /modules/toggle": Route<NoContent, ModuleNameRequest>;
  "GET /modules/settings": Route<ToggleableGroup, never, { name: string }>;
  "PUT /modules/settings": Route<NoContent, ValuePatch, { name: string }>;
  "POST /modules/panic": Route<NoContent>;
  "GET /module/{name}": Route<Module>;
  // components
  "GET /components/native": Route<HudComponent[]>;
  "GET /components/{id}/catalog": Route<ComponentCatalogEntry[]>;
  "GET /components/{id}": Route<HudComponent[]>;
  "POST /components/{id}": Route<NoContent>;
  "POST /components/{id}/z-index": Route<ZIndexResult>;
  "POST /components/{id}/alignment": Route<NoContent, Alignment>;
  "GET /components/{id}/settings": Route<ToggleableGroup>;
  "GET /components/{id}/file": Route<Blob>;
  "PUT /components/{id}/settings": Route<NoContent, ValuePatch>;
  // session
  "GET /session": Route<Session>;
  "GET /location": Route<IpData>;
  // accounts
  "GET /accounts": Route<Account[]>;
  "POST /accounts/new/microsoft/device-code": Route<NoContent>;
  "POST /accounts/new/microsoft/device-code/clipboard": Route<NoContent>;
  "POST /accounts/new/microsoft/webview": Route<NoContent>;
  "POST /accounts/new/microsoft/credentials": Route<NoContent, MicrosoftCredentialsRequest>;
  "POST /accounts/new/cracked": Route<NoContent, CrackedAccountRequest>;
  "POST /accounts/new/session": Route<NoContent, TokenRequest>;
  "POST /accounts/new/altening": Route<NoContent, TokenRequest>;
  "POST /accounts/new/altening/generate": Route<NoContent, AlteningGenerateRequest>;
  "POST /accounts/swap": Route<NoContent, SwapRequest>;
  "POST /accounts/order": Route<NoContent, OrderRequest>;
  "POST /account/login": Route<NoContent, IdRequest>;
  "POST /account/login/cracked": Route<NoContent, CrackedAccountRequest>;
  "POST /account/login/session": Route<NoContent, TokenRequest>;
  "POST /account/restore": Route<Session>;
  "PUT /account/favorite": Route<NoContent, IdRequest>;
  "DELETE /account/favorite": Route<NoContent, IdRequest>;
  "DELETE /account": Route<RemovedAccount, IdRequest>;
  "POST /account/random-name": Route<RandomName>;
  // proxy
  "GET /proxy": Route<ActiveProxy | NoContent>;
  "POST /proxy": Route<NoContent, IdRequest>;
  "DELETE /proxy": Route<NoContent>;
  "GET /proxies": Route<ProxyEntry[]>;
  "POST /proxies/add": Route<NoContent, ProxyAddRequest>;
  "POST /proxies/add/clipboard": Route<NoContent>;
  "POST /proxies/edit": Route<NoContent, ProxyEditRequest>;
  "POST /proxies/check": Route<NoContent, IdRequest>;
  "DELETE /proxies/remove": Route<NoContent, IdRequest>;
  "PUT /proxies/favorite": Route<NoContent, IdRequest>;
  "DELETE /proxies/favorite": Route<NoContent, IdRequest>;
  // browser
  "GET /browser": Route<BrowserState>;
  "POST /browser/navigate": Route<NoContent, BrowserNavigateRequest>;
  "POST /browser/close": Route<NoContent>;
  "POST /browser/reload": Route<NoContent>;
  "POST /browser/forceReload": Route<NoContent>;
  "POST /browser/forward": Route<NoContent>;
  "POST /browser/back": Route<NoContent>;
  "POST /browser/closeTab": Route<NoContent>;
  // protocol
  "GET /protocols": Route<Protocol[]>;
  "GET /protocols/protocol": Route<Protocol>;
  "PUT /protocols/protocol": Route<NoContent, ProtocolSelectRequest>;
  "DELETE /protocols/protocol": Route<NoContent>;
  "POST /reconnect": Route<NoContent>;
  // config
  "GET /spoofer": Route<ConfigurableGroup>;
  "PUT /spoofer": Route<NoContent, ValuePatch>;
  "GET /global": Route<ConfigurableGroup>;
  "PUT /global": Route<NoContent, ValuePatch>;
  // input
  "GET /input": Route<KeyName, never, { key: string }>;
  "GET /keybinds": Route<Keybind[]>;
  "POST /typing": Route<NoContent, TypingState>;
  "GET /typing": Route<TypingState>;
  // player
  "GET /player": Route<PlayerData | NoContent>;
  "GET /player/inventory": Route<PlayerInventory | NoContent>;
  "GET /crosshair": Route<Crosshair | NoContent>;
  // registry
  "GET /registry/{name}": Route<Registry>;
  "GET /registry/{name}/groups": Route<RegistryGroups>;
  // servers
  "GET /servers": Route<Server[]>;
  "GET /servers/lan": Route<LanServer[]>;
  "PUT /servers/add": Route<NoContent, ServerAddRequest>;
  "DELETE /servers/remove": Route<NoContent, IdRequest>;
  "PUT /servers/edit": Route<NoContent, ServerEditRequest>;
  "POST /servers/swap": Route<NoContent, SwapRequest>;
  "POST /servers/order": Route<NoContent, OrderRequest>;
  "POST /servers/connect": Route<NoContent, ServerConnectRequest>;
  // resources (binary)
  "GET /resource": Route<Blob, never, { id: string }>;
  "GET /resource/itemTexture": Route<Blob, never, { id: string }>;
  "GET /resource/effectTexture": Route<Blob, never, { id: string }>;
  "GET /resource/skin": Route<Blob, never, { uuid: string }>;
  // worlds
  "GET /worlds": Route<World[]>;
  "POST /worlds/join": Route<NoContent, WorldNameRequest>;
  "POST /worlds/edit": Route<NoContent, WorldNameRequest>;
  "POST /worlds/delete": Route<NoContent, WorldNameRequest>;
  // marketplace
  "GET /marketplace": Route<Paged<MarketplaceListing>, never, MarketplaceQuery>;
  "GET /marketplace/{id}": Route<MarketplaceDetail>;
  "GET /marketplace/{id}/revisions": Route<Paged<MarketplaceRevision>, never, PageQuery>;
  "GET /marketplace/{id}/revisions/{revisionId}": Route<MarketplaceRevision>;
  "POST /marketplace/{id}/subscribe": Route<NoContent>;
  "POST /marketplace/{id}/unsubscribe": Route<NoContent>;
  "GET /marketplace/{id}/reviews": Route<Paged<MarketplaceReview>, never, PageQuery>;
  "POST /marketplace/{id}/reviews": Route<MarketplaceReview, ReviewRequest>;
};

// ---------------------------------------------------------------------------------------------------------------------
// WebSocket events: frames are {name, event}; EventMap maps name to the `event` payload.

export type NotificationSeverity = "INFO" | "SUCCESS" | "ERROR" | "ENABLED" | "DISABLED";

/**
 * Value as sent by valueChanged.
 * Recording: only name, valueType, value and (sometimes) key/description arrive; CHOICE comes without
 * active/choices, MULTI_CHOOSE without choices/canBeNone/isOrderSensitive, MUTABLE_LIST without innerValueType.
 * The contract says the full ValueInterop/ValueGroupInterop shape.
 */
export type ChangedValue = {
  name: string;
  valueType: ValueType;
  value: JsonValue;
  key?: string;
  description?: string;
};

export type BedSurroundingBlock = { block: string; count: number; layer: number };
export type BedState = {
  block: string;
  trackedBlockPos: Vec3;
  pos: Vec3;
  surroundingBlocks: BedSurroundingBlock[];
  compactSurroundingBlocks: BedSurroundingBlock[];
};

export type ClientChatState =
  | "connecting"
  | "connected"
  | "logon"
  | "loggedIn"
  | "disconnected"
  | "authenticationFailed";

export type ScreenAction = "open" | "close";
export type EventScreen = { class: string; title: string };
export type CaptionDirection = "NONE" | "LEFT" | "RIGHT";

export type VirtualScreenEvent = {
  /** CustomScreenType enum name, e.g. "CLICK_GUI". */
  type: string;
  /** Route name, e.g. "clickgui". Deprecated upstream but the one to use. */
  screenName: ScreenRoute | (string & {});
  action: ScreenAction;
};

type Cancellable = { isCancelled: boolean };
type Empty = Record<string, never>;

export type EventMap = {
  themeColorChange: { themeId: string; /** As in metadata.colors, not camelCased. */ name: string; value: Argb };
  /** Deprecated in favour of clickGuiValueChange. */
  clickGuiScaleChange: { value: number };
  clickGuiValueChange: { configurable: ToggleableGroup };
  /** Misspelled upstream. */
  spaceSeperatedNamesChange: { value: boolean };
  clientLanguageChanged: Empty;
  valueChanged: { value: ChangedValue };
  moduleActivation: { moduleName: string };
  moduleToggle: { moduleName: string; hidden: boolean; enabled: boolean };
  refreshArrayList: Empty;
  notification: { title: string; message: string; severity: NotificationSeverity };
  gameModeChange: { gameMode: GameMode };
  targetChange: { target: PlayerData };
  /** Both fields left out when Scaffold resets. */
  blockCountChange: { nextBlock?: string; count?: number };
  bedStateChange: { bedStates: BedState[] };
  clientChatStateChange: { state: ClientChatState };
  clientChatMessage: { user: { name: string; uuid: string }; message: string; chatGroup: "PublicChat" | "PrivateChat" };
  clientChatError: { error: string };
  accountManagerMessage: { message: string };
  accountManagerLogin: { username?: string; error?: string };
  accountManagerAddition: { username?: string; error?: string };
  accountManagerRemoval: { username?: string };
  proxyCheckResult: { proxy?: Proxy; error?: string };
  virtualScreen: VirtualScreenEvent;
  /** Before every Minecraft screen change (newer clients); a cancelled one never opens. */
  screen: { screen?: { class: string; title: string } | null; isCancelled: boolean };
  serverPinged: { server: ServerData };
  /** Sent twice per change: native list, then the active theme's list. */
  componentsUpdate: { source: "native" | "theme"; components: HudComponent[]; themeId?: string };
  scaleFactorChange: { scaleFactor: number };
  connectionDetails: { details: ConnectionDetails };
  browserUrlChange: { index: number; url: string };
  userLoggedIn: Empty;
  userLoggedOut: Empty;
  /** action: 0 release, 1 press, 2 repeat */
  key: { key: string; action: number };
  keybindChange: Empty;
  session: { session: Session };
  chatSend: { message: string } & Cancellable;
  chatReceive: {
    message: string;
    textData: TextComponent;
    type: "ChatMessage" | "DisguisedChatMessage" | "GameMessage";
  } & Cancellable;
  disconnect: Empty;
  overlayMessage: { text: TextComponent; tinted: boolean };
  death: Empty;
  serverSession: { session?: ServerSession };
  fps: { fps: number };
  clientPlayerData: { playerData: PlayerData };
  clientPlayerEffect: { effects: MobEffect[] };
  clientPlayerInventory: { inventory: PlayerInventory };
  title: { text?: TextComponent } & Cancellable;
  subtitle: { text?: TextComponent } & Cancellable;
  titleFade: { fadeInTicks: number; stayTicks: number; fadeOutTicks: number } & Cancellable;
  clearTitle: { reset: boolean } & Cancellable;
  /**
   * Recording: also carries `serializeAsync: boolean` (214 of 214 frames), not in the contract.
   */
  closedCaptions: {
    entries: { text: TextComponent; direction: CaptionDirection; textColor: Argb; backgroundColor: Argb }[];
    serializeAsync?: boolean;
  };
  mouseButton: { key: string; button: number; action: number; mods: number; screen?: EventScreen };
  keyboardKey: { key: string; keyCode: number; scanCode: number; action: number; mods: number; screen?: EventScreen };
  keyboardChar: { codePoint: number };
};

export type EventName = keyof EventMap;
