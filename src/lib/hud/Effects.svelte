<script lang="ts">
  import ItemIcon from "../ui/ItemIcon.svelte";
  import { slotOf } from "./layout.svelte";
  import { live } from "./live.svelte";

  const ROW = 24;
  const PADDING = 8;

  const slot = slotOf();
  slot?.claim("y", 3);

  // Effects past the room the list has end in one summary row
  const capacity = $derived(Math.max(1, Math.floor(((slot?.height ?? Infinity) - PADDING) / ROW)));
  const cut = $derived(live.effects.length > capacity ? capacity - 1 : live.effects.length);
</script>

{#if live.effects.length}
  <ul class="effects glass on-glass" aria-label="Effects">
    {#each live.effects.slice(0, cut) as effect (effect.id)}
      <li class="effect">
        <ItemIcon id={effect.id} kind="effect" size={18} fallback />
        <span class="name">{effect.name}</span>
        <span class="time num l2">{effect.time}</span>
      </li>
    {/each}
    {#if cut < live.effects.length}
      <li class="effect more l2">{live.effects.length - cut} more</li>
    {/if}
  </ul>
{/if}

<style>
  .effects {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    border-radius: var(--r-group);
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
  }
  .effect {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 10px;
  }
  .name {
    flex: 1;
    min-width: 0;
    max-width: 180px;
    margin-right: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    padding-left: 10px;
    font-size: 12px;
    font-weight: 400;
  }
</style>
