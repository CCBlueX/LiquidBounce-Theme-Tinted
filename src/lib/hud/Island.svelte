<script lang="ts">
  import { getContext, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { moduleStore } from "../modules.svelte";
  import { isReducedMotion, rise, spring, tween } from "../motion";
  import ItemIcon from "../ui/ItemIcon.svelte";
  import { EDITING, hud } from "./components.svelte";
  import { IslandState } from "./island.svelte";
  import { slotOf } from "./layout.svelte";
  import { live } from "./live.svelte";
  import NoteView from "./NoteView.svelte";
  import ScaffoldView from "./ScaffoldView.svelte";
  import TargetView from "./TargetView.svelte";
  import ToggleView from "./ToggleView.svelte";

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

  const enabledCount = $derived(moduleStore.list.filter((module) => module.enabled && !module.hidden).length);
  const compact = $derived(effects.length > 0 || enabledCount > 0);
  const visible = $derived(!!island.kind || compact);

  // Effects past the room end in a count: the chips wrap onto a hidden second line, and the chips row is narrowed to
  // the ones left on the first. Chips change width as their times tick and once the font loads, and the count takes
  // room too, so either measures the row again.
  let chips = $state<HTMLElement>();
  let hiddenEffects = $state(0);
  function fitChips(row: HTMLElement | undefined) {
    if (!row) return;
    row.style.maxWidth = "";
    const items = [...row.children] as HTMLElement[];
    const kept = items.filter((item) => item.offsetTop === items[0].offsetTop);
    const last = kept[kept.length - 1];
    hiddenEffects = items.length - kept.length;
    if (hiddenEffects && last) {
      // Layout offsets, as the capsule's content scales in; they round, so one pixel keeps the last chip on the line
      const end = last.offsetLeft + last.offsetWidth + parseFloat(getComputedStyle(row).paddingRight) + 1;
      row.style.maxWidth = `${end - row.offsetLeft}px`;
    }
  }
  $effect(() => {
    void effects;
    void room;
    void enabledCount;
    const row = chips;
    if (!row) return;
    const observer = new ResizeObserver(() => fitChips(row));
    for (const item of row.children) observer.observe(item);
    return () => observer.disconnect();
  });
  $effect(() => {
    void hiddenEffects;
    fitChips(untrack(() => chips));
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
        `opacity: ${Math.min(1, Math.max(0, (t - 0.1) / 0.45))}; transform: scale(${0.94 + 0.06 * spring(t)})`,
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
        {:else}
          <div class="compact">
            {#if effects.length}
              <span class="chips" bind:this={chips}>
                {#each effects as effect (effect.id)}
                  <span class="effect">
                    <ItemIcon id={effect.id} kind="effect" size={18} label={effect.name} fallback />
                    {#if effect.level}<span class="l2">{effect.level}</span>{/if}
                    <span class="num">{effect.time}</span>
                  </span>
                {/each}
              </span>
              {#if hiddenEffects}<span class="more l2 num">+{hiddenEffects}</span>{/if}
            {/if}
            {#if effects.length && enabledCount}<span class="sep"></span>{/if}
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
    gap: 12px;
    height: 36px;
    padding: 0 14px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
  }
  .effect {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  /* One visible line; chips that wrap to the hidden second line end in the count */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    min-width: 0;
    height: 18px;
    overflow: hidden;
  }
  .more {
    min-width: 3ch;
    margin-left: -4px;
    white-space: nowrap;
  }
  .effect .l2 {
    margin-right: -2px;
  }
  .sep {
    flex: none;
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
