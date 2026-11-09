<script lang="ts">
  import { getContext, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { isReducedMotion, rise, spring, tween } from "../motion";
  import ItemIcon from "../ui/ItemIcon.svelte";
  import PlayerHead from "../ui/PlayerHead.svelte";
  import { EDITING, hud } from "./components.svelte";
  import { IslandState, blockName } from "./island.svelte";
  import { slotOf } from "./layout.svelte";
  import { live } from "./live.svelte";
  import NoteView from "./NoteView.svelte";
  import ScaffoldView from "./ScaffoldView.svelte";
  import TargetView from "./TargetView.svelte";
  import ToggleView from "./ToggleView.svelte";
  import { serverSession } from "./session.svelte";

  const MORPH_MS = 560;
  const MAX_RADIUS = 26;
  const MAX_WIDTH = 560;

  const island = new IslandState(getContext<boolean>(EDITING) ?? false);
  // The capsule is the most transient component; it takes the width the others leave, up to a capsule's width
  const slot = slotOf();
  slot?.claim("x", 4);
  const room = $derived(`${slot && Number.isFinite(slot.width) ? Math.min(slot.width, MAX_WIDTH) : MAX_WIDTH}px`);
  $effect(() => island.start());
  // The Effects and Target components take over what the capsule would show
  $effect(() => {
    const show = !hud.isOn("Target");
    untrack(() => (island.showTarget = show));
  });
  const effects = $derived(hud.isOn("Effects") ? [] : live.effects);
  $effect(() => serverSession.start());

  // At rest: the player, effects, where they play, kills and deaths, time played, then TPS and players online, which
  // give way first when room runs out
  const me = $derived(live.me);
  const server = $derived(serverSession.server);
  const statistics = $derived(serverSession.statistics);
  const visible = $derived(!!island.kind || !!me);

  const DIMENSIONS: Record<string, string> = { "minecraft:overworld": "Overworld", "minecraft:the_nether": "Nether", "minecraft:the_end": "End" };
  // Saved servers by name, others by address; singleplayer by dimension
  const place = $derived.by(() => {
    if (!server) return { detail: me ? (DIMENSIONS[me.dimension] ?? blockName(me.dimension)) : undefined };
    return { name: server.id === undefined ? server.address : server.name, detail: me?.ping ? `${me.ping} ms` : undefined };
  });
  const played = $derived.by(() => {
    const minutes = serverSession.minutes;
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  });

  // Items past the room wrap onto a hidden second line, and the row is narrowed to the ones left on the first. Items
  // change width as effect times tick and once the font loads, so either measures the row again.
  let row = $state<HTMLElement>();
  function fitRow(node: HTMLElement | undefined) {
    if (!node) return;
    node.style.maxWidth = "";
    const items = [...node.children] as HTMLElement[];
    const kept = items.filter((item) => item.offsetTop === items[0].offsetTop);
    const last = kept[kept.length - 1];
    if (last && kept.length < items.length) {
      // Layout offsets, as the capsule's content scales in; they round, so one pixel keeps the last item on the line
      node.style.maxWidth = `${last.offsetLeft + last.offsetWidth + 1 - node.offsetLeft}px`;
    }
  }
  $effect(() => {
    void effects;
    void room;
    void server;
    void me;
    const node = row;
    if (!node) return;
    const observer = new ResizeObserver(() => fitRow(node));
    for (const item of node.children) observer.observe(item);
    return () => observer.disconnect();
  });

  const view = $derived.by(() => {
    switch (island.kind) {
      case "target":
        return `target:${island.target?.uuid}`;
      case "scaffold":
        return "scaffold";
      case "notification":
        return `note:${island.notes[0]?.id}`;
      case "toggle":
        return `toggle:${island.toggle?.name}:${island.toggle?.enabled}`;
      default:
        return "compact";
    }
  });

  // The capsule's size follows whatever content is on top, with a spring; under reduce motion it jumps
  let width = $state(0);
  let height = $state(0);
  let stopWidth = () => {};
  let stopHeight = () => {};
  let snap: number | undefined;
  let latest: HTMLElement | undefined;

  function morph(toWidth: number, toHeight: number) {
    // Even widths keep the centred capsule, and the pixel art in it, on whole pixels
    toWidth = Math.ceil(toWidth / 2) * 2;
    if (toWidth === width && toHeight === height) return;
    stopWidth();
    stopHeight();
    clearTimeout(snap);
    if (width === 0) {
      width = toWidth;
      height = toHeight;
      return;
    }
    stopWidth = tween(width, toWidth, MORPH_MS, (value) => (width = Math.round(value)));
    stopHeight = tween(height, toHeight, MORPH_MS, (value) => (height = Math.round(value)));
    // The spring ends a hair short of its target; land exactly
    snap = setTimeout(() => {
      width = toWidth;
      height = toHeight;
    }, MORPH_MS + 34);
  }

  function measure(node: HTMLElement) {
    latest = node;
    const observer = new ResizeObserver(() => {
      if (node === latest) morph(node.offsetWidth, node.offsetHeight);
    });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
        if (latest === node) latest = undefined;
      },
    };
  }

  $effect(() => () => {
    stopWidth();
    stopHeight();
    clearTimeout(snap);
  });

  // A cross-fade inside the moving shape: the outgoing content is gone within ~90 ms while the incoming already
  // shows from ~30 ms, so the capsule never morphs empty
  function contentIn(_: Element): TransitionConfig {
    if (isReducedMotion()) return { duration: 160, css: (t) => `opacity: ${Math.min(1, Math.max(0, (t - 0.15) / 0.6))}` };
    return {
      duration: 300,
      css: (t) =>
        `opacity: ${Math.min(1, Math.max(0, (t - 0.1) / 0.45))}; transform: scale(${0.96 + 0.04 * spring(t)})`,
    };
  }

  function contentOut(_: Element): TransitionConfig {
    if (isReducedMotion()) return { duration: 80, css: (t) => `opacity: ${t * t}` };
    return { duration: 90, css: (t) => `opacity: ${t * t}; transform: scale(${0.96 + 0.04 * t})` };
  }
