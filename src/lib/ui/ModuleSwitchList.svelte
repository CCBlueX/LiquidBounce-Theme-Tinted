<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Module } from "../api/types";
  import { setModule } from "../moduleToggles.svelte";
  import { play } from "../sound";

  // One tab stop for the list: the switch used last, else the first. Up and Down walk the switches, Home and End
  // jump, Space or Enter flips. Each row is the caller's, rendered with the module and its toggle function.
  let {
    modules,
    label,
    ontoggle,
    row,
  }: {
    modules: Module[];
    label: string;
    ontoggle?: (name: string, enabled: boolean) => void;
    row: Snippet<[Module, (enabled: boolean) => void]>;
  } = $props();

  let list: HTMLDivElement | undefined = $state();
  let focusName = $state<string>();

  function toggle(name: string, enabled: boolean) {
    focusName = name;
    ontoggle?.(name, enabled);
    setModule(name, enabled);
  }

  function listKey(event: KeyboardEvent) {
    const switches = [...(list?.querySelectorAll<HTMLElement>("[role=switch]") ?? [])];
    const index = switches.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowDown" ? Math.min(switches.length - 1, index + 1)
      : event.key === "ArrowUp" ? Math.max(0, index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? switches.length - 1
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next !== index) play("tap");
    focusName = modules[next]?.name;
    switches[next].focus();
  }

  $effect(() => {
    const switches = list?.querySelectorAll<HTMLElement>("[role=switch]") ?? [];
    const current = modules.findIndex((module) => module.name === focusName);
    switches.forEach((element, index) => element.setAttribute("tabindex", index === Math.max(0, current) ? "0" : "-1"));
  });

  /** Focuses the switch that holds the tab stop. */
  export function focus() {
    list?.querySelector<HTMLElement>('[role=switch][tabindex="0"]')?.focus();
  }
</script>

<!-- Arrow keys walk the switches inside; the list itself is never focused -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div role="list" aria-label={label} bind:this={list} onkeydown={listKey}>
  {#each modules as module (module.name)}
    {@render row(module, (enabled) => toggle(module.name, enabled))}
  {/each}
</div>
