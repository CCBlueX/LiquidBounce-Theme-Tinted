import "./lib/ui/tokens.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { configureClient } from "./lib/api/client";
import { connectEvents } from "./lib/api/events";
import { readLocation } from "./lib/api/screen";
import { startSettings } from "./lib/settings.svelte";
import { preloadSounds } from "./lib/sound";

const SETTINGS_WAIT_MS = 300;

const location = readLocation();
configureClient({ port: location.port });
connectEvents(location.port);
if (location.route !== "hud") preloadSounds();
// Reduce motion has to be known before the first screen animates in; a slow client only delays the page this long
await Promise.race([startSettings(), new Promise((done) => setTimeout(done, SETTINGS_WAIT_MS))]);

mount(App, {
  target: document.getElementById("app")!,
  props: { initialRoute: location.route, isStatic: location.isStatic },
});
