<script lang="ts">
  import type { Snippet } from "svelte";
  import { play } from "../sound";

  // A pull-down on the Popover API: light dismiss and Esc come with it, CSS anchor positioning places it under the
  // trigger. Arrow keys, Home and End move between items; opening focuses the checked item, else the first.
  type TriggerProps = { popovertarget: string; "aria-haspopup": "menu"; style: string };
  let {
    label,
    class: className,
    trigger,
    children,
  }: {
    label: string;
    /** Global classes of the menu surface, e.g. "mg-pop glass deep". */
    class: string;
    trigger: Snippet<[TriggerProps]>;
    /** Items; run the item's action through `pick` so the menu closes and focus returns to the trigger first. */
    children: Snippet<[(action: () => void) => void]>;
  } = $props();

  const uid = $props.id();
  const id = `menu-${uid}`;
  let menu: HTMLDivElement;

  const items = () => [...menu.querySelectorAll<HTMLElement>("[role^=menuitem]")];

  export function open() {
    menu.showPopover();
  }

  function toggled(event: ToggleEvent) {
    if (event.newState === "open") {
      play("open");
      const first = menu.querySelector<HTMLElement>('[aria-checked="true"]') ?? items()[0];
      first?.focus();
      first?.scrollIntoView({ block: "nearest" });
    } else {
      play("close");
    }
  }

  function pick(action: () => void) {
    menu.hidePopover();
    document.querySelector<HTMLElement>(`[popovertarget="${id}"]`)?.focus();
    action();
  }

  function key(event: KeyboardEvent) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    all[(next + all.length) % all.length]?.focus();
  }
</script>

{@render trigger({ popovertarget: id, "aria-haspopup": "menu", style: `anchor-name: --${id}` })}

<div
  {id}
  class={className}
  popover="auto"
  role="menu"
  aria-label={label}
  tabindex="-1"
  bind:this={menu}
  style:position-anchor="--{id}"
  ontoggle={toggled}
  onkeydown={key}
>
  {@render children(pick)}
</div>
