// Registries (items, blocks, sounds, ...) for list editors, fetched once per registry and kept for the session.
import { request } from "../../../lib/api/client";
import type { Registry } from "../../../lib/api/types";

const cache = new Map<string, Promise<Registry>>();

export function registry(name: string): Promise<Registry> {
  let entry = cache.get(name);
  if (!entry) {
    entry = request<Registry>("GET", `/registry/${encodeURIComponent(name)}`);
    // A failed load is retried the next time a picker opens
    entry.catch(() => cache.delete(name));
    cache.set(name, entry);
  }
  return entry;
}

/** How entries of a registry are drawn: item art for items and blocks, effect art for effects, else text only. */
export function iconKind(registryName: string): "item" | "effect" | undefined {
  if (/^(item|items|block|blocks)$/.test(registryName)) return "item";
  return registryName === "mob_effect" ? "effect" : undefined;
}
