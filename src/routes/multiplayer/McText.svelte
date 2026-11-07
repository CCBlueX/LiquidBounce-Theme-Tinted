<script lang="ts">
  import type { TextComponent } from "../../lib/api/types";
  import { textLines } from "../../lib/mctext";

  // Server-sent text with its colors mapped to the theme palette; vanilla's scrambled (§k) runs stay static and are
  // hidden from screen readers
  let { text, max = Infinity }: { text: TextComponent | null | undefined; max?: number } = $props();

  const lines = $derived(textLines(text).slice(0, max));
</script>

{#each lines as line, index (index)}
  <span class="line">
    {#each line as run, part (part)}<span
        class="tone-{run.tone ?? 'base'}"
        class:b={run.bold}
        class:i={run.italic}
        class:u={run.underlined}
        class:s={run.strikethrough}
        class:k={run.obfuscated}
        aria-hidden={run.obfuscated ? "true" : undefined}>{run.text}</span
      >{/each}
  </span>
{/each}

<style>
  .line { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .b { font-weight: 650; }
  .i { font-style: italic; }
  .u { text-decoration: underline; }
  .s { text-decoration: line-through; }
  .u.s { text-decoration: underline line-through; }
  .k { opacity: 0.6; }
  /* A small palette in place of Minecraft's 16 colors: every tone keeps 4.5:1 on the glass */
  .tone-white { color: var(--label); }
  .tone-gray { color: var(--label-2); }
  .tone-dim { color: var(--label-3); }
  .tone-red { color: #ffc4c1; }
  .tone-gold { color: #f6cf72; }
  .tone-green { color: #a8edb3; }
  .tone-aqua { color: #80dbe8; }
  .tone-blue { color: #bcd0ff; }
  .tone-purple { color: #d9abff; }
  :global(:root.contrast-more) .line span:not(.tone-base) { filter: brightness(1.12); }
</style>
