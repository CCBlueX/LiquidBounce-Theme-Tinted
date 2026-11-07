<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<kbd>{@render children()}</kbd>

<style>
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 6px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line), inset 0 -1px 0 rgb(0 0 0 / 0.2);
    font: 500 11px/1 "Inter", system-ui, sans-serif;
    color: var(--label);
    white-space: nowrap;
  }
</style>
