<script lang="ts">
  import { ApiError, request } from "../../../lib/api/client";
  import { market as api } from "../../../lib/api/routes";
  import type { MarketConfigDetail, MarketItemDetail } from "../../../lib/api/types";
  import { relativeTime } from "../../../lib/format";
  import { markdownDocument } from "../../../lib/markdown";
  import { play } from "../../../lib/sound";
  import ConfirmPopover from "../../../lib/ui/ConfirmPopover.svelte";
  import Markdown from "../../../lib/ui/Markdown.svelte";
  import Gallery from "./Gallery.svelte";
  import LoadModules from "./LoadModules.svelte";
  import MarketIcon from "./MarketIcon.svelte";
  import { CONFIG_FALLBACK, ITEM_FALLBACK, marketState as market } from "./market.svelte";

  // The selected config or item: what it is, what it needs, its history, and what can be done with it. The client
  // tells how an action went in chat and a notification, so a failure here only plays the error sound.
  let { id, configs }: { id: number; configs: boolean } = $props();

  let config = $state<MarketConfigDetail>();
  let item = $state<MarketItemDetail>();
  let failed = $state(false);
  let busy = $state<string>();
  let signedIn = $state<boolean>();
  let removing = $state(false);
  let removeButton = $state<HTMLButtonElement>();
  let scrolled = $state(false);

  const about = $derived(
    configs
      ? config && markdownDocument(config.description, config.config.name)
      : item && markdownDocument(item.description, item.item.name),
  );

  async function load() {
    failed = false;
    try {
      if (configs) {
        const next = await api.config(id);
        if (next.config.id === id) config = next;
      } else {
        const next = await api.item(id);
        if (next.item.id === id) item = next;
      }
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    void id;
    config = undefined;
    item = undefined;
    load();
  });

  $effect(() => {
    request("GET", "/user").then(
      () => (signedIn = true),
      (error) => (signedIn = !(error instanceof ApiError && error.status === 401)),
    );
  });

  async function run(name: string, action: () => Promise<unknown>) {
    if (busy) return;
    busy = name;
    try {
      await action();
      play("confirm");
    } catch {
      play("error");
    } finally {
      busy = undefined;
    }
  }

  const loadAll = () => run("load", () => api.load(id));
  const loadSome = (modules: string[]) => run("load", () => api.load(id, modules));

  // Pressing the reported state again withdraws the report
  function report(works: boolean) {
    const current = config?.report;
    run("report", async () => {
      const next = await api.report(id, current === works ? undefined : works);
      if (config) config = { ...config, config: next, report: current === works ? undefined : works };
      market.replace(next);
    });
  }

  function signIn() {
    run("signin", async () => {
      await request("POST", "/user/login");
      signedIn = true;
      await load();
    });
  }

  // After an item changes, the pane, the list and what is installed follow
  async function settle() {
    await load();
    if (item) market.replace(item.item);
    market.refreshInstalled();
  }

  const install = () => run("install", () => api.install(id).then(settle));
  const update = () => run("update", () => api.update(id).then(settle));
  const apply = () => run("apply", () => api.apply(id).then(settle));
  function remove() {
    removing = false;
    run("remove", () => api.remove(id).then(settle));
  }

  // Changelogs as plain paragraphs: images dropped, links as their text, marks removed
  function plain(markdown: string) {
    return markdown
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
      .replace(/^(#+|>)\s*/gm, "")
      .replace(/\*\*|__|~~|`|<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const date = (ms: number | undefined) => (ms ? relativeTime(ms) : "");
  const openLink = (url: string) => api.openLink(id, url).catch(() => play("error"));
</script>

<div class="detail">
  {#if failed}
    <div class="failed">
      <p class="t-callout l2">This could not be loaded from the marketplace.</p>
      <button class="cg-pill" onclick={load}>Try again</button>
    </div>
  {:else if configs && config}
    {@const c = config.config}
    <header class="top" class:scrolled>
      <MarketIcon src={c.image} fallback={CONFIG_FALLBACK} size={48} />
      <div class="grow">
        <h2 class="t-title3">{c.name}</h2>
        <p class="t-footnote l2">{c.address}{c.featured ? " · Featured" : ""}</p>
      </div>
    </header>
    <div class="scroll" onscroll={(event) => (scrolled = event.currentTarget.scrollTop > 0)}>
      <div class="actions">
        <button class="cg-pill primary" onclick={loadAll} disabled={!!busy}>{busy === "load" ? "Loading…" : "Load"}</button>
        <LoadModules {id} disabled={!!busy} onload={loadSome} />
      </div>
      {#if !c.protocolMatches && c.protocol}<p class="note t-footnote">Made for {c.protocol}</p>{/if}
      {#if c.binds}<p class="note t-footnote">Changes key binds</p>{/if}
      {#if c.overlayOn}<p class="note t-footnote">Loads on top of {c.overlayOn}</p>{/if}
      {#if about}<Gallery images={about.images} />{/if}

      <h3 class="t-footnote">Does it work?</h3>
      {#if signedIn === false}
        <div class="cg-group">
          <div class="cg-row">
            <span class="cg-label">Sign in to report</span>
            <button class="cg-pill" onclick={signIn} disabled={!!busy}>{busy === "signin" ? "Waiting…" : "Sign in"}</button>
          </div>
        </div>
      {:else}
        <div class="report" role="group" aria-label="Report the newest revision">
          <button class="cg-pill" class:pressed={config.report === true} aria-pressed={config.report === true} onclick={() => report(true)} disabled={!!busy}>
            Works <span class="num pos">{c.works}</span>
          </button>
          <button class="cg-pill" class:pressed={config.report === false} aria-pressed={config.report === false} onclick={() => report(false)} disabled={!!busy}>
            Broken <span class="num neg">{c.fails}</span>
          </button>
        </div>
      {/if}

      {#if c.servers.length || c.tags.length}
        <h3 class="t-footnote">For</h3>
        <div class="cg-chips">
          {#each c.servers as server (server)}<span class="cg-chip">{server}</span>{/each}
          {#each c.tags as tag (tag)}<span class="cg-chip tag">{tag}</span>{/each}
        </div>
      {/if}

      {#if config.configs.length || config.installs.length}
        <h3 class="t-footnote">Comes with</h3>
        <div class="cg-group">
          {#each config.configs as linked (linked.id)}
            <div class="cg-row"><span class="cg-label">{linked.address}</span><span class="cg-val">Config, loads first</span></div>
          {/each}
          {#each config.installs as install (install.id)}
            <div class="cg-row"><span class="cg-label">{install.name}</span><span class="cg-val">{install.type}</span></div>
          {/each}
        </div>
      {/if}

      {#if config.changes?.length}
        <h3 class="t-footnote">Changes</h3>
        <p class="t-footnote l2 list">{config.changes.join(", ")}</p>
      {/if}

      {#if about?.blocks.length}
        <h3 class="t-footnote">About</h3>
        <div class="t-callout about"><Markdown tokens={about.blocks} onlink={openLink} /></div>
      {/if}

      {#if config.revisions.length}
        <h3 class="t-footnote">History</h3>
        <div class="cg-group">
          {#each config.revisions as revision (revision.id)}
            <div class="cg-row stack">
              <span class="cg-label">{revision.latest ? "Newest" : revision.first ? "First version" : date(revision.createdAt)}</span>
              <span class="cg-val t-footnote num">
                {#if revision.latest || revision.first}{date(revision.createdAt)}{" · "}{/if}<span class="pos">{revision.works}</span> / <span class="neg">{revision.fails}</span>
              </span>
              {#if revision.changelog}<span class="cg-full t-footnote l2">{plain(revision.changelog)}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if !configs && item}
    {@const i = item.item}
    <header class="top" class:scrolled>
      <MarketIcon src={i.image} fallback={ITEM_FALLBACK[i.type]} size={48} />
      <div class="grow">
        <h2 class="t-title3">{i.name}</h2>
        <p class="t-footnote l2">
          {i.author ?? ""}{i.author ? " · " : ""}{i.downloads.toLocaleString("en-US")} downloads{#if i.rating !== undefined}{" · "}{i.rating.toFixed(1)} of 5{/if}
        </p>
      </div>
    </header>
    <div class="scroll" onscroll={(event) => (scrolled = event.currentTarget.scrollTop > 0)}>
      <div class="actions">
        {#if !i.installed}
          <button class="cg-pill primary" onclick={install} disabled={!!busy || !i.installable}>
            {busy === "install" ? "Installing…" : "Install"}
          </button>
        {:else}
          {#if i.update}
            <button class="cg-pill primary" onclick={update} disabled={!!busy}>{busy === "update" ? "Updating…" : "Update"}</button>
          {/if}
          {#if i.type === "Theme" && !i.inUse}
            <button class="cg-pill" onclick={apply} disabled={!!busy}>{busy === "apply" ? "Applying…" : "Use theme"}</button>
          {/if}
          <button class="cg-pill quiet danger" bind:this={removeButton} onclick={() => (removing = true)} disabled={!!busy}>
            {busy === "remove" ? "Removing…" : "Remove"}
          </button>
        {/if}
      </div>
      {#if removing}
        <ConfirmPopover
          title="Remove {i.name}?"
          action="Remove"
          placement="modal"
          initialFocus="cancel"
          anchor={removeButton}
          onconfirm={remove}
          oncancel={() => (removing = false)}
        />
      {/if}
      {#if i.notFor}<p class="note t-footnote">No version for LiquidBounce {i.notFor}</p>{/if}
      {#if i.installed}<p class="note t-footnote">Version {i.installed.version} is installed{i.inUse ? " and in use" : ""}</p>{/if}
      {#if i.restartRequired}<p class="note t-footnote">Restart the game to finish</p>{/if}
      {#if about}<Gallery images={about.images} />{/if}

      {#if about?.blocks.length}
        <h3 class="t-footnote">About</h3>
        <div class="t-callout about"><Markdown tokens={about.blocks} onlink={openLink} /></div>
      {/if}

      {#if item.versions.length}
        <h3 class="t-footnote">Versions</h3>
        <div class="cg-group">
          {#each item.versions as version (version.revision.id)}
            <div class="cg-row stack" class:unfit={!version.fits}>
              <span class="cg-label">{version.revision.version}{version.installed ? " · installed" : ""}</span>
              <span class="cg-val t-footnote">{version.revision.liquidbounce ? `LiquidBounce ${version.revision.liquidbounce}` : date(version.revision.createdAt)}</span>
              {#if version.revision.changelog}<span class="cg-full t-footnote l2">{plain(version.revision.changelog)}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class="loading t-callout l2">Loading…</p>
  {/if}
</div>

<style>
  .detail { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .top { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 12px 10px 16px; }
  .top::after {
    content: "";
    position: absolute;
    left: 16px;
    right: 12px;
    bottom: 0;
    height: 0.5px;
    background: var(--line);
    opacity: 0;
  }
  .top.scrolled::after { opacity: 1; }
  .grow { flex: 1; min-width: 0; }
  h2, .top p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 12px 32px;
    scrollbar-width: none;
    mask-image: linear-gradient(180deg, transparent 0, #000 8px, #000 calc(100% - 32px), transparent);
  }
  .actions, .report { display: flex; flex-wrap: wrap; gap: 6px; }
  .actions { margin: 2px 0 8px; }
  h3 { margin: 14px 4px 6px; font-weight: 600; color: var(--label-2); }
  .note { margin: 4px 4px 0; color: var(--label-2); }
  .about { padding: 0 4px; }
  .list { padding: 0 4px; white-space: pre-line; overflow-wrap: anywhere; }
  .tag { color: var(--label); }
  .pos { color: var(--positive); }
  .neg { color: var(--negative); }
  .pressed { background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.6); }
  .unfit { opacity: 0.5; }
  .failed { display: grid; gap: 8px; justify-items: start; padding: 16px; }
  .loading { padding: 16px; }
</style>
