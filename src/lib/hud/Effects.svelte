<script lang="ts">
  import ItemIcon from "../ui/ItemIcon.svelte";
  import { live } from "./live.svelte";
</script>

{#if live.effects.length}
  <ul class="effects glass on-glass" aria-label="Effects">
    {#each live.effects as effect (effect.id)}
      <li class="effect">
        <ItemIcon id={effect.id} kind="effect" size={18} />
        <span class="name">{effect.name}</span>
        <span class="time num l2">{effect.time}</span>
      </li>
    {/each}
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
    padding: 0 10px 0 7px;
  }
  .name {
    flex: 1;
    white-space: nowrap;
    margin-right: 8px;
  }
</style>
