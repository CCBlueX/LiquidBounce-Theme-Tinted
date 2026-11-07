<script lang="ts">
  import { plainText } from "../mctext";
  import { slotOf } from "./layout.svelte";
  import { live } from "./live.svelte";
  import McLine from "./McLine.svelte";

  const LINE = 20;
  const CHROME = 34;

  const slot = slotOf();
  slot?.claim("y", 1);

  // The server's sidebar in place of vanilla's (the component's tweak hides that one); the client sends up to 15
  // lines, and lines past the room the board has are left out from the bottom like vanilla's sixteenth
  const board = $derived(live.scoreboard);
  const capacity = $derived(Math.max(1, Math.floor(((slot?.height ?? Infinity) - CHROME) / LINE)));
</script>

{#if board}
  <section class="board glass on-glass" aria-label={plainText(board.header) || "Scoreboard"}>
    <h2 class="title"><McLine text={board.header} /></h2>
    {#each board.entries.slice(0, capacity) as entry, index (index)}
      <div class="line">
        <span class="name"><McLine text={entry?.name} /></span>
        <span class="score num"><McLine text={entry?.score} /></span>
      </div>
    {/each}
  </section>
{/if}

<style>
  .board {
    display: flex;
    flex-direction: column;
    min-width: 140px;
    max-width: 280px;
    padding: 6px 10px 6px;
    border-radius: var(--r-group);
    font-size: 13px;
    line-height: 20px;
    font-weight: 500;
    box-shadow: var(--specular), 0 8px 24px rgb(0 0 0 / 0.16), 0 1px 4px rgb(0 0 0 / 0.1);
    /* Server colours are many and bright; the denser material keeps every one of them readable */
    background: var(--sheen), var(--glass-deep);
  }
  .title {
    margin: 0 0 2px;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line {
    display: flex;
    gap: 12px;
    min-height: 20px;
  }
  .name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .score {
    white-space: nowrap;
  }
</style>
