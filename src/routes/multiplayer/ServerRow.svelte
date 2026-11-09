<script lang="ts">
  import type { ServerData } from "../../lib/api/types";
  import { plainText } from "../../lib/mctext";
  import McText from "./McText.svelte";
  import { formatCount, hasAnswer, statusOf } from "./servers";
  import ServerIcon from "./ServerIcon.svelte";

  let {
    server,
    id,
    selected,
    focusable,
    onselect,
    onjoin,
    onkeydown,
  }: {
    server: ServerData;
    id: number;
    selected: boolean;
    focusable: boolean;
    onselect: () => void;
    onjoin: () => void;
    onkeydown: (event: KeyboardEvent) => void;
  } = $props();

  const status = $derived(statusOf(server));
  const online = $derived(server.players.online);
  const max = $derived(server.players.max);
  const motd = $derived(hasAnswer(server) ? server.label : undefined);
  const hasMotd = $derived(motd !== undefined && plainText(motd) !== "");

  const accessibleName = $derived.by(() => {
    const parts = [server.name, status.word];
    if (online !== undefined) parts.push(max !== undefined ? `${online} of ${max} players` : `${online} players`);
    if (status.ping !== undefined) parts.push(`ping ${status.ping} ms`);
    parts.push(server.address);
    return parts.join(", ");
  });
</script>

<div
  class="row"
  class:selected
  role="option"
  tabindex={focusable ? 0 : -1}
  aria-selected={selected}
  aria-label={accessibleName}
  data-server={id}
  onclick={onselect}
  ondblclick={onjoin}
  {onkeydown}
>
  <ServerIcon icon={server.icon} />
  <div class="main">
    <span class="name">{server.name}</span>
    <span class="motd">
      {#if hasMotd}<McText text={motd} max={1} />{:else}<span class="address num">{server.address}</span>{/if}
    </span>
  </div>
  <div class="players num" aria-hidden="true">
    {#if online !== undefined}
      <span class="value">{formatCount(online)}</span>
      {#if max !== undefined}<span class="sub">of {formatCount(max)}</span>{/if}
    {/if}
  </div>
  <div class="status num" aria-hidden="true">
    <span class="value"><span class="dot {status.health}"></span>{status.word}</span>
    {#if status.ping !== undefined}<span class="sub">{status.ping} ms</span>{/if}
  </div>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 96px 104px;
    align-items: center;
    column-gap: 12px;
    /* Name plus one MOTD line; every row keeps this height whether or not its server has answered */
    height: 40px;
    padding: 3px 12px 3px 4px;
    border-radius: var(--r-group);
    outline: none;
    transition: background-color var(--t-hover) ease;
  }
  .row:hover { background: var(--fill); }
  .row.selected { background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.75); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* One column as wide as the cell: a nowrap MOTD line must not widen it past the name */
  .main { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
  .name { font-size: 13px; line-height: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .motd { font-size: 12px; line-height: 16px; color: rgb(255 255 255 / 0.8); min-height: 16px; }
  .address { color: var(--label-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
  .players, .status { display: grid; justify-items: end; text-align: right; }
  .status { justify-items: start; text-align: left; }
  .value { font-size: 13px; line-height: 18px; font-weight: 500; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
  .sub { font-size: 12px; line-height: 16px; color: var(--label-2); white-space: nowrap; }
  .status .sub { padding-left: 15px; }
  .dot { width: 8px; height: 8px; border-radius: 4px; flex: none; }
  .dot.good { background: var(--positive); }
  .dot.fair { background: #f6cf72; }
  .dot.poor, .dot.down { background: var(--negative); }
  .dot.waiting { box-shadow: inset 0 0 0 1.5px var(--label-3); }
</style>
