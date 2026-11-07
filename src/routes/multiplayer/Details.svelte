<script lang="ts">
  import type { ServerData } from "../../lib/api/types";
  import { plainText } from "../../lib/mctext";
  import ConfirmPopover from "../../lib/ui/ConfirmPopover.svelte";
  import McText from "./McText.svelte";
  import { formatCount, hasAnswer, statusOf } from "./servers";
  import ServerIcon from "./ServerIcon.svelte";

  // The selected server: what it reports, then Join and the edits. LAN servers can only be joined.
  let {
    server,
    lan,
    joining,
    joinError,
    confirming,
    canMoveUp,
    canMoveDown,
    moveHint,
    onjoin,
    onedit,
    onaskremove,
    onremove,
    oncancelremove,
    onmove,
  }: {
    server: ServerData;
    lan: boolean;
    joining: boolean;
    joinError?: string;
    confirming: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    moveHint?: string;
    onjoin: () => void;
    onedit: () => void;
    onaskremove: () => void;
    onremove: () => void;
    oncancelremove: () => void;
    onmove: (step: -1 | 1) => void;
  } = $props();

  let removeButton: HTMLButtonElement | undefined = $state();

  const status = $derived(statusOf(server));
  const known = $derived(hasAnswer(server) && server.status !== "UNREACHABLE");
  const online = $derived(server.players.online);
  const max = $derived(server.players.max);
  const motd = $derived(hasAnswer(server) ? server.label : undefined);
  const hasMotd = $derived(motd !== undefined && plainText(motd) !== "");
  const version = $derived(known ? plainText(server.version) : "");
  const sample = $derived((server.playerList ?? []).filter((line) => plainText(line) !== ""));
  const policyWord: Record<string, string> = { Prompt: "Ask each time", Enabled: "Always accept", Disabled: "Never accept" };
</script>

<div class="details on-glass">
  <header class="top">
    <ServerIcon icon={server.icon} />
    <div class="grow">
      <h2 class="t-title2" title={server.name}>{server.name}</h2>
      <p class="t-callout l2 num address">{server.address}</p>
    </div>
  </header>

  <div class="join">
    <button class="primary" onclick={onjoin} disabled={joining} aria-keyshortcuts="Enter">
      {joining ? "Connecting" : "Join server"}
    </button>
    {#if joinError}<p class="t-footnote problem" role="alert">{joinError}</p>{/if}
  </div>

  <div class="scroll">
    <div class="cg-group">
      <div class="cg-row">
        <span class="cg-label">Status</span>
        <span class="cg-val state"><span class="dot {status.health}" aria-hidden="true"></span>{status.word}</span>
      </div>
      {#if status.ping !== undefined}
        <div class="cg-row"><span class="cg-label">Ping</span><span class="cg-val">{status.ping} ms</span></div>
      {/if}
      {#if online !== undefined}
        <div class="cg-row">
          <span class="cg-label">Players</span>
          <span class="cg-val">{max !== undefined ? `${formatCount(online)} of ${formatCount(max)}` : formatCount(online)}</span>
        </div>
      {/if}
      {#if version}
        <div class="cg-row">
          <span class="cg-label">Version</span>
          <span class="cg-val version" title={version}>{version}</span>
        </div>
      {/if}
      {#if !lan}
        <div class="cg-row">
          <span class="cg-label">Resource packs</span>
          <span class="cg-val">{policyWord[server.resourcePackPolicy] ?? server.resourcePackPolicy}</span>
        </div>
      {/if}
    </div>
    {#if server.status === "INCOMPATIBLE"}
      <p class="t-footnote l2 note">This server runs a different Minecraft version. Pick its protocol before joining.</p>
    {/if}

    {#if hasMotd}
      <section aria-label="Message of the day">
        <h3 class="t-footnote l2">Message of the day</h3>
        <div class="group block t-callout"><McText text={motd} /></div>
      </section>
    {/if}

    {#if sample.length}
      <section aria-label="Player list from the server">
        <h3 class="t-footnote l2">Player list</h3>
        <div class="group block t-callout num">
          {#each sample as line, index (index)}<McText text={line} />{/each}
        </div>
      </section>
    {/if}
  </div>

  {#if !lan}
    <div class="actions">
      <div class="move" role="group" aria-label="Order">
        <button class="cg-pill" onclick={() => onmove(-1)} disabled={!canMoveUp} aria-label="Move {server.name} up" aria-keyshortcuts="Alt+ArrowUp" title={moveHint}>
          <span aria-hidden="true">↑</span> Up
        </button>
        <button class="cg-pill" onclick={() => onmove(1)} disabled={!canMoveDown} aria-label="Move {server.name} down" aria-keyshortcuts="Alt+ArrowDown" title={moveHint}>
          <span aria-hidden="true">↓</span> Down
        </button>
      </div>
      <div class="edit">
        <button class="cg-pill" onclick={onedit} aria-label="Edit {server.name}" aria-keyshortcuts="E">Edit</button>
        <div class="anchor">
          <button
            class="cg-pill remove"
            bind:this={removeButton}
            onclick={onaskremove}
            aria-label="Remove {server.name}"
            aria-haspopup="dialog"
            aria-expanded={confirming}
            aria-keyshortcuts="Delete">Remove</button
          >
          {#if confirming}
            <ConfirmPopover
              title="Remove {server.name}?"
              text="It leaves your server list. You can add it again later."
              action="Remove"
              placement="end"
              anchor={removeButton}
              onconfirm={onremove}
              oncancel={oncancelremove}
            />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .details { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 12px; padding: 16px 16px 12px; }
  .grow { flex: 1; min-width: 0; }
  .address { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h2 { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .join { padding: 0 16px 12px; display: grid; gap: 6px; }
  .primary {
    height: 30px; border-radius: 15px; color: #fff; background: var(--accent-fill); font-size: 13px; font-weight: 600;
    transition: transform var(--t-press) var(--ease), background-color var(--t-pop) var(--ease);
  }
  .primary:hover { background: var(--accent-strong); }
  .primary:active { transform: scale(0.98); }
  .primary:disabled { opacity: 0.7; }
  .problem { color: #ffb4b0; padding: 0 4px; }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 16px 16px;
    scrollbar-width: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 12px;
    mask-image: linear-gradient(180deg, transparent 0, #000 8px, #000 calc(100% - 24px), transparent);
  }
  .state { display: inline-flex; align-items: center; gap: 7px; color: var(--label); }
  .version { max-width: 60%; overflow: hidden; text-overflow: ellipsis; }
  .note { margin: -6px 4px 0; }
  section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  h3 { padding: 0 4px; font-weight: 500; }
  .block { padding: 8px 12px; color: rgb(255 255 255 / 0.85); }
  /* The pane shows the whole message; the row keeps one ellipsized line */
  .block > :global(.line) { white-space: normal; overflow-wrap: anywhere; }
  .block > :global(.line + .line) { margin-top: 2px; }
  .dot { width: 8px; height: 8px; border-radius: 4px; flex: none; }
  .dot.good { background: var(--positive); }
  .dot.fair { background: #f6cf72; }
  .dot.poor, .dot.down { background: var(--negative); }
  .dot.waiting { box-shadow: inset 0 0 0 1.5px var(--label-3); }
  .actions {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px 12px;
    border-top: 0.5px solid var(--line);
  }
  .move, .edit { display: flex; gap: 6px; }
  .anchor { position: relative; }
  .cg-pill:disabled { opacity: 0.45; }
  .remove { color: #ffa29e; }
</style>
