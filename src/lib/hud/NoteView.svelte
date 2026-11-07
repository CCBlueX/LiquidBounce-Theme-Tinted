<script lang="ts">
  import type { NoteActivity } from "./island.svelte";

  let { note }: { note: NoteActivity } = $props();
</script>

<div class="activity">
  <span class="text">
    <span class="t-headline">{note.title}</span>
    <span class="t-footnote l2 message">{note.message}</span>
  </span>
  {#if note.error}
    <span class="severity"><span class="dot"></span>Error</span>
  {/if}
</div>

<style>
  .activity {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 8px 20px;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 120px;
    max-width: 360px;
  }
  .t-headline {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .message {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .severity {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border-radius: 12px;
    background: var(--fill-2);
    font-size: 13px;
    font-weight: 600;
    flex: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--negative);
  }
</style>
