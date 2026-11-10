<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { keepEscape } from "../escape.svelte";
  import { rise } from "../motion";

  // A two-button question. Esc cancels; Tab and the arrow keys stay inside the two buttons. Anchored ones float above
  // their trigger and close on a press outside (the trigger excluded, so it can close them itself); a modal one sits
  // centered over its window on a scrim.
  let {
    title,
    text,
    action,
    actionLabel,
    tone = "danger",
    initialFocus = "action",
    placement = "center",
    width = 280,
    anchor,
    onconfirm,
    oncancel,
  }: {
    title: string;
    text?: string;
    action: string;
    actionLabel?: string;
    /** primary: the accent fill; danger: red text on the neutral fill; destructive: a red fill, for what can't be undone. */
    tone?: "primary" | "danger" | "destructive";
    initialFocus?: "action" | "cancel";
    /** center and end float above the anchor's middle or right edge; modal covers the window. */
    placement?: "center" | "end" | "modal";
    width?: number;
    anchor?: HTMLElement;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();
  keepEscape(() => true);

  const id = $props.id();
  let cancelButton: HTMLButtonElement | undefined;
  let actionButton: HTMLButtonElement | undefined;
  let panel: HTMLElement | undefined;

  onMount(() => (initialFocus === "cancel" ? cancelButton : actionButton)?.focus());

  function onKey(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      oncancel();
    } else if (["ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
      event.preventDefault();
      (document.activeElement === cancelButton ? actionButton : cancelButton)?.focus();
    }
  }

  // Esc also cancels while focus sits outside, e.g. back on the trigger after a click
  function onWindowKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    oncancel();
  }

  function onPointer(event: PointerEvent) {
    const target = event.target as Node;
    if (placement !== "modal" && panel && !panel.contains(target) && !anchor?.contains(target)) oncancel();
  }
</script>

<svelte:window onpointerdown={onPointer} onkeydown={onWindowKey} />

{#snippet dialog()}
  <div
    class="panel glass deep layered on-glass {placement}"
    style:width="{width}px"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="{id}-title"
    aria-describedby={text ? `${id}-text` : undefined}
    tabindex="-1"
    bind:this={panel}
    onkeydown={onKey}
    in:rise={placement === "modal" ? { duration: 260, y: 6, scale: 0.97 } : { duration: 240, y: 6, scale: 0.96 }}
  >
    <h2 id="{id}-title" class="t-headline">{title}</h2>
    {#if text}<p id="{id}-text" class="t-callout l2">{text}</p>{/if}
    <div class="actions">
      <button class="btn" bind:this={cancelButton} onclick={oncancel}>Cancel</button>
      <button class="btn {tone}" bind:this={actionButton} aria-label={actionLabel} onclick={onconfirm}>{action}</button>
    </div>
  </div>
{/snippet}

{#if placement === "modal"}
  <div class="scrim" role="presentation" transition:fade={{ duration: 140 }} onpointerdown={(e) => e.target === e.currentTarget && oncancel()}>
    {@render dialog()}
  </div>
{:else}
  {@render dialog()}
{/if}

<style>
  .scrim { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; background: rgb(10 12 16 / 0.32); }
  .panel { padding: 14px; border-radius: var(--r-card); outline: none; text-align: center; }
  .panel.modal { padding: 16px; }
  .panel.center, .panel.end { position: absolute; bottom: calc(100% + 8px); z-index: 3; }
  .panel.center { left: 50%; translate: -50% 0; }
  .panel.end { right: 0; text-align: left; }
  h2 { overflow-wrap: anywhere; }
  p { margin-top: 4px; overflow-wrap: anywhere; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .modal .actions { margin-top: 14px; }
  .btn {
    height: 28px; border-radius: 14px; font-size: 13px; font-weight: 500; color: var(--label);
    background: var(--fill-2); transition: transform var(--t-press) var(--ease), background-color var(--t-hover) ease;
  }
  .modal .btn { height: 30px; border-radius: 15px; }
  .btn:hover { background: var(--fill-3); }
  .btn:active { transform: scale(0.98); }
  .btn.primary { color: #fff; background: var(--accent-fill); font-weight: 600; }
  .btn.primary:hover { background: var(--accent-strong); }
  /* Destructive, but not a second accent: red text on the neutral fill, as system alerts do */
  .btn.danger { color: #ffa29e; font-weight: 600; }
  :global(:root.contrast-more) .btn.danger { color: #ffb3b5; }
  .btn.destructive { color: #fff; background: #d93a40; font-weight: 600; }
  .btn.destructive:hover { background: #c4323a; }
</style>
