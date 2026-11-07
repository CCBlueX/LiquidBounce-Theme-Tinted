<script lang="ts" module>
  export type AddChoice = "cracked" | "device" | "clipboard" | "webview" | "credentials" | "session" | "altening" | "generate";
</script>

<script lang="ts">
  import PopoverMenu from "../../lib/ui/PopoverMenu.svelte";

  // "Add account": a pull-down of every way to add one
  let { onchoose }: { onchoose: (choice: AddChoice) => void } = $props();

  type Item = { choice: AddChoice; label: string; hint: string };
  const groups: { label?: string; items: Item[] }[] = [
    { items: [{ choice: "cracked", label: "Cracked name", hint: "Offline-mode servers, no sign-in" }] },
    {
      label: "Microsoft",
      items: [
        { choice: "device", label: "Sign in with browser", hint: "Opens the Microsoft sign-in page" },
        { choice: "clipboard", label: "Copy sign-in link", hint: "Finish in any browser" },
        { choice: "webview", label: "Sign-in window", hint: "Signs in inside the client" },
        { choice: "credentials", label: "Email and password", hint: "Signs in without a browser" },
      ],
    },
    {
      label: "Tokens",
      items: [
        { choice: "session", label: "Session token", hint: "Access or refresh token" },
        { choice: "altening", label: "The Altening token", hint: "A token from The Altening" },
        { choice: "generate", label: "Generate with The Altening", hint: "Uses your API key" },
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
          <span class="grow"><span class="label">{item.label}</span><span>{item.hint}</span></span>
        </button>
      {/each}
    {/each}
  {/snippet}
</PopoverMenu>
