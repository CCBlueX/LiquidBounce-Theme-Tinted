<script lang="ts">
  import type { Argb } from "../../../lib/api/types";
  import { play } from "../../../lib/sound";
  import Slider from "../../../lib/ui/Slider.svelte";
  import { channels, cssColor, fromHex, toHex, withAlpha } from "../tree";

  // Swatch with the hex code; the popover edits the hex code and the opacity
  let { value, label, onchange }: { value: Argb; label: string; onchange: (value: Argb, delay?: number) => void } = $props();

  const id = $props.id();
  let draft = $state("");
  let invalid = $state(false);
  const hex = $derived(toHex(value));
  const alpha = $derived(Math.round((channels(value).a / 255) * 100));

  function toggled(event: ToggleEvent) {
    if (event.newState === "open") {
      draft = hex;
      invalid = false;
      play("open");
    } else {
      play("close");
    }
  }

  function apply() {
    const next = fromHex(draft);
    if (next === undefined) {
      invalid = true;
      play("error");
      return;
    }
    invalid = false;
    draft = toHex(next);
    if (next !== value) onchange(next);
  }
</script>

<button class="swatch-button" popovertarget="color-{id}" style:anchor-name="--color-{id}" aria-label="{label}: {hex}">
  <span class="swatch" aria-hidden="true">
    <span style:background={cssColor(value, true)}></span>
    <span style:background={cssColor(value)}></span>
  </span>
  <span class="cg-val">{hex}</span>
</button>

<div id="color-{id}" class="cg-pop glass editor" popover="auto" style:position-anchor="--color-{id}" ontoggle={toggled}>
  <div class="preview" aria-hidden="true">
    <span style:background={cssColor(value, true)}></span>
    <span style:background={cssColor(value)}></span>
  </div>
  <label class="line">
    <span class="t-footnote l2">Hex</span>
    <input
      class="cg-field hex"
      class:invalid
      bind:value={draft}
      spellcheck="false"
      aria-label="{label} hex code"
      aria-invalid={invalid}
      onkeydown={(event) => event.key === "Enter" && apply()}
      onblur={apply}
    />
  </label>
  {#if invalid}<div class="t-footnote error">Use #RRGGBB or #RRGGBBAA</div>{/if}
  <div class="line">
    <span class="t-footnote l2">Opacity</span>
    <span class="t-footnote cg-val">{alpha}%</span>
  </div>
  <Slider
    min={0}
    max={100}
    value={alpha}
    label="{label} opacity"
    onchange={(next) => {
      const updated = withAlpha(value, ((next as number) / 100) * 255);
      draft = toHex(updated);
      onchange(updated, 150);
    }}
  />
</div>

<style>
  .swatch-button {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 4px;
    border-radius: 8px;
  }
  .swatch-button:hover { background: var(--fill); }
  .swatch,
  .preview {
    display: flex;
    overflow: hidden;
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.3);
    background: rgb(20 20 24);
  }
  .swatch { width: 28px; height: 20px; border-radius: 6px; }
  .swatch > span,
  .preview > span { flex: 1; }
  .editor { width: 240px; padding: 14px; gap: 8px; }
  /* Only while open: an author display value would override the popover's hidden state */
  .editor:popover-open { display: grid; }
  .preview { height: 40px; border-radius: 10px; margin-bottom: 4px; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .hex { width: 130px; font-variant-numeric: tabular-nums; font-family: inherit; }
  .invalid { box-shadow: inset 0 0 0 1px var(--negative); }
  .error { color: var(--negative); }
</style>
