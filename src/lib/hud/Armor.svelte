<script lang="ts">
  import { plainText } from "../mctext";
  import ItemIcon from "../ui/ItemIcon.svelte";
  import { live } from "./live.svelte";

  const LOW = 0.15;

  // The client lists armor feet first; the strip reads helmet to boots
  const pieces = $derived(
    live.armor
      .filter((stack) => !stack.empty && stack.identifier !== "minecraft:air")
      .reverse()
      .map((stack) => {
        const left = stack.maxDamage > 0 ? (stack.maxDamage - stack.damage) / stack.maxDamage : undefined;
        return {
          id: stack.identifier,
          name: plainText(stack.displayName),
          percent: left === undefined ? undefined : Math.round(left * 100),
          low: left !== undefined && left <= LOW,
        };
      }),
  );
</script>

{#if pieces.length}
  <ul class="armor glass on-glass" aria-label="Armor">
    {#each pieces as piece (piece.id)}
      <li
        class="piece"
        class:low={piece.low}
        aria-label={piece.percent === undefined ? piece.name : `${piece.name}, ${piece.percent}% durability`}
      >
        <ItemIcon id={piece.id} size={16} />
        {#if piece.percent !== undefined}<span class="num" aria-hidden="true">{piece.percent}%</span>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .armor {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 30px;
    margin: 0;
    padding: 0 12px 0 9px;
    list-style: none;
    border-radius: 15px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .piece {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .low {
    color: #ffd9d6;
    font-weight: 600;
  }
</style>
