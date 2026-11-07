<script lang="ts">
  import type { TransitionConfig } from "svelte/transition";
  import { moduleStore } from "../../lib/modules.svelte";
  import { isReducedMotion, rise, spring, tween } from "../../lib/motion";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import { IslandState } from "./island.svelte";
  import NoteView from "./NoteView.svelte";
  import ScaffoldView from "./ScaffoldView.svelte";
  import TargetView from "./TargetView.svelte";
  import ToggleView from "./ToggleView.svelte";

  const MORPH_MS = 560;
  const MAX_RADIUS = 28;

  const island = new IslandState();
  $effect(() => island.start());

  const enabledCount = $derived(moduleStore.list.filter((module) => module.enabled && !module.hidden).length);
  const compact = $derived(island.effects.length > 0 || enabledCount > 0);
  const visible = $derived(!!island.kind || compact);

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

  // Outgoing content is nearly gone before the incoming fades in, so two layers never read on top of each other
  function contentIn(_: Element): TransitionConfig {
    if (isReducedMotion()) return { delay: 80, duration: 160, css: (t) => `opacity: ${t}` };
    return {
      delay: 90,
      duration: 260,
      easing: spring,
      css: (t) => `opacity: ${Math.min(1, t * 1.4)}; transform: scale(${0.94 + 0.06 * t})`,
    };
  }

  function contentOut(_: Element): TransitionConfig {
    if (isReducedMotion()) return { duration: 100, css: (t) => `opacity: ${t * t}` };
    return { duration: 110, css: (t) => `opacity: ${t * t}; transform: scale(${0.96 + 0.04 * t})` };
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
      <div class="layer" use:measure in:contentIn out:contentOut>
        {#if island.kind === "target" && island.target}
          <TargetView target={island.target} />
        {:else if island.kind === "scaffold" && island.scaffold}
          <ScaffoldView scaffold={island.scaffold} />
        {:else if island.kind === "notification" && island.notes[0]}
          <NoteView note={island.notes[0]} />
        {:else if island.kind === "toggle" && island.toggle}
          <ToggleView toggle={island.toggle} />
        {:else}
          <div class="compact">
            {#each island.effects as effect (effect.id)}
              <span class="effect">
                <ItemIcon id={effect.id} kind="effect" size={18} label={effect.name} />
                {#if effect.level}<span class="l2">{effect.level}</span>{/if}
                <span class="num">{effect.time}</span>
              </span>
            {/each}
            {#if island.effects.length && enabledCount}<span class="sep"></span>{/if}
            {#if enabledCount}
              <span class="count"><span class="num">{enabledCount}</span> <span class="l2">{enabledCount === 1 ? "module on" : "modules on"}</span></span>
            {/if}
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
    gap: 14px;
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
  }
  .effect {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .effect .l2 {
    margin-right: -2px;
  }
  .sep {
    width: 1px;
    height: 16px;
    background: var(--line);
  }
  .count {
    white-space: nowrap;
  }
  .caption {
    margin-top: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    color: var(--label);
    box-shadow: var(--specular), 0 4px 12px rgb(0 0 0 / 0.14);
  }
</style>
