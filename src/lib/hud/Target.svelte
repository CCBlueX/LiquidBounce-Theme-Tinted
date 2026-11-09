<script lang="ts">
  import { fade } from "svelte/transition";
  import { isReducedMotion } from "../motion";
  import PlayerHead from "../ui/PlayerHead.svelte";
  import { live } from "./live.svelte";

  const target = $derived(live.target);
  const hp = (value: number) => String(Math.round(value * 10) / 10);
  // Absorption extends the bar past full health, so the bar's whole length is the larger of the two
  const scale = $derived(target ? Math.max(target.maxHealth, target.health + target.absorption) : 1);
  const appear = (node: Element) => fade(node, { duration: isReducedMotion() ? 120 : 180 });
</script>

{#if target}
  <section class="card glass on-glass" aria-label="Target {target.name}" transition:appear>
    <PlayerHead uuid={target.uuid} size={32} radius={8} />
    <div class="text">
      <div class="top">
        <span class="name">{target.name}</span>
        {#if target.distance !== undefined}<span class="t-footnote l2 num">{target.distance.toFixed(1)} m</span>{/if}
      </div>
      <div class="bar" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={target.maxHealth} aria-valuenow={target.health}>
        <i class="health" style:transform="scaleX({Math.max(0, target.health) / scale})"></i>
        {#if target.absorption > 0}<i class="absorption" style:transform="translateX({(Math.max(0, target.health) / scale) * 100}%) scaleX({target.absorption / scale})"></i>{/if}
      </div>
      <span class="t-footnote l2 num">
        {hp(target.health)}{#if target.absorption > 0}{` + ${hp(target.absorption)}`}{/if} hp
      </span>
    </div>
  </section>
{/if}

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 220px;
    height: 56px;
    padding: 0 12px;
    border-radius: var(--r-card);
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    position: relative;
    height: 4px;
    margin: 2px 0;
    border-radius: 2px;
    background: var(--fill-2);
    overflow: hidden;
  }
  .bar i {
    position: absolute;
    inset: 0;
    transform-origin: left;
    transition: transform var(--t-pop) var(--ease);
  }
  .health {
    background: var(--label);
  }
  .absorption {
    background: #f6cf72;
  }
</style>
