<script lang="ts">
  import Ornament from "../../lib/ui/Ornament.svelte";

  // Vanilla draws the chest; the client exposes none of its slots, so the ornament carries only the modules that
  // work on containers.
  const MODULES = ["ChestStealer", "ChestCleaner", "AutoDeposit", "ItemScroller"];
</script>

<Ornament label="Container modules" names={MODULES} />
