<script lang="ts">
  import { onMount } from "svelte";
  import { ApiError } from "../../lib/api/client";
  import type { ResourcePackPolicy, ServerAddRequest } from "../../lib/api/types";
  import { rise } from "../../lib/motion";
  import { play } from "../../lib/sound";
  import Segmented from "../../lib/ui/Segmented.svelte";
  import { addressProblem } from "./servers";

  // Add and edit share one sheet. The address is checked here first: the client rejects bad addresses on add (403)
  // but stores anything on edit.
  let {
    editing,
    initial,
    save,
    oncancel,
  }: {
    /** Name of the server being edited; undefined adds a new one. */
    editing?: string;
    initial: ServerAddRequest;
    save: (request: ServerAddRequest) => Promise<void>;
    oncancel: () => void;
  } = $props();

  const DEFAULT_NAME = "Minecraft Server";
  const POLICIES: ResourcePackPolicy[] = ["Prompt", "Enabled", "Disabled"];

  // svelte-ignore state_referenced_locally
  let name = $state(initial.name);
  // svelte-ignore state_referenced_locally
  let address = $state(initial.address);
  // svelte-ignore state_referenced_locally
  let policy = $state<ResourcePackPolicy>(initial.resourcePackPolicy ?? "Prompt");
  let addressError = $state<string | undefined>();
  let formError = $state<string | undefined>();
  let saving = $state(false);
  let touched = $state(false);

  let panel: HTMLDivElement | undefined;
  let nameInput: HTMLInputElement | undefined;
  let addressInput: HTMLInputElement | undefined;

  onMount(() => (editing ? addressInput : nameInput)?.focus());

  // Once the field was left or submitted, the message follows the typing
  $effect(() => {
    if (touched) addressError = addressProblem(address);
  });

  async function submit() {
    if (saving) return;
    touched = true;
    addressError = addressProblem(address);
    formError = undefined;
    if (addressError) {
      play("error");
      addressInput?.focus();
      return;
    }
    saving = true;
    try {
      await save({ name: name.trim() || DEFAULT_NAME, address: address.trim(), resourcePackPolicy: policy });
    } catch (error) {
      play("error");
      if (error instanceof ApiError && error.status === 403) {
        addressError = "The client did not accept this address. Check the host name and port.";
        addressInput?.focus();
      } else {
        formError = editing ? "The server could not be saved. Try again." : "The server could not be added. Try again.";
      }
    } finally {
      saving = false;
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      oncancel();
      return;
    }
    // Segmented's buttons sit inside, so this is not a <form>: Enter in a field saves
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key !== "Tab" || !panel) return;
    // Focus stays inside the sheet while it is open
    const items = [...panel.querySelectorAll<HTMLElement>("input, button:not([disabled]):not([tabindex='-1']), [tabindex='0']")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
    event.preventDefault();
    items[next]?.focus();
  }
</script>

<div class="scrim" aria-hidden="true"></div>
<div
  class="sheet glass deep on-glass"
  role="dialog"
  aria-modal="true"
  aria-labelledby="sheet-title"
  bind:this={panel}
  tabindex="-1"
  onkeydown={onKey}
  in:rise={{ duration: 320, y: -10, scale: 0.98 }}
>
  <h2 id="sheet-title" class="t-title3">{editing ? `Edit ${editing}` : "Add server"}</h2>

  <div class="fields">
    <label class="field">
      <span class="t-footnote l2">Name</span>
      <input class="input" bind:this={nameInput} bind:value={name} placeholder={DEFAULT_NAME} spellcheck="false" maxlength="128" />
    </label>
    <label class="field">
      <span class="t-footnote l2">Address</span>
      <input
        class="input num"
        class:invalid={addressError}
        bind:this={addressInput}
        bind:value={address}
        onblur={() => address && (touched = true)}
        placeholder="play.example.net"
        spellcheck="false"
        autocomplete="off"
        aria-invalid={addressError ? "true" : undefined}
        aria-describedby={addressError ? "address-error" : "address-hint"}
      />
      {#if addressError}
        <span id="address-error" class="t-footnote problem" role="alert"><span aria-hidden="true">!</span> {addressError}</span>
      {:else}
        <span id="address-hint" class="t-footnote l2">Host name or IP, with an optional port like :25565</span>
      {/if}
    </label>
    <div class="field">
      <span class="t-footnote l2" aria-hidden="true">Server resource packs</span>
      <Segmented options={POLICIES} value={policy} label="Server resource packs" onchange={(value) => (policy = value as ResourcePackPolicy)} />
    </div>
  </div>

  {#if formError}<p class="t-footnote problem" role="alert">{formError}</p>{/if}

  <div class="actions">
    <button type="button" class="btn" onclick={oncancel}>Cancel</button>
    <button type="button" class="btn primary" disabled={saving} onclick={submit}>{saving ? "Saving" : editing ? "Save" : "Add server"}</button>
  </div>
</div>

<style>
  .scrim { position: absolute; inset: 0; z-index: 4; background: rgb(10 12 16 / 0.32); border-radius: var(--r-window); }
  .sheet {
    position: absolute;
    z-index: 5;
    top: 96px;
    left: 50%;
    translate: -50% 0;
    width: 440px;
    padding: 24px;
    border-radius: var(--r-pane);
    display: grid;
    gap: 18px;
  }
  .fields { display: grid; gap: 16px; }
  .field { display: grid; gap: 6px; justify-items: start; }
  .input {
    width: 100%;
    height: 40px;
    padding: 0 14px;
    border-radius: 10px;
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--line);
    font-size: 14px;
  }
  .input:focus { box-shadow: inset 0 0 0 0.5px var(--line), 0 0 0 2px var(--accent); }
  .input::placeholder { color: var(--label-3); }
  .input.invalid { box-shadow: inset 0 0 0 1px #ff9a96; }
  .input.invalid:focus { box-shadow: inset 0 0 0 1px #ff9a96, 0 0 0 2px var(--accent); }
  .problem { color: #ffb4b0; }
  .problem span { font-weight: 700; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn {
    height: 34px; padding: 0 18px; border-radius: 17px; font-size: 14px; font-weight: 500; background: var(--fill-2);
    transition: transform var(--t-press) var(--ease), background-color var(--t-pop) var(--ease);
  }
  .btn:hover { background: var(--fill-3); }
  .btn:active { transform: scale(0.98); }
  .btn.primary { color: #fff; background: var(--accent-fill); font-weight: 600; }
  .btn.primary:hover { background: var(--accent-strong); }
  .btn:disabled { opacity: 0.6; }
</style>
