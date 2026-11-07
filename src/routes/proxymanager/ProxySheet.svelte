<script lang="ts" module>
  import type { ProxyType } from "../../lib/api/types";

  /** A proxy as the page keeps it: the password is never stored, only whether one is set. */
  export type ProxyRow = {
    id: number;
    host: string;
    port: number;
    type: ProxyType;
    username: string;
    hasPassword: boolean;
    favorite: boolean;
    forwardAuthentication: boolean;
    proxyResourcePacks: boolean;
    proxyDns: boolean;
  };

  /** `password` is null when an edit keeps the stored one. */
  export type ProxyForm = Omit<ProxyRow, "id" | "hasPassword" | "favorite"> & { password: string | null };
  export type FieldErrors = Partial<Record<"host" | "port" | "credentials" | "form", string>>;
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import ItemIcon from "../../lib/ui/ItemIcon.svelte";
  import Segmented from "../../lib/ui/Segmented.svelte";
  import Switch from "../../lib/ui/Switch.svelte";

  let {
    editing,
    busy,
    errors,
    progress,
    onsubmit,
    onclose,
  }: {
    editing: ProxyRow | undefined;
    busy: boolean;
    errors: FieldErrors;
    progress: string;
    onsubmit: (form: ProxyForm) => void;
    onclose: () => void;
  } = $props();

  // The form starts from the row being edited, once; later list refreshes must not overwrite what is being typed
  // svelte-ignore state_referenced_locally
  const start = editing;
  let host = $state(start?.host ?? "");
  let port = $state(start ? String(start.port) : "");
  let type = $state<ProxyType>(start?.type ?? "SOCKS5");
  let username = $state(start?.username ?? "");
  let password = $state("");
  let forwardAuthentication = $state(start?.forwardAuthentication ?? false);
  let proxyResourcePacks = $state(start?.proxyResourcePacks ?? false);
  let proxyDns = $state(start?.proxyDns ?? false);
  let local = $state<FieldErrors>({});
  let hostInput = $state<HTMLInputElement>();

  // A kept password only stays with the same username
  const keepsPassword = $derived(!!start?.hasPassword && password === "" && username.trim() === start.username);
  const shown = $derived({ ...errors, ...local });

  onMount(() => hostInput?.focus());

  // "host:port" typed or pasted into the host field fills both
  function splitHost() {
    const match = /^(.+):(\d{1,5})$/.exec(host.trim());
    if (match && !port) {
      host = match[1];
      port = match[2];
    }
  }

  function submit() {
    if (busy) return;
    splitHost();
    const next: FieldErrors = {};
    const portNumber = Number(port);
    if (!host.trim()) next.host = "Enter a host.";
    if (port.trim() === "" || !Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) next.port = "Ports go from 0 to 65535.";
    const user = username.trim();
    if (user && !password && !keepsPassword) next.credentials = "Enter the password for this username, or clear the username.";
    if (!user && password) next.credentials = "Enter the username for this password, or clear the password.";
    local = next;
    if (Object.keys(next).length) return;
    onsubmit({
      host: host.trim(),
      port: portNumber,
      type,
      username: user,
      password: keepsPassword ? null : password,
      forwardAuthentication,
      proxyResourcePacks,
      proxyDns,
    });
    password = "";
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }
</script>

<div class="mg-sheet-head on-glass">
  <ItemIcon id="minecraft:ender_pearl" size={32} />
  <div class="grow">
    <h2 class="t-title3" id="mg-sheet-title">{start ? "Edit proxy" : "Add proxy"}</h2>
    <p class="t-callout l2">{start ? `${start.host}:${start.port}` : "LiquidBounce checks it before saving."}</p>
  </div>
  <button class="mg-close" aria-label="Close {start ? 'edit' : 'add'} proxy form" onclick={onclose}>×</button>
</div>

