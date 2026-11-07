<script lang="ts">
  import PlayerHead from "../../lib/ui/PlayerHead.svelte";
  import type { TargetActivity } from "./island.svelte";

  let { target }: { target: TargetActivity } = $props();

  const fraction = $derived(Math.max(0, Math.min(1, target.health / target.maxHealth)));
  const hp = (value: number) => String(Math.round(value * 10) / 10);
  const meta = $derived.by(() => {
    const health = `${hp(target.health)}${target.absorption > 0 ? ` + ${hp(target.absorption)}` : ""} hp`;
    return target.distance === undefined ? health : `${health} · ${target.distance.toFixed(1)} m`;
  });
</script>

<div class="activity">
  <span class="badge">
    <PlayerHead uuid={target.uuid} size={32} radius={4} />
  </span>
  <span class="text">
    <span class="t-headline name">{target.name}</span>
    <span class="meta">
      <span class="bar" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={target.maxHealth} aria-valuenow={target.health}>
        <i style:transform="scaleX({fraction})"></i>
      </span>
      <span class="t-footnote l2 num">{meta}</span>
    </span>
  </span>
</div>

<style>
  .activity {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 20px 0 8px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--fill-2);
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    white-space: nowrap;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
  }
  .bar {
    width: 96px;
    height: 4px;
    border-radius: 2px;
    background: var(--fill-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--label);
    transform-origin: left;
    transition: transform var(--t-pop) var(--ease);
  }
</style>
