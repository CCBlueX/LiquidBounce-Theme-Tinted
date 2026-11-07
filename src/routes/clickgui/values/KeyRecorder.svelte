<script lang="ts">
  import { on } from "../../../lib/api/events";
  import { keyLabel } from "../../../lib/keys";
  import { play } from "../../../lib/sound";
  import Keycap from "../../../lib/ui/Keycap.svelte";

  // Shows a bound key as a keycap. Activating it listens for the next key or side mouse button; Esc unbinds.
  let {
    boundKey,
    label,
    emptyText = "Not bound",
    onchange,
  }: { boundKey: string; label: string; emptyText?: string; onchange: (key: string) => void } = $props();

  const UNBOUND = "key.keyboard.unknown";

  // KeyboardEvent.code to Minecraft's key names; letters, digits and F keys follow a pattern below
  const CODES: Record<string, string> = {
    ShiftLeft: "left.shift",
    ShiftRight: "right.shift",
    ControlLeft: "left.control",
    ControlRight: "right.control",
    AltLeft: "left.alt",
    AltRight: "right.alt",
    MetaLeft: "left.win",
    MetaRight: "right.win",
    Space: "space",
    Enter: "enter",
    Tab: "tab",
    Backspace: "backspace",
    Insert: "insert",
    Delete: "delete",
    Home: "home",
    End: "end",
    PageUp: "page.up",
    PageDown: "page.down",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    CapsLock: "caps.lock",
    NumLock: "num.lock",
    ScrollLock: "scroll.lock",
    PrintScreen: "print.screen",
    Pause: "pause",
    ContextMenu: "menu",
    Backquote: "grave.accent",
    Minus: "minus",
    Equal: "equal",
    BracketLeft: "left.bracket",
    BracketRight: "right.bracket",
    Backslash: "backslash",
    Semicolon: "semicolon",
    Quote: "apostrophe",
    Comma: "comma",
    Period: "period",
    Slash: "slash",
    IntlBackslash: "world.2",
    NumpadAdd: "keypad.add",
    NumpadSubtract: "keypad.subtract",
    NumpadMultiply: "keypad.multiply",
    NumpadDivide: "keypad.divide",
    NumpadDecimal: "keypad.decimal",
    NumpadEnter: "keypad.enter",
    NumpadEqual: "keypad.equal",
  };

  // Left and right click stay clicks; the middle and side buttons can be bound
  const MOUSE_BUTTONS: Record<number, string> = { 1: "key.mouse.middle", 3: "key.mouse.4", 4: "key.mouse.5" };

  function minecraftKey(code: string): string | undefined {
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return `key.keyboard.${letter[1].toLowerCase()}`;
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (digit) return `key.keyboard.${code.startsWith("Numpad") ? "keypad." : ""}${digit[1]}`;
    const fn = /^F(\d{1,2})$/.exec(code);
    if (fn) return `key.keyboard.f${fn[1]}`;
    return CODES[code] ? `key.keyboard.${CODES[code]}` : undefined;
  }

  let recording = $state(false);
  let fallback: number | undefined;

  const shown = $derived(keyLabel(boundKey));

  function finish(key: string) {
    clearTimeout(fallback);
    recording = false;
    play(key === UNBOUND ? "tap" : "confirm");
    if (key !== boundKey) onchange(key);
  }

  function start() {
    if (recording) return;
    recording = true;
    play("tap");
  }

  // Inside the game the browser may not know the physical key; the client's own key event names it exactly
  $effect(() => {
    if (!recording) return;
    return on("keyboardKey", (event) => {
      if (recording && event.action === 1) finish(event.key === "key.keyboard.escape" ? UNBOUND : event.key);
    });
  });

  function keydown(event: KeyboardEvent) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return finish(UNBOUND);
    const key = minecraftKey(event.code);
    if (key) return finish(key);
    // Unknown to the browser: give the client's keyboardKey event a moment, then give up
    clearTimeout(fallback);
    fallback = window.setTimeout(() => {
      if (!recording) return;
      recording = false;
      play("error");
    }, 250);
  }

  function pointerdown(event: PointerEvent) {
    if (!recording) return;
    const key = MOUSE_BUTTONS[event.button];
    if (!key) return;
    event.preventDefault();
    finish(key);
  }
</script>

<button
  class="recorder"
  class:recording
  class:empty={!shown}
  onclick={start}
  onkeydown={keydown}
  onpointerdown={pointerdown}
  onblur={() => (recording = false)}
  aria-label="{label}: {recording ? 'press a key, Escape removes the bind' : (shown ?? emptyText)}"
  aria-live="polite"
>
  {#if recording}
    <span class="prompt">Press a key</span>
  {:else if shown}
    <Keycap>{shown}</Keycap>
  {:else}
    <span class="none">{emptyText}</span>
  {/if}
</button>

<style>
  .recorder {
    height: 28px;
    min-width: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    border-radius: 8px;
    font-size: 13px;
    transition: background-color var(--t-pop) var(--ease);
  }
  .recorder:hover { background: var(--fill); }
  .empty { padding: 0 10px; }
  .none { color: var(--label-2); }
  .recording { padding: 0 10px; background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.6); }
  .prompt { color: var(--label); font-weight: 500; animation: blink 1.2s var(--ease) infinite; }
  @keyframes blink {
    50% { opacity: 0.55; }
  }
  :global(:root.reduce-motion) .prompt { animation: none; }
</style>
