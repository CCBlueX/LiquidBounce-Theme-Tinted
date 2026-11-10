<script lang="ts">
  import { onMount } from "svelte";
  import { market as api, servers } from "../../../lib/api/routes";
  import type { MarketConfig, MarketItem } from "../../../lib/api/types";
  import { summaryTokens } from "../../../lib/markdown";
  import { play } from "../../../lib/sound";
  import Markdown from "../../../lib/ui/Markdown.svelte";
  import PopoverMenu from "../../../lib/ui/PopoverMenu.svelte";
  import Segmented from "../../../lib/ui/Segmented.svelte";
  import MarketIcon from "./MarketIcon.svelte";
  import { CONFIG_FALLBACK, ITEM_FALLBACK, KINDS, marketState as market, type MarketKind } from "./market.svelte";

  // One kind of item at a time; the header's search field searches it. Rows open the detail pane beside the list.
  let { query }: { query: string } = $props();

  let scroller = $state<HTMLDivElement>();
  let onServer = $state<string>();
  let tagOptions = $state<string[]>([]);

  const isConfigs = $derived(market.kind === "Configs");
  const installedHere = $derived(market.installed.filter((item) => item.type === market.itemType));

  onMount(() => {
    if (!market.rows.length) market.reload();
    market.refreshInstalled();
    servers.current().then((server) => (onServer = server?.address), () => {});
    api.tags().then((tags) => (tagOptions = tags), () => {});
  });

  $effect(() => market.search(query));

  function setKind(kind: string) {
    market.kind = kind as MarketKind;
    market.selected = undefined;
    scroller?.scrollTo({ top: 0 });
    market.reload();
  }

  function setSort(sort: string) {
    market.sort = sort as "Top" | "New";
    market.reload();
  }

  function toggleFilter(name: "onServer" | "featuredOnly") {
    play("tap");
    market[name] = !market[name];
    market.reload();
  }

  function toggleTag(tag: string) {
    market.tags = market.tags.includes(tag) ? market.tags.filter((other) => other !== tag) : [...market.tags, tag];
    market.reload();
  }

  function select(id: number) {
    if (market.selected !== id) play("tap");
    market.selected = id;
  }

  // Up and Down move between rows, as in the module grid
  function rowKey(event: KeyboardEvent) {
    const rows = [...(scroller?.querySelectorAll<HTMLElement>(".row") ?? [])];
    const index = rows.indexOf(event.currentTarget as HTMLElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 }[event.key];
    if (next === undefined || !rows[next]) return;
    event.preventDefault();
    rows[next].focus();
  }

  function nearEnd() {
    if (!scroller) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 240) market.more();
  }

  const count = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : `${value}`);

  function itemState(item: MarketItem) {
    if (item.inUse) return "In use";
    if (item.update) return "Update";
    if (item.installed) return "Installed";
    return undefined;
  }
</script>

