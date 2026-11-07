<script lang="ts">
  import Keycap from "./Keycap.svelte";

  let {
    value = $bindable(""),
    placeholder = "Search",
    shortcut,
    autofocus = false,
  }: { value?: string; placeholder?: string; shortcut?: string; autofocus?: boolean } = $props();

  let input: HTMLInputElement;
  $effect(() => {
    if (autofocus) input.focus();
  });
</script>

<label class="search">
  <input bind:this={input} bind:value {placeholder} aria-label={placeholder} spellcheck="false" />
  {#if shortcut && !value}<Keycap>{shortcut}</Keycap>{/if}
</label>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 8px 0 16px;
    border-radius: 18px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 14px;
  }
  .search:focus-within { box-shadow: inset 0 0 0 0.5px var(--line), 0 0 0 2px var(--accent); }
  input { flex: 1; min-width: 0; height: 100%; }
  input:focus-visible { outline: none; }
  input::placeholder { color: var(--label-2); }
</style>
