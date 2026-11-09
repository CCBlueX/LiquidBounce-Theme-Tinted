<script lang="ts">
  import { market } from "../../../lib/api/routes";
  import { play } from "../../../lib/sound";

  // Loads only the chosen modules of a config; the list comes from the config's newest revision when opened
  let { id, disabled, onload }: { id: number; disabled: boolean; onload: (modules: string[]) => void } = $props();

  const uid = $props.id();
  const popoverId = `modules-${uid}`;
  let panel = $state<HTMLDivElement>();
  let modules = $state<string[]>();
  let chosen = $state<string[]>([]);
  let failed = $state(false);

  $effect(() => {
    void id;
    modules = undefined;
    chosen = [];
  });

  function toggled(event: ToggleEvent) {
    if (event.newState !== "open") return;
    play("open");
    if (modules) return;
    failed = false;
    market.modules(id).then(
      (names) => (modules = names),
      () => (failed = true),
    );
  }

  function flip(name: string) {
    chosen = chosen.includes(name) ? chosen.filter((other) => other !== name) : [...chosen, name];
  }

  function confirm() {
    panel?.hidePopover();
    onload(chosen);
    chosen = [];
  }
</script>

<button class="cg-pill" popovertarget={popoverId} style="anchor-name: --{popoverId}" {disabled}>Choose modules…</button>

<div id={popoverId} class="cg-pop glass deep picker" popover="auto" bind:this={panel} style:position-anchor="--{popoverId}" ontoggle={toggled}>
  {#if failed}
    <p class="t-footnote l2 hint">The modules could not be loaded.</p>
  {:else if !modules}
    <p class="t-footnote l2 hint">Loading…</p>
  {:else}
    <div class="head">
      <span class="t-footnote l2">{chosen.length} of {modules.length}</span>
      <button class="cg-pill quiet" onclick={() => (chosen = chosen.length === modules?.length ? [] : [...(modules ?? [])])}>
        {chosen.length === modules.length ? "None" : "All"}
      </button>
    </div>
    <div class="list" role="group" aria-label="Modules">
      {#each modules as name (name)}
        <button class="cg-option" role="checkbox" aria-checked={chosen.includes(name)} onclick={() => flip(name)}>
          <span class="check" aria-hidden="true">{chosen.includes(name) ? "✓" : ""}</span>
          <span class="grow">{name}</span>
        </button>
      {/each}
    </div>
    <button class="cg-pill primary load" onclick={confirm} disabled={!chosen.length}>
      {chosen.length === 1 ? "Load 1 module" : `Load ${chosen.length} modules`}
    </button>
  {/if}
</div>

<style>
  .picker { width: 240px; max-height: 360px; display: flex; flex-direction: column; overflow: hidden; }
  .picker:not(:popover-open) { display: none; }
  .head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 4px 8px; }
  .list { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  .load { margin: 6px 4px 2px; justify-content: center; }
  .hint { padding: 8px; }
</style>
