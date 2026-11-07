<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { keyLabel } from "../keys";
  import { isOn, startModules } from "../moduleToggles.svelte";
  import { moduleStore } from "../modules.svelte";
  import { rise } from "../motion";
  import Keycap from "./Keycap.svelte";
  import ModuleSwitchList from "./ModuleSwitchList.svelte";
  import Switch from "./Switch.svelte";

  // A slim glass column at the right edge of an inventory-like screen: the modules that act on it, each with a
  // switch and its key. Vanilla's window stays centred (with the recipe book open its right edge reaches 1350 of
  // 1600 at GUI scale 4), so the column keeps to the last 244 px.
  let { label, names, children }: { label: string; names: string[]; children?: Snippet } = $props();

  let switches: ModuleSwitchList | undefined = $state();
  let focused = false;
  // Without its rows yet the column would arrive short and then grow; a silent client only delays it this long
  const READY_WAIT_MS = 800;
  let waited = $state(false);

  onMount(() => {
    const wait = setTimeout(() => (waited = true), READY_WAIT_MS);
    const stop = startModules();
    return () => {
      clearTimeout(wait);
      stop();
    };
  });

  // Modules missing from this client build simply do not appear
  const rows = $derived(names.flatMap((name) => moduleStore.byName.get(name) ?? []));
  const ready = $derived(moduleStore.list.length > 0 || waited);

  // The first switch takes focus once the list arrives, so arrow keys work without a Tab first
  $effect(() => {
    if (focused || !rows.length || !switches) return;
    focused = true;
    tick().then(() => document.activeElement === document.body && switches?.focus());
  });
</script>

{#if rows.length || (children && ready)}
  <aside class="ornament glass on-glass" aria-label={label} in:rise>
    <h1 class="sr-only">{label}</h1>
    {#if rows.length}
      <ModuleSwitchList modules={rows} label="Modules" bind:this={switches}>
        {#snippet row(module, toggle)}
          {@const key = keyLabel(module.keyBind.boundKey)}
          {@const active = isOn(module)}
          <div class="row" class:off={!active} role="listitem">
            <span class="name">{module.name}</span>
            {#if key}<span class="bind" aria-hidden="true"><Keycap>{key}</Keycap></span>{/if}
            <Switch small checked={active} label="{module.name}{key ? `, bound to ${key}` : ''}" onchange={toggle} />
          </div>
        {/snippet}
      </ModuleSwitchList>
    {/if}
    {#if children}
      {#if rows.length}<div class="rule" role="separator"></div>{/if}
      {@render children()}
    {/if}
  </aside>
{/if}

<style>
  .ornament {
    position: absolute;
    right: 12px;
    top: 50%;
    translate: 0 -50%;
    width: 208px;
    max-height: calc(100% - 48px);
    overflow-y: auto;
    scrollbar-width: none;
    padding: 4px;
    border-radius: var(--r-pane);
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 10px;
    border-radius: 14px;
    transition: background-color var(--t-pop) var(--ease);
  }
  .row:hover, .row:has(:focus-visible) { background: var(--fill); }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
    letter-spacing: -0.005em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row.off .name { color: var(--label-2); }
  .bind { display: inline-flex; }
  .rule { height: 0.5px; margin: 4px 10px; background: var(--line); flex: none; }
</style>
