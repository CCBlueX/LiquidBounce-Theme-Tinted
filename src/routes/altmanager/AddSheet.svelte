<script lang="ts" module>
  export type Flow = "cracked" | "microsoft" | "credentials" | "session" | "altening" | "generate";
  export type SheetAction =
    | "addCracked"
    | "loginCracked"
    | "device"
    | "clipboard"
    | "webview"
    | "credentials"
    | "addSession"
    | "loginSession"
    | "altening"
    | "generate";
  export type Note = { tone: "progress" | "error" | "done"; title: string; text: string };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import Switch from "../../lib/ui/Switch.svelte";

  // One form per way of adding an account. Secrets (password, tokens, API key) live in the inputs only until they are
  // sent, then the fields are cleared; nothing secret is echoed into notes, labels or the status line.
  let {
    flow,
    busy,
    note,
    onrun,
    onrandom,
    onflow,
    onclose,
  }: {
    flow: Flow;
    busy: boolean;
    note: Note | undefined;
    onrun: (action: SheetAction, body?: Record<string, unknown>) => void;
    onrandom: () => Promise<string | undefined>;
    onflow: (flow: Flow) => void;
    onclose: () => void;
  } = $props();

  const HEADS: Record<Flow, { title: string; text: string }> = {
    cracked: { title: "Cracked account", text: "A name without sign-in. Joins offline-mode servers only." },
    microsoft: { title: "Microsoft account", text: "Sign in with Microsoft to join any server." },
    credentials: { title: "Email and password", text: "Signs in to Microsoft without opening a browser." },
    session: { title: "Session token", text: "Adds the account a Minecraft access or refresh token belongs to." },
    altening: { title: "The Altening token", text: "Adds the account behind a token from The Altening." },
    generate: { title: "Generate with The Altening", text: "Creates an account with your The Altening API key." },
  };
  const head = $derived(HEADS[flow]);

  let username = $state("");
  let online = $state(false);
  let email = $state("");
  let password = $state("");
  let token = $state("");
  let randomBusy = $state(false);
  let body = $state<HTMLElement>();

  const tooLong = $derived(username.length > 16);
  const oddChars = $derived(/[^A-Za-z0-9_]/.test(username));

  onMount(() => {
    body?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus();
  });

  // A finished add clears the form for the next one
  $effect(() => {
    if (note?.tone === "done") {
      username = "";
      email = "";
    }
  });

  function send(action: SheetAction, payload?: Record<string, unknown>) {
    if (busy) return;
    onrun(action, payload);
    password = "";
    token = "";
  }

  async function random() {
    randomBusy = true;
    const name = await onrandom();
    randomBusy = false;
    if (name) username = name;
  }

  function submitOnEnter(action: () => void) {
    return (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        action();
      }
    };
  }

  // Enter in a field submits only what the visible button would
  const addCracked = () => username.trim() && !tooLong && send("addCracked", { username: username.trim(), online });
  const addCredentials = () => email.trim() && password && send("credentials", { email: email.trim(), password });
  const addSession = () => token.trim() && send("addSession", { token: token.trim() });
  const addAltening = () => token.trim() && send("altening", { token: token.trim() });
  const generate = () => token.trim() && send("generate", { apiToken: token.trim() });
</script>

<div class="mg-sheet-head on-glass">
  <div class="grow">
    <h2 class="t-title3" id="mg-sheet-title">{head.title}</h2>
    <p class="t-callout l2">{head.text}</p>
  </div>
  <button class="mg-close" aria-label="Close {head.title.toLowerCase()} form" onclick={onclose}>×</button>
</div>