</script>

{#if visible}
  <div
    class="island glass on-glass"
    style:width="{width}px"
    style:height="{height}px"
    style:border-radius="{Math.min(height / 2, MAX_RADIUS)}px"
    role="status"
    aria-live="polite"
    transition:rise={{ y: -8 }}
  >
    {#key view}
      <div class="layer" style:max-width={room} use:measure in:contentIn out:contentOut>
        {#if island.kind === "target" && island.target}
          <TargetView target={island.target} />
        {:else if island.kind === "scaffold" && island.scaffold}
          <ScaffoldView scaffold={island.scaffold} />
        {:else if island.kind === "notification" && island.notes[0]}
          <NoteView note={island.notes[0]} />
        {:else if island.kind === "toggle" && island.toggle}
          <ToggleView toggle={island.toggle} />
        {:else if me}
          <div class="compact">
            <span class="row" bind:this={row}>
              <span class="item">
                <PlayerHead uuid={me.uuid} size={16} radius={4} />
                <span class="name">{me.name}</span>
              </span>
              {#each effects as effect, index (effect.id)}
                <span class="item" class:lead={index === 0}>
                  <ItemIcon id={effect.id} kind="effect" size={18} label={effect.name} fallback />
                  {#if effect.level}<span class="l2">{effect.level}</span>{/if}
                  <span class="num">{effect.time}</span>
                </span>
              {/each}
              {#if place.name || place.detail}
                <span class="item lead">
                  {#if place.name}<span class="place">{place.name}</span>{/if}
                  {#if place.detail}<span class="l2 num">{place.detail}</span>{/if}
                </span>
              {/if}
              {#if statistics && statistics.kills + statistics.deaths > 0}
                <span class="item lead" aria-label="{statistics.kills} kills, {statistics.deaths} deaths">
                  <span class="pair"><ItemIcon id="minecraft:iron_sword" size={16} /><span class="num">{statistics.kills}</span></span>
                  <span class="pair"><ItemIcon id="minecraft:skeleton_skull" size={16} /><span class="num">{statistics.deaths}</span></span>
                </span>
              {/if}
              {#if statistics}
                <span class="item lead" aria-label="Played {played}">
                  <ItemIcon id="minecraft:clock" size={16} /><span class="num">{played}</span>
                </span>
              {/if}
              {#if server?.tps !== undefined}
                <span class="item lead"><span class="num">{server.tps.toFixed(1)}</span><span class="l2">TPS</span></span>
              {/if}
              {#if server?.players.online !== undefined}
                <span class="item lead"><span class="num">{server.players.online.toLocaleString("en-US")}</span><span class="l2">online</span></span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/key}
  </div>
{/if}

{#if island.caption}
  <div class="caption glass t-footnote" aria-live="polite" transition:rise={{ y: -4, duration: 200 }}>
    {island.caption}
  </div>
{/if}

<style>
  .island {
    position: relative;
    overflow: hidden;
    box-shadow: var(--specular), 0 10px 30px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .layer {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: max-content;
  }
  .compact {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 14px 0 10px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
  }
  /* One visible line; items that wrap go to a second line out of view */
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px 10px;
    min-width: 0;
    height: 18px;
    overflow: hidden;
  }
  .item {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 18px;
    white-space: nowrap;
  }
  .item.lead {
    margin-left: 2px;
    padding-left: 12px;
  }
  .item.lead::before {
    content: "";
    position: absolute;
    left: 0;
    top: 1px;
    width: 1px;
    height: 16px;
    background: var(--line);
  }
  .name {
    font-weight: 600;
  }
  .pair {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pair + .pair {
    margin-left: 4px;
  }
  .caption {
    margin-top: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    color: var(--label);
    box-shadow: var(--specular), 0 4px 12px rgb(0 0 0 / 0.14);
  }
</style>
