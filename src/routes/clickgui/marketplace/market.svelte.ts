// What the Marketplace view shows: one kind of item at a time, paged, with the player's filters. The list and the
// detail pane share it.
import { ApiError, reasonOf } from "../../../lib/api/client";
import { market } from "../../../lib/api/routes";
import type { MarketConfig, MarketInstalled, MarketItem, MarketItemType } from "../../../lib/api/types";

export const KINDS = ["Configs", "Add-ons", "Scripts", "Themes"] as const;
export type MarketKind = (typeof KINDS)[number];
const ITEM_TYPES: Record<Exclude<MarketKind, "Configs">, MarketItemType> = {
  "Add-ons": "Addon",
  Scripts: "Script",
  Themes: "Theme",
};
export const SHARE_CODE_PREFIX = "LB-";
const STORAGE_KEY = "tinted.marketplace";
const SEARCH_DELAY_MS = 300;

/** Items that stand in until a thumbnail loads, or when there is none. */
export const ITEM_FALLBACK: Record<MarketItemType, string> = {
  Addon: "minecraft:command_block",
  Script: "minecraft:writable_book",
  Theme: "minecraft:painting",
};
export const CONFIG_FALLBACK = "minecraft:writable_book";

export type MarketRow = { kind: "config"; config: MarketConfig } | { kind: "item"; item: MarketItem };

class MarketState {
  /** Unknown until the first answer; false on clients without the routes. */
  available = $state<boolean>();
  kind = $state<MarketKind>("Configs");
  sort = $state<"Top" | "New">("Top");
  onServer = $state(false);
  featuredOnly = $state(false);
  tags = $state<string[]>([]);
  query = $state("");

  rows = $state.raw<MarketRow[]>([]);
  total = $state(0);
  page = $state(0);
  pages = $state(0);
  /** Configs the featured filter hides, when it leaves nothing. */
  unfeatured = $state(0);
  loading = $state(false);
  error = $state<string>();
  installed = $state.raw<MarketInstalled[]>([]);
  selected = $state<number>();

  #request = 0;
  #timer: number | undefined;

  get itemType(): MarketItemType | undefined {
    return this.kind === "Configs" ? undefined : ITEM_TYPES[this.kind];
  }

  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (KINDS.includes(saved.kind)) this.kind = saved.kind;
      if (saved.sort === "Top" || saved.sort === "New") this.sort = saved.sort;
      this.featuredOnly = saved.featuredOnly === true;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  #save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: this.kind, sort: this.sort, featuredOnly: this.featuredOnly }));
  }

  /** Asks whether the client has the routes; the sidebar shows the Marketplace only then. */
  probe() {
    market
      .installed()
      .then((installed) => {
        this.installed = installed;
        this.available = true;
      })
      // The interop server answers routes it does not have with 403
      .catch((error) => (this.available = !(error instanceof ApiError && error.status < 500)));
  }

  refreshInstalled() {
    market.installed().then((installed) => (this.installed = installed), () => {});
  }

  /** Starts over at page 1; typing waits for a pause. */
  reload(delay = 0) {
    this.#save();
    clearTimeout(this.#timer);
    if (delay) this.#timer = window.setTimeout(() => this.#load(1), delay);
    else this.#load(1);
  }

  search(query: string) {
    if (query === this.query) return;
    this.query = query;
    this.reload(SEARCH_DELAY_MS);
  }

  more() {
    if (!this.loading && this.page < this.pages) this.#load(this.page + 1);
  }

  async #load(page: number) {
    const request = ++this.#request;
    this.loading = true;
    if (page === 1) this.error = undefined;
    const query = this.query.trim() || undefined;
    const sort = this.sort === "New" ? "new" : "top";
    try {
      const type = this.itemType;
      const result = type
        ? await market.items({ type, page, query, sort }).then((answer) => ({
            ...answer,
            rows: answer.items.map((item): MarketRow => ({ kind: "item", item })),
          }))
        : await market
            .configs({
              page,
              query,
              sort,
              server: this.onServer || undefined,
              featured: this.featuredOnly || undefined,
              tags: this.tags.length ? this.tags.join(",") : undefined,
            })
            .then((answer) => ({ ...answer, rows: answer.items.map((config): MarketRow => ({ kind: "config", config })) }));
      if (request !== this.#request) return;
      this.rows = page === 1 ? result.rows : [...this.rows, ...result.rows];
      this.page = result.pagination.current;
      this.pages = result.pagination.pages;
      this.total = result.pagination.items;
      this.unfeatured = result.unfeatured ?? 0;
    } catch (error) {
      if (request !== this.#request) return;
      this.error = reasonOf(error);
      if (page === 1) this.rows = [];
    } finally {
      if (request === this.#request) this.loading = false;
    }
  }

  replace(next: MarketItem | MarketConfig) {
    this.rows = this.rows.map((row) => {
      if (row.kind === "item" && "type" in next && row.item.id === next.id) return { kind: "item", item: next };
      if (row.kind === "config" && !("type" in next) && row.config.id === next.id) return { kind: "config", config: next };
      return row;
    });
  }
}

export const marketState = new MarketState();
