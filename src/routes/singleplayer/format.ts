// Words and sentences for a World. The API gives serialized tokens ("survival", "normal").

import type { World } from "../../lib/api/types";
import { capitalize } from "../../lib/format";

export const gameModeLabel = (world: World) => (world.gameMode ? capitalize(world.gameMode) : "Survival");
export const difficultyLabel = (world: World) => (world.difficulty ? capitalize(world.difficulty) : "Normal");

/** "Survival · Normal" or "Hardcore" plus mode; hardcore is always spelled out, never a color. */
export function modeLine(world: World) {
  return world.hardcore ? `Hardcore · ${gameModeLabel(world)}` : `${gameModeLabel(world)} · ${difficultyLabel(world)}`;
}

export type Notice = { text: string; blocks: boolean };

/** Plain sentences for the flags vanilla checks before opening a world. Blocking ones disable Play. */
export function notices(world: World): Notice[] {
  const list: Notice[] = [];
  if (world.locked) list.push({ text: "This world is open in another game. Close it there to play here.", blocks: true });
  if (!world.isVersionAvailable)
    list.push({ text: `This world was saved by an unknown version (${world.version || "no version"}) and cannot be opened.`, blocks: true });
  if (world.requiresConversion)
    list.push({ text: "This world uses an old format. Minecraft converts it when it opens, and older versions cannot read it afterwards.", blocks: false });
  if (world.wouldBeDowngraded)
    list.push({ text: `This world was last played in a newer version (${world.version}). Opening it here can corrupt it.`, blocks: false });
  if (world.shouldPromptBackup) list.push({ text: "Minecraft advises a backup before opening this world.", blocks: false });
  return list;
}
