<script lang="ts">
  import { play } from "../sound";

  // One component for both shapes: `value` for a single knob, `from`/`to` for a range
  let {
    min,
    max,
    step = 1,
    value,
    from,
    to,
    label,
    onchange,
  }: {
    min: number;
    max: number;
    step?: number;
    value?: number;
    from?: number;
    to?: number;
    label: string;
    onchange?: (value: number | { from: number; to: number }) => void;
  } = $props();

  const isRange = $derived(from !== undefined && to !== undefined);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  let track: HTMLDivElement;
  let dragging: "single" | "from" | "to" | null = $state(null);

  function snap(raw: number) {
    const stepped = Math.round((raw - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
  }

  function emit(knob: "single" | "from" | "to", next: number) {
    if (knob === "single") {
      if (next !== value) play("tap");
      onchange?.(next);
    } else {
      const range = knob === "from" ? { from: Math.min(next, to!), to: to! } : { from: from!, to: Math.max(next, from!) };
      if (range.from !== from || range.to !== to) play("tap");
      onchange?.(range);
    }
  }

  function valueAt(clientX: number) {
    const box = track.getBoundingClientRect();
    return snap(min + ((clientX - box.left) / box.width) * (max - min));
  }

  function down(event: PointerEvent) {
    const v = valueAt(event.clientX);
    dragging = isRange ? (Math.abs(v - from!) <= Math.abs(v - to!) ? "from" : "to") : "single";
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    emit(dragging, v);
  }

  function move(event: PointerEvent) {
    if (dragging) emit(dragging, valueAt(event.clientX));
  }

  function key(knob: "single" | "from" | "to", event: KeyboardEvent) {
    const current = knob === "single" ? value! : knob === "from" ? from! : to!;
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 }[
      event.key
    ];
    if (delta === undefined) return;
    event.preventDefault();
    emit(knob, snap(current + delta));
  }
</script>

<div
  class="slider"
  class:dragging
  bind:this={track}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (dragging = null)}
  role="presentation"
>
  <div class="track"></div>
  {#if isRange}
    <div class="fill" style:left="{pct(from!)}%" style:width="{pct(to!) - pct(from!)}%"></div>
    {#each [["from", from!], ["to", to!]] as const as [knob, v] (knob)}
      <div
        class="knob"
        style:left="{pct(v)}%"
        role="slider"
        tabindex="0"
        aria-label="{label} {knob === 'from' ? 'minimum' : 'maximum'}"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={v}
        onkeydown={(event) => key(knob, event)}
      ></div>
    {/each}
  {:else}
    <div class="fill" style:width="{pct(value!)}%"></div>
    <div
      class="knob"
      style:left="{pct(value!)}%"
      role="slider"
      tabindex="0"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onkeydown={(event) => key("single", event)}
    ></div>
  {/if}
</div>

<style>
  .slider { position: relative; height: 24px; display: flex; align-items: center; touch-action: none; }
  .track { position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px; background: var(--fill-3); }
  .fill { position: absolute; left: 0; height: 4px; border-radius: 2px; background: var(--accent); }
  /* A 24px hit area around a 16px knob */
  .knob {
    position: absolute;
    width: 24px;
    height: 24px;
    margin-left: -12px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    transition: transform var(--t-press) var(--ease);
  }
  .knob::after {
    content: "";
    width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.35), 0 0 0 0.5px rgb(0 0 0 / 0.1);
  }
  .dragging .knob:hover,
  .knob:active { transform: scale(1.12); }
</style>