{#snippet configRow(config: MarketConfig)}
  <button
    class="row"
    class:selected={market.selected === config.id}
    aria-current={market.selected === config.id}
    onclick={() => select(config.id)}
    onkeydown={rowKey}
  >
    <MarketIcon src={config.image} fallback={CONFIG_FALLBACK} />
    <span class="text">
      <span class="name">{config.name}</span>
      <span class="sub t-footnote">
        {config.address}{#if config.servers[0]}{" · "}{config.servers[0]}{/if}
      </span>
    </span>
    <span class="meta t-footnote num">
      {#if config.works || config.fails}
        <span class="works" aria-label="{config.works} working, {config.fails} broken">
          <span class="pos">{config.works}</span>{" / "}<span class="neg">{config.fails}</span>
        </span>
      {/if}
    </span>
  </button>
{/snippet}

{#snippet itemRow(item: MarketItem)}
  {@const status = itemState(item)}
  {@const summary = summaryTokens(item.summary, item.name)}
  <button
    class="row"
    class:selected={market.selected === item.id}
    aria-current={market.selected === item.id}
    onclick={() => select(item.id)}
    onkeydown={rowKey}
  >
    <MarketIcon src={item.image} fallback={ITEM_FALLBACK[item.type]} />
    <span class="text">
      <span class="name">{item.name}</span>
      <span class="sub t-footnote">
        {item.author ?? ""}{#if item.author && summary.length}{" · "}{/if}<Markdown tokens={summary} inline />
      </span>
    </span>
    <span class="meta t-footnote num">
      {#if status}<span class="badge" class:accent={status === "Update"}>{status}</span>
      {:else}{count(item.downloads)} downloads{/if}
    </span>
  </button>
{/snippet}

<div class="market on-glass">
  <div class="bar">
    <Segmented options={[...KINDS]} value={market.kind} label="Kind" small onchange={setKind} />
    <Segmented options={["Top", "New"]} value={market.sort} label="Sort" small onchange={setSort} />
    {#if isConfigs}
      <span class="filters">
        {#if onServer}
          <button class="cg-chip" class:on={market.onServer} aria-pressed={market.onServer} onclick={() => toggleFilter("onServer")}>
            For this server
          </button>
        {/if}
        <button class="cg-chip" class:on={market.featuredOnly} aria-pressed={market.featuredOnly} onclick={() => toggleFilter("featuredOnly")}>
          Featured
        </button>
        {#if tagOptions.length}
          <PopoverMenu label="Tags" class="cg-pop glass deep">
            {#snippet trigger(props)}
              <button class="cg-chip" class:on={market.tags.length > 0} {...props}>
                {market.tags.length ? `Tags · ${market.tags.length}` : "Tags"}<span class="chev" aria-hidden="true">⌄</span>
              </button>
            {/snippet}
            {#snippet children()}
              {#each tagOptions as tag (tag)}
                <button class="cg-option" role="menuitemcheckbox" aria-checked={market.tags.includes(tag)} onclick={() => toggleTag(tag)}>
                  <span class="check" aria-hidden="true">{market.tags.includes(tag) ? "✓" : ""}</span>
                  <span class="grow">{tag}</span>
                </button>
              {/each}
            {/snippet}
          </PopoverMenu>
        {/if}
      </span>
    {/if}
  </div>

  <div class="scroll" bind:this={scroller} onscroll={nearEnd}>
    {#if !isConfigs && installedHere.length && !query.trim()}
      <h2 class="t-footnote">On this client</h2>
      <div class="cg-group installed">
        {#each installedHere as item (item.id)}
          <button class="row small" class:selected={market.selected === item.id} onclick={() => select(item.id)} onkeydown={rowKey}>
            <span class="name">{item.name}</span>
          </button>
        {/each}
      </div>
      <h2 class="t-footnote">{market.kind}</h2>
    {/if}

    {#if market.error && !market.rows.length}
      <div class="empty">
        <p class="t-callout l2">{market.error}</p>
        <button class="cg-pill" onclick={() => market.reload()}>Try again</button>
      </div>
    {:else if market.loading && !market.rows.length}
      <p class="empty t-callout l2">Loading…</p>
    {:else if !market.rows.length}
      <div class="empty">
        {#if isConfigs && market.featuredOnly && market.unfeatured > 0}
          <p class="t-callout l2">
            No featured configs match. {market.unfeatured}
            {market.unfeatured === 1 ? "config does" : "configs do"} without the featured mark.
          </p>
          <button class="cg-pill" onclick={() => toggleFilter("featuredOnly")}>Show all</button>
        {:else}
          <p class="t-callout l2">{query.trim() ? `Nothing matches “${query.trim()}”` : `No ${market.kind.toLowerCase()} yet`}</p>
        {/if}
      </div>
    {:else}
      <div class="cg-group" aria-busy={market.loading}>
        {#each market.rows as row (row.kind === "config" ? `c${row.config.id}` : `i${row.item.id}`)}
          {#if row.kind === "config"}{@render configRow(row.config)}{:else}{@render itemRow(row.item)}{/if}
        {/each}
      </div>
      {#if market.page < market.pages}
        <button class="cg-pill quiet more" onclick={() => market.more()} disabled={market.loading}>
          {market.loading ? "Loading…" : `Show more of ${market.total.toLocaleString("en-US")}`}
        </button>
      {:else if market.error}
        <p class="t-footnote l2 more">{market.error}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .market { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 16px 10px; }
  .filters { display: flex; flex-wrap: wrap; gap: 4px; margin-left: auto; }
  .chev { font-size: 11px; margin: -3px -2px 0 2px; }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 3px 16px 40px;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, #000 calc(100% - 48px), transparent calc(100% - 8px));
  }
  h2 { margin: 0 4px 6px; font-weight: 600; color: var(--label-2); }
  .installed { margin-bottom: 16px; }
  .row {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 8px;
    text-align: left;
    border-radius: inherit;
    transition: background-color var(--t-hover) ease;
  }
  .row.small { min-height: 32px; padding-left: 12px; }
  .row:hover { background: rgb(255 255 255 / 0.04); }
  .row.selected { background: var(--accent-tint); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: 13px; line-height: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--label-2); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; line-clamp: 1; overflow: hidden; overflow-wrap: anywhere; }
  .meta { flex: none; display: flex; align-items: center; gap: 8px; color: var(--label-2); }
  .badge { padding: 1px 7px; border-radius: 9px; background: var(--fill-2); color: var(--label); }
  .badge.accent { background: var(--accent-fill); color: #fff; }
  .pos { color: var(--positive); }
  .neg { color: var(--negative); }
  .empty { display: grid; gap: 8px; justify-items: start; padding: 16px 4px; overflow-wrap: anywhere; }
  .more { margin: 8px auto 0; display: flex; }
</style>
