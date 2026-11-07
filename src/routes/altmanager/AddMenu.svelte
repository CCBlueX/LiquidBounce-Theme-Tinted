<script lang="ts" module>
  export type AddChoice = "cracked" | "device" | "clipboard" | "webview" | "credentials" | "session" | "altening" | "generate";
</script>

<script lang="ts">
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import PopoverMenu from "../../lib/ui/PopoverMenu.svelte";

  // "Add account": a pull-down of every way to add one
  let { onchoose }: { onchoose: (choice: AddChoice) => void } = $props();

  type Item = { choice: AddChoice; icon: string; label: string; hint: string };
  const groups: { label?: string; items: Item[] }[] = [
    { items: [{ choice: "cracked", icon: "minecraft:name_tag", label: "Cracked name", hint: "Offline-mode servers, no sign-in" }] },
    {
      label: "Microsoft",
      items: [
        { choice: "device", icon: "minecraft:ender_eye", label: "Sign in with browser", hint: "Opens the Microsoft sign-in page" },
        { choice: "clipboard", icon: "minecraft:paper", label: "Copy sign-in link", hint: "Finish in any browser" },
        { choice: "webview", icon: "minecraft:filled_map", label: "Sign-in window", hint: "Signs in inside the client" },
        { choice: "credentials", icon: "minecraft:writable_book", label: "Email and password", hint: "Signs in without a browser" },
      ],
    },
    {
      label: "Tokens",
      items: [
        { choice: "session", icon: "minecraft:tripwire_hook", label: "Session token", hint: "Access or refresh token" },
        { choice: "altening", icon: "minecraft:emerald", label: "The Altening token", hint: "A token from The Altening" },
        { choice: "generate", icon: "minecraft:experience_bottle", label: "Generate with The Altening", hint: "Uses your API key" },
      ],
    },
  ];

  let menu: PopoverMenu;

  export function open() {
    menu.open();
  }
</script>

<PopoverMenu label="Add account" class="mg-pop glass deep on-glass" bind:this={menu}>
  {#snippet trigger(props)}
    <button class="mg-pill primary large" {...props} aria-keyshortcuts="N">
      Add account<span class="chev" aria-hidden="true">⌄</span>
    </button>
  {/snippet}
  {#snippet children(pick)}
    {#each groups as group, index (index)}
      {#if index > 0}<hr />{/if}
      {#if group.label}<div class="group-label" aria-hidden="true">{group.label}</div>{/if}
      {#each group.items as item (item.choice)}
        <button
          class="mg-item"
          role="menuitem"
          tabindex="-1"
          aria-label="{item.label}{group.label ? `, ${group.label}` : ''}, {item.hint}"
          onclick={() => pick(() => onchoose(item.choice))}
        >
          <ItemIcon id={item.icon} size={32} />
          <span class="grow"><span class="label">{item.label}</span><span>{item.hint}</span></span>
        </button>
      {/each}
    {/each}
  {/snippet}
</PopoverMenu>
