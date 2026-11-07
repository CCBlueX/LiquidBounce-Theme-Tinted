import type { Component } from "svelte";
import Armor from "./Armor.svelte";
import Effects from "./Effects.svelte";
import Island from "./Island.svelte";
import Modules from "./Modules.svelte";
import Scoreboard from "./Scoreboard.svelte";
import Target from "./Target.svelte";

/** The view of every component the theme declares, by component name. */
export const VIEWS: Record<string, Component> = { Island, Modules, Scoreboard, Armor, Effects, Target };