<div class="mg-sheet-body on-glass" bind:this={body}>
  {#if flow === "cracked"}
    <label class="mg-field">
      <span class="label"><span>Username</span><span class="num" aria-hidden="true">{username.length} of 16</span></span>
      <span class="mg-input-row">
        <input
          class="mg-input"
          bind:value={username}
          maxlength="16"
          spellcheck="false"
          autocomplete="off"
          aria-label="Cracked username, up to 16 characters"
          aria-invalid={tooLong}
          aria-describedby="mg-cracked-hint"
          onkeydown={submitOnEnter(addCracked)}
        />
        <button class="mg-pill large" aria-label="Fill in a random name" disabled={randomBusy} onclick={random}>Random</button>
      </span>
      <span class="hint" id="mg-cracked-hint">
        {oddChars ? "Most servers only accept letters, numbers and underscores." : "Letters, numbers and underscores."}
      </span>
    </label>
    <div class="group mg-option">
      <div class="grow">
        <div>Premium UUID</div>
        <div>Looks up the real player with this name so their skin shows.</div>
      </div>
      <Switch checked={online} label="Premium UUID" onchange={(value) => (online = value)} />
    </div>
  {:else if flow === "microsoft"}
    <div class="group mg-options">
      <button class="mg-item mg-option" disabled={busy} onclick={() => send("device")}>
        <span class="grow"><span class="label">Sign in with browser</span><span>Opens the Microsoft sign-in page in your browser.</span></span>
      </button>
      <button class="mg-item mg-option" onclick={() => send("clipboard")}>
        <span class="grow"><span class="label">Copy sign-in link</span><span>Puts the sign-in link on your clipboard.</span></span>
      </button>
      <button class="mg-item mg-option" disabled={busy} onclick={() => send("webview")}>
        <span class="grow"><span class="label">Sign-in window</span><span>Signs in inside a client window.</span></span>
      </button>
    </div>
    <button class="mg-pill quiet" style:align-self="flex-start" onclick={() => onflow("credentials")}>Use email and password instead ›</button>
  {:else if flow === "credentials"}
    <label class="mg-field">
      <span class="label">Email</span>
      <input class="mg-input" type="email" bind:value={email} spellcheck="false" autocomplete="off" aria-label="Microsoft email" />
    </label>
    <label class="mg-field">
      <span class="label">Password</span>
      <input class="mg-input" type="password" bind:value={password} autocomplete="off" aria-label="Password" onkeydown={submitOnEnter(addCredentials)} />
    </label>
  {:else}
    <label class="mg-field">
      <span class="label">{flow === "generate" ? "API key" : "Token"}</span>
      <input
        class="mg-input"
        type="password"
        bind:value={token}
        autocomplete="off"
        spellcheck="false"
        aria-label={flow === "generate" ? "The Altening API key" : flow === "session" ? "Session token" : "The Altening token"}
        aria-describedby="mg-token-hint"
        onkeydown={submitOnEnter(flow === "session" ? addSession : flow === "altening" ? addAltening : generate)}
      />
      <span class="hint" id="mg-token-hint">
        {flow === "session"
          ? "An access token, or a Microsoft refresh token that starts with M."
          : flow === "generate"
            ? "Find it in your The Altening dashboard. It is sent to the client only."
            : "Tokens are sent to the client only and never shown again."}
      </span>
    </label>
  {/if}

  {#if note}
    <div class="group mg-note" class:mg-pulse={note.tone === "progress"}>
      <div>
        <div class="title" class:mg-error-text={note.tone === "error"}>{note.title}</div>
        <div class="text">{note.text}</div>
      </div>
    </div>
  {/if}
</div>

{#if flow !== "microsoft"}
  <div class="mg-sheet-foot">
    {#if flow === "cracked"}
      <button class="mg-pill large" disabled={busy || !username.trim() || tooLong} onclick={() => send("loginCracked", { username: username.trim(), online })}>
        Log in without saving
      </button>
      <button class="mg-pill primary large" disabled={busy || !username.trim() || tooLong} onclick={addCracked}>Add account</button>
    {:else if flow === "credentials"}
      <button class="mg-pill primary large" disabled={busy || !email.trim() || !password} onclick={addCredentials}>Add account</button>
    {:else if flow === "session"}
      <button class="mg-pill large" disabled={busy || !token.trim()} onclick={() => send("loginSession", { token: token.trim() })}>Log in without saving</button>
      <button class="mg-pill primary large" disabled={busy || !token.trim()} onclick={addSession}>Add account</button>
    {:else if flow === "altening"}
      <button class="mg-pill primary large" disabled={busy || !token.trim()} onclick={addAltening}>Add account</button>
    {:else}
      <button class="mg-pill primary large" disabled={busy || !token.trim()} onclick={generate}>Generate account</button>
    {/if}
  </div>
{/if}
