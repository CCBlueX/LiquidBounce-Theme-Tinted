// Server-to-page event stream on ws://127.0.0.1:<port>/. Frames are {name, event}; every socket gets every event.
// The socket authenticates with the lb_auth cookie only. Handlers stay registered across reconnects.

import type { EventMap, EventName } from "./types";

export type EventHandler<K extends EventName> = (event: EventMap[K]) => void;
export type Unsubscribe = () => void;

const INITIAL_DELAY_MS = 250;
const MAX_DELAY_MS = 5000;

const handlers = new Map<EventName, Set<(event: never) => void>>();

let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let delay = INITIAL_DELAY_MS;
let activePort: number | undefined;

/**
 * Opens the event socket and keeps it open: on close it reconnects with exponential backoff (250 ms doubling,
 * capped at 5 s). Calling it again with another port moves the connection. Returns a function that disconnects.
 */
export function connectEvents(port: number): () => void {
  if (activePort === port && socket) return disconnectEvents;
  disconnectEvents();
  activePort = port;
  open();
  return disconnectEvents;
}

export function disconnectEvents(): void {
  activePort = undefined;
  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  const current = socket;
  socket = undefined;
  current?.close();
}

/** Calls `handler` for every `name` event until the returned function is called. */
export function on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

function open(): void {
  const port = activePort;
  if (port === undefined) return;

  const current = new WebSocket(`ws://127.0.0.1:${port}/`);
  socket = current;

  current.addEventListener("open", () => {
    delay = INITIAL_DELAY_MS;
  });
  current.addEventListener("message", (message) => {
    if (typeof message.data === "string") dispatch(message.data);
  });
  current.addEventListener("close", () => {
    if (socket !== current) return;
    socket = undefined;
    reconnectTimer = setTimeout(open, delay);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  });
}

// The client writes the name first, so frames no page part listens to (most of the per-tick stream) are never parsed
const FRAME_NAME = /^\{"name":"([^"]+)"/;

function dispatch(data: string): void {
  const name = FRAME_NAME.exec(data)?.[1];
  if (name !== undefined && !handlers.get(name as EventName)?.size) return;
  let frame: { name?: unknown; event?: unknown };
  try {
    frame = JSON.parse(data);
  } catch {
    return;
  }
  const set = typeof frame.name === "string" ? handlers.get(frame.name as EventName) : undefined;
  if (!set?.size) return;
  for (const handler of [...set]) {
    try {
      handler(frame.event as never);
    } catch (error) {
      console.error(`event handler for ${String(frame.name)} failed`, error);
    }
  }
}
