// What the Marketplace view shows: one kind of item at a time, paged, with the player's filters. The list and the
// detail pane share it.
import { ApiError, reasonOf } from "../../../lib/api/client";
import { market } from "../../../lib/api/routes";
import type { MarketConfig, MarketInstalled, MarketItem, MarketItemType, MarketSort } from "../../../lib/api/types";

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

type ListQuery = { kind: MarketKind; sort: MarketSort; query?: string; server?: boolean; featured?: boolean; tags?: string };
type MarketList = { kind: MarketKind; rows: MarketRow[]; page: number; pages: number; total: number; unfeatured: number; at: number };
const EMPTY = { rows: [], page: 0, pages: 0, total: 0, unfeatured: 0, at: 0 };
/** A list shown again within this long is not asked for again. */
const FRESH_MS = 60_000;

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
  #lists = new Map<string, MarketList>();
  #pending = new Map<string, Promise<MarketList>>();
  #prefetching = false;
  #shownKind: MarketKind | undefined;

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
    const query = this.#query();
    const key = JSON.stringify(query);
    const request = ++this.#request;
    const cached = this.#lists.get(key);
    this.error = undefined;
    // Another kind's rows never stand in while this one loads; a refined search of the same kind may
    if (cached) this.#show(cached);
    else if (query.kind !== this.#shownKind) this.#show(EMPTY, query.kind);
    if (cached && Date.now() - cached.at < FRESH_MS) {
      this.loading = false;
      return;
    }
    this.loading = true;
    const run = () => this.#first(query, key, request, !!cached);
    if (delay) this.#timer = window.setTimeout(run, delay);
    else run();
  }

  search(query: string) {
    if (query === this.query) return;
    this.query = query;
    this.reload(SEARCH_DELAY_MS);
  }

  more() {
    if (this.loading || this.page >= this.pages) return;
    const query = this.#query();
    const key = JSON.stringify(query);
    const request = ++this.#request;
    this.loading = true;
    this.#fetch(query, this.page + 1)
      .then((next) => {
        if (request !== this.#request) return;
        const list = { ...next, rows: [...this.rows, ...next.rows] };
        this.#lists.set(key, list);
        this.#show(list);
      }, (error) => {
        if (request === this.#request) this.error = reasonOf(error);
      })
      .finally(() => {
        if (request === this.#request) this.loading = false;
      });
  }

  async #first(query: ListQuery, key: string, request: number, quiet: boolean) {
    try {
      const list = await this.#firstPage(query, key);
      if (request !== this.#request) return;
      this.#show(list);
      if (!query.query) this.#prefetch();
    } catch (error) {
      if (request !== this.#request || quiet) return;
      this.error = reasonOf(error);
      this.#show(EMPTY, query.kind);
    } finally {
      if (request === this.#request) this.loading = false;
    }
  }

  /** One request per list at a time: a switch to a kind whose prefetch is still running waits for that one. */
  #firstPage(query: ListQuery, key: string) {
    let pending = this.#pending.get(key);
    if (!pending) {
      pending = this.#fetch(query, 1)
        .then((list) => {
          this.#lists.set(key, list);
          return list;
        })
        .finally(() => this.#pending.delete(key));
      this.#pending.set(key, pending);
    }
    return pending;
  }

  // The other kinds load one after another in the background, so switching to them shows a list at once
  async #prefetch() {
    if (this.#prefetching) return;
    this.#prefetching = true;
    try {
      for (const kind of KINDS) {
        const query = { ...this.#query(kind), query: undefined };
        const key = JSON.stringify(query);
        if (!this.#lists.has(key) && !this.#pending.has(key)) await this.#firstPage(query, key).catch(() => {});
      }
    } finally {
      this.#prefetching = false;
    }
  }

  #query(kind: MarketKind = this.kind): ListQuery {
    const query: ListQuery = { kind, sort: this.sort === "New" ? "new" : "top", query: this.query.trim() || undefined };
    if (kind !== "Configs") return query;
    return {
      ...query,
      server: this.onServer || undefined,
      featured: this.featuredOnly || undefined,
      tags: this.tags.length ? this.tags.join(",") : undefined,
    };
  }

  async #fetch({ kind, ...query }: ListQuery, page: number): Promise<MarketList> {
    const answer =
      kind === "Configs"
        ? await market.configs({ ...query, page }).then((page) => ({
            ...page,
            rows: page.items.map((config): MarketRow => ({ kind: "config", config })),
          }))
        : await market.items({ type: ITEM_TYPES[kind], page, query: query.query, sort: query.sort }).then((page) => ({
            ...page,
            rows: page.items.map((item): MarketRow => ({ kind: "item", item })),
          }));
    return {
      kind,
      rows: answer.rows,
      page: answer.pagination.current,
      pages: answer.pagination.pages,
      total: answer.pagination.items,
      unfeatured: answer.unfeatured ?? 0,
      at: Date.now(),
    };
  }

  #show(list: Omit<MarketList, "kind">, kind = (list as MarketList).kind) {
    this.#shownKind = kind;
    this.rows = list.rows;
    this.page = list.page;
    this.pages = list.pages;
    this.total = list.total;
    this.unfeatured = list.unfeatured;
  }

  replace(next: MarketItem | MarketConfig) {
    const swap = (rows: MarketRow[]) =>
      rows.map((row): MarketRow => {
        if (row.kind === "item" && "type" in next && row.item.id === next.id) return { kind: "item", item: next };
        if (row.kind === "config" && !("type" in next) && row.config.id === next.id) return { kind: "config", config: next };
        return row;
      });
    this.rows = swap(this.rows);
    for (const [key, list] of this.#lists) this.#lists.set(key, { ...list, rows: swap(list.rows) });
  }
}

export const marketState = new MarketState();
