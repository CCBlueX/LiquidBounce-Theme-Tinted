<script lang="ts">
  import type { TextComponent } from "../api/types";
  import { textLines } from "../mctext";

  // One line of server text with its colours mapped to the theme palette; scrambled (§k) runs stay static
  let { text }: { text: TextComponent | null | undefined } = $props();

  const runs = $derived(textLines(text)[0] ?? []);
</script>

{#each runs as run, part (part)}<span
    class="tone-{run.tone ?? 'base'}"
    class:b={run.bold}
    class:i={run.italic}
    class:u={run.underlined}
    class:s={run.strikethrough}
    class:k={run.obfuscated}
    aria-hidden={run.obfuscated ? "true" : undefined}>{run.text}</span
  >{/each}

<style>
  .b { font-weight: 650; }
  .i { font-style: italic; }
  .u { text-decoration: underline; }
  .s { text-decoration: line-through; }
  .u.s { text-decoration: underline line-through; }
  .k { opacity: 0.6; }
  /* A small palette in place of Minecraft's 16 colors, light enough for 4.5:1 on the HUD glass over a bright sky;
     dark grey and black read as the secondary label */
  .tone-white { color: var(--label); }
  .tone-gray, .tone-dim { color: var(--label-2); }
  .tone-red { color: #ffd9d6; }
  .tone-gold { color: #ffe7a6; }
  .tone-green { color: #c4f7cc; }
  .tone-aqua { color: #a6ecf5; }
  .tone-blue { color: #d0ddff; }
  .tone-purple { color: #e6c6ff; }
  :global(:root.contrast-more) span:not(.tone-base) { filter: brightness(1.12); }
</style>
