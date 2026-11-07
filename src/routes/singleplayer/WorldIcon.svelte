<script lang="ts">
  import Base64Icon from "../../lib/ui/Base64Icon.svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";

  // World icons are 64px screenshots; only whole multiples stay crisp. Without one the grass block stands in.
  let { icon, size = 64 }: { icon?: string; size?: 64 | 128 } = $props();
</script>

<span class="frame" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <Base64Icon {icon} {size}>
    {#snippet fallback()}<ItemIcon id="minecraft:grass_block" size={size === 128 ? 64 : 32} />{/snippet}
  </Base64Icon>
</span>

<style>
  .frame {
    flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
  }
</style>
