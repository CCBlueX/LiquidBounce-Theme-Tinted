<script lang="ts">
  import { on } from "../../../lib/api/events";
  import { bindLabel, MODIFIERS } from "../../../lib/keys";
  import { play } from "../../../lib/sound";
  import Keycap from "../../../lib/ui/Keycap.svelte";

  // Shows a bound key as a keycap. Activating it listens for the next key or side mouse button; Esc unbinds. With
  // `chords`, modifiers held down join the bind, and a modifier pressed and let go alone is the bind itself.
  let {
    boundKey,
    modifiers = [],
    chords = false,
    label,
    emptyText = "Not bound",
    onchange,
  }: {
    boundKey: string;
    modifiers?: string[];
    chords?: boolean;
    label: string;
    emptyText?: string;
    onchange: (key: string, modifiers: string[]) => void;
  } = $props();

  const UNBOUND = "key.keyboard.unknown";

  // Modifier keys by Minecraft key name, and the bits of the client's keyboardKey `mods` (SDL masks)
  const MODIFIER_KEYS: Record<string, string> = {
    "key.keyboard.left.shift": "Shift",
    "key.keyboard.right.shift": "Shift",
    "key.keyboard.left.control": "Control",
    "key.keyboard.right.control": "Control",
    "key.keyboard.left.alt": "Alt",
    "key.keyboard.right.alt": "Alt",
    "key.keyboard.left.win": "Super",
    "key.keyboard.right.win": "Super",
  };
  const MOD_BITS: Record<string, number> = { Shift: 0x3, Control: 0xc0, Alt: 0x300, Super: 0xc00 };

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
  /** Modifier keys held down since recording started, by Minecraft key name. */
  let held = $state<string[]>([]);
  let fallback: number | undefined;

  const shown = $derived(bindLabel({ boundKey, modifiers: chords ? modifiers : [] }));
  const heldLabel = $derived(
    MODIFIERS.filter(([tag]) => held.some((key) => MODIFIER_KEYS[key] === tag))
      .map(([, text]) => text)
      .join("+"),
  );

  const ordered = (tags: string[]) => MODIFIERS.map(([tag]) => tag).filter((tag) => tags.includes(tag));

  function finish(key: string, tags: string[] = []) {
    clearTimeout(fallback);
    recording = false;
    held = [];
    play(key === UNBOUND ? "tap" : "confirm");
    const next = key === UNBOUND || !chords ? [] : ordered(tags);
    if (key !== boundKey || next.join() !== ordered(modifiers).join()) onchange(key, next);
  }

  function start() {
    if (recording) return;
    recording = true;
    held = [];
    play("tap");
  }

  function press(key: string, tags: string[]) {
    if (chords && MODIFIER_KEYS[key]) {
      if (!held.includes(key)) held = [...held, key];
      return;
    }
    finish(key, [...tags, ...held.map((name) => MODIFIER_KEYS[name])]);
  }

  function release(key: string) {
    if (!held.includes(key)) return;
    finish(key, held.filter((name) => name !== key).map((name) => MODIFIER_KEYS[name]));
  }

  // Inside the game the browser may not know the physical key or the held modifiers; the client's own key event
  // names both exactly
  $effect(() => {
    if (!recording) return;
    return on("keyboardKey", (event) => {
      if (!recording) return;
      if (event.action === 0) return release(event.key);
      if (event.action !== 1) return;
      if (event.key === "key.keyboard.escape") return finish(UNBOUND);
      press(event.key, Object.keys(MOD_BITS).filter((tag) => event.mods & MOD_BITS[tag]));
    });
  });

  const flags = (event: KeyboardEvent | PointerEvent) =>
    [event.ctrlKey && "Control", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(
      (tag): tag is string => !!tag,
    );

  function keydown(event: KeyboardEvent) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === "Escape") return finish(UNBOUND);
    const key = minecraftKey(event.code);
    if (key) return press(key, flags(event));
    // Unknown to the browser: give the client's keyboardKey event a moment, then give up
    clearTimeout(fallback);
    fallback = window.setTimeout(() => {
      if (!recording) return;
      recording = false;
      held = [];
      play("error");
    }, 250);
  }

  function keyup(event: KeyboardEvent) {
    if (!recording) return;
    event.preventDefault();
    const key = minecraftKey(event.code);
    if (key) release(key);
  }

  function pointerdown(event: PointerEvent) {
    if (!recording) return;
    const key = MOUSE_BUTTONS[event.button];
    if (!key) return;
    event.preventDefault();
    finish(key, [...flags(event), ...held.map((name) => MODIFIER_KEYS[name])]);
  }
</script>

<button
  class="recorder"
  class:recording
  class:empty={!shown}
  title={!recording && shown ? shown : undefined}
  onclick={start}
  onkeydown={keydown}
  onkeyup={keyup}
  onpointerdown={pointerdown}
  onblur={() => {
    recording = false;
    held = [];
  }}
  aria-label="{label}: {recording ? 'press a key, Escape removes the bind' : (shown ?? emptyText)}"
  aria-live="polite"
>
  {#if recording}
    <span class="prompt">{heldLabel ? `${heldLabel}+…` : "Press a key"}</span>
  {:else if shown}
    <Keycap>{shown}</Keycap>
  {:else}
    <span class="none">{emptyText}</span>
  {/if}
</button>

<style>
  .recorder {
    height: 24px;
    min-width: 24px;
    max-width: 168px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    border-radius: 6px;
    font-size: 13px;
    transition: background-color var(--t-hover) ease;
  }
  .recorder:hover { background: var(--fill); }
  .empty { padding: 0 8px; }
  /* Trailing keycaps end on the row's inset; the hover fill may run past it */
  :global(.cg-row) > .recorder:last-child:not(.empty, .recording) { margin-right: -3px; }
  .none, .prompt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .none { color: var(--label-2); }
  .recording { padding: 0 8px; background: var(--accent-tint); box-shadow: inset 0 0 0 1px rgb(70 119 255 / 0.6); }
  .prompt { color: var(--label); font-weight: 500; animation: blink 1.2s var(--ease) infinite; }
  @keyframes blink {
    50% { opacity: 0.55; }
  }
  :global(:root.reduce-motion) .prompt { animation: none; }
</style>
