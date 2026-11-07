<script lang="ts">
  import PlayerHead from "../ui/PlayerHead.svelte";
  import type { TargetInfo } from "./live.svelte";

  let { target }: { target: TargetInfo } = $props();

  const fraction = $derived(Math.max(0, Math.min(1, target.health / target.maxHealth)));
  const hp = (value: number) => String(Math.round(value * 10) / 10);
  const meta = $derived.by(() => {
    const health = `${hp(target.health)}${target.absorption > 0 ? ` + ${hp(target.absorption)}` : ""} hp`;
    return target.distance === undefined ? health : `${health} · ${target.distance.toFixed(1)} m`;
  });
</script>

<div class="activity">
  <PlayerHead uuid={target.uuid} size={32} radius={8} />
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
    gap: 10px;
    height: 52px;
    padding: 0 16px;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .meta .t-footnote {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    flex: none;
    width: 80px;
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