<div class="mg-sheet-body on-glass">
  <div class="mg-input-row">
    <label class="mg-field" style:flex="1">
      <span class="label">Host</span>
      <input
        class="mg-input"
        bind:this={hostInput}
        bind:value={host}
        spellcheck="false"
        autocomplete="off"
        aria-label="Proxy host"
        aria-invalid={!!shown.host}
        aria-describedby={shown.host ? "mg-host-error" : undefined}
        onblur={splitHost}
        onkeydown={onEnter}
      />
    </label>
    <label class="mg-field port">
      <span class="label">Port</span>
      <input
        class="mg-input num"
        type="number"
        min="0"
        max="65535"
        bind:value={port}
        aria-label="Proxy port, 0 to 65535"
        aria-invalid={!!shown.port}
        aria-describedby={shown.port ? "mg-port-error" : undefined}
        onkeydown={onEnter}
      />
    </label>
  </div>
  {#if shown.host || shown.port || port === "0"}
    <div class="hints">
      {#if shown.host}<p class="mg-error-text" id="mg-host-error">{shown.host}</p>{/if}
      {#if shown.port}<p class="mg-error-text" id="mg-port-error">{shown.port}</p>{/if}
      {#if port === "0" && !shown.port}<p class="l2">Port 0 is saved but never used for connections.</p>{/if}
    </div>
  {/if}

  <div class="mg-field">
    <span class="label">Type</span>
    <div class="segment"><Segmented options={["SOCKS5", "HTTP"]} value={type} label="Proxy type" onchange={(value) => (type = value as ProxyType)} /></div>
  </div>

  <div class="mg-input-row">
    <label class="mg-field" style:flex="1">
      <span class="label">Username</span>
      <input class="mg-input" bind:value={username} spellcheck="false" autocomplete="off" aria-label="Proxy username, optional" onkeydown={onEnter} />
    </label>
    <label class="mg-field" style:flex="1">
      <span class="label">Password</span>
      <input
        class="mg-input"
        type="password"
        bind:value={password}
        autocomplete="new-password"
        placeholder={keepsPassword ? "Unchanged" : "Optional"}
        aria-label="Password, optional, must be paired with username"
        aria-invalid={!!shown.credentials}
        aria-describedby="mg-cred-hint"
        onkeydown={onEnter}
      />
    </label>
  </div>
  <p class="hint t-footnote" class:mg-error-text={!!shown.credentials} id="mg-cred-hint">
    {shown.credentials ?? (start?.hasPassword ? "Leave the password empty to keep the saved one." : "Both or neither: a username needs its password.")}
  </p>

  <div class="group mg-options">
    <div class="mg-option">
      <div class="grow"><div>Forward Microsoft sign-in</div><div>Sends Microsoft authentication over the proxy as well.</div></div>
      <Switch checked={forwardAuthentication} label="Forward Microsoft sign-in" onchange={(value) => (forwardAuthentication = value)} />
    </div>
    <div class="mg-option">
      <div class="grow"><div>Resource packs through the proxy</div><div>Server resource packs download over it.</div></div>
      <Switch checked={proxyResourcePacks} label="Resource packs through the proxy" onchange={(value) => (proxyResourcePacks = value)} />
    </div>
    <div class="mg-option">
      <div class="grow"><div>Server lookups through the proxy</div><div>Server addresses are looked up by the proxy.</div></div>
      <Switch checked={proxyDns} label="Server lookups through the proxy" onchange={(value) => (proxyDns = value)} />
    </div>
  </div>

  {#if busy || shown.form}
    <div class="group mg-note" class:mg-pulse={busy}>
      <div>
        <div class="title" class:mg-error-text={!busy}>{busy ? progress : start ? "Couldn't save the proxy" : "Couldn't add the proxy"}</div>
        <div class="text">{busy ? "The proxy is checked before it is saved. This takes a few seconds." : shown.form}</div>
      </div>
    </div>
  {/if}
</div>

<div class="mg-sheet-foot">
  <button class="mg-pill large" onclick={onclose}>Cancel</button>
  <button class="mg-pill primary large" disabled={busy} onclick={submit}>{start ? "Save" : "Add proxy"}</button>
</div>

<style>
  .port { width: 108px; flex: none; }
  .segment { justify-self: start; }
  .hints { display: grid; gap: 2px; margin-top: -8px; font-size: 12px; line-height: 16px; }
  .hint { margin-top: -8px; color: var(--label-2); }
  .hint.mg-error-text { color: #ff8a8e; }
</style>
