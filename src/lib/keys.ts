// Turns Minecraft key identifiers ("key.keyboard.right.shift", "key.mouse.left") into keycap labels.

const NAMES: Record<string, string> = {
  "left.control": "Left Ctrl",
  "right.control": "Right Ctrl",
  "left.alt": "Left Alt",
  "right.alt": "Right Alt",
  "left.win": "Left Super",
  "right.win": "Right Super",
  "left.bracket": "[",
  "right.bracket": "]",
  "grave.accent": "`",
  "caps.lock": "Caps Lock",
  "num.lock": "Num Lock",
  "scroll.lock": "Scroll Lock",
  "print.screen": "Print",
  "page.up": "Page Up",
  "page.down": "Page Down",
  semicolon: ";",
  apostrophe: "'",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  minus: "-",
  equal: "=",
  space: "Space",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  tab: "Tab",
  insert: "Insert",
  delete: "Delete",
  home: "Home",
  end: "End",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

const MOUSE: Record<string, string> = { left: "Mouse 1", right: "Mouse 2", middle: "Mouse 3" };

/** Keycap label for a bound key, or null when nothing is bound. */
export function keyLabel(boundKey: string | undefined | null): string | null {
  if (!boundKey || boundKey === "key.keyboard.unknown") return null;
  if (boundKey.startsWith("key.mouse.")) {
    const button = boundKey.slice("key.mouse.".length);
    return MOUSE[button] ?? `Mouse ${button}`;
  }
  const key = boundKey.replace(/^key\.keyboard\./, "");
  if (key.startsWith("keypad.")) return `Num ${(NAMES[key.slice(7)] ?? key.slice(7)).toUpperCase()}`;
  if (NAMES[key]) return NAMES[key];
  return key
    .split(".")
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}
