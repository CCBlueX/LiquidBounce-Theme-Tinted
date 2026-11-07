<script lang="ts">
  import { onMount } from "svelte";
  import { on } from "../../lib/api/events";
  import { player } from "../../lib/api/routes";
  import type { ItemStack } from "../../lib/api/types";
  import { plainText } from "../../lib/mctext";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import Ornament from "../../lib/ui/Ornament.svelte";

  // Vanilla draws the inventory itself; the ornament adds the inventory modules and how worn the armor is.
  const MODULES = ["InventoryMove", "InventoryCleaner", "AutoArmor", "ItemScroller", "BetterInventory"];
  // armor[] runs feet, legs, chest, head; the list reads top down like the player
  const SLOTS = ["Helmet", "Chestplate", "Leggings", "Boots"];

  type Piece = { slot: string; id: string; name: string; left: number; max: number };

  let pieces = $state.raw<Piece[]>([]);
  let signature = "";

  function apply(armor: ItemStack[] | undefined) {
    const next = (armor ?? [])
      .slice(0, 4)
      .map((stack, index) => ({ stack, slot: SLOTS[3 - index] }))
      .reverse()
      .filter(({ stack }) => !stack.empty)
      .map(({ stack, slot }) => ({
        slot,
        id: stack.identifier,
        name: plainText(stack.displayName) || slot,
        left: Math.max(0, stack.maxDamage - stack.damage),
        max: stack.maxDamage,
      }));
    // The inventory event arrives about 20 times a second with the same content; only real changes re-render
    const key = next.map((piece) => `${piece.id}:${piece.left}/${piece.max}`).join(",");
    if (key === signature) return;
    signature = key;
    pieces = next;
  }

  onMount(() => {
    player.inventory().then((inventory) => apply(inventory?.armor)).catch(() => {});
    return on("clientPlayerInventory", ({ inventory }) => apply(inventory.armor));
  });

  function share(piece: Piece) {
    return piece.max > 0 ? piece.left / piece.max : 1;
  }
</script>

<Ornament label="Inventory modules and armor" names={MODULES}>
  <section class="armor" aria-labelledby="armor-title">
    <h2 id="armor-title" class="t-footnote">Armor</h2>
    {#if pieces.length}
      <ul>
        {#each pieces as piece (piece.slot)}
          {@const low = piece.max > 0 && share(piece) < 0.2}
          <li
            class="piece"
            class:low
            aria-label="{piece.name}, {piece.max > 0 ? `${piece.left} of ${piece.max} durability${low ? ', low' : ''}` : 'does not wear out'}"
          >
            <ItemIcon id={piece.id} size={32} />
            <div class="meter" aria-hidden="true">
              {#if piece.max > 0}
                <span class="value num"><b>{piece.left}</b><span class="l2">/{piece.max}</span></span>
                <span class="bar"><span class="fill" style:width="{share(piece) * 100}%"></span></span>
              {:else}
                <span class="value l2">No durability</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="t-footnote l2 none">No armor worn</p>
    {/if}
  </section>
</Ornament>

<style>
  .armor { padding: 4px 6px 6px; }
  h2 { font-weight: 600; color: var(--label-2); padding: 2px 2px 6px; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .piece { display: flex; align-items: center; gap: 10px; height: 44px; }
  .meter { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .value { font-size: 12px; line-height: 14px; }
  .value b { font-weight: 600; }
  .bar { height: 4px; border-radius: 2px; background: var(--fill-2); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 2px; background: var(--label); transition: width var(--t-enter) var(--ease); }
  .low .fill { background: var(--negative); }
  .low .value b { color: #ff8a8d; }
  .none { padding: 0 2px 6px; }
</style>
