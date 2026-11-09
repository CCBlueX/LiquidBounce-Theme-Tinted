// The server and this session's stats for the Island's idle line. The client's serverSession event comes on join,
// leave, kills and deaths; TPS, ping and players online change too often for events, so the route is polled.
import { ApiError, request } from "../api/client";
import { on, onReconnect } from "../api/events";
import type { ServerSession } from "../api/types";

const POLL_MS = 5000;

class SessionState {
  server = $state.raw<ServerSession>();
  /** Minutes since joining; ticks while the Island runs. */
  minutes = $state(0);
  #key = "";
  #users = 0;
  #stop = () => {};

  #set(next: ServerSession | undefined) {
    const key = JSON.stringify(next ?? null);
    if (key === this.#key) return;
    this.#key = key;
    this.server = next;
    this.#tick();
  }

  #tick() {
    this.minutes = this.server ? Math.max(0, Math.floor((Date.now() - this.server.joinedAt) / 60000)) : 0;
  }

  start() {
    if (this.#users++ === 0) this.#run();
    return () => {
      if (--this.#users === 0) this.#stop();
    };
  }

  #run() {
    let poll: number | undefined;
    let clock: number | undefined;
    const fetch = () =>
      request<ServerSession | undefined>("GET", "/server")
        .then((server) => this.#set(server ?? undefined))
        .catch((error) => {
          // Clients before the route have nothing to poll
          if (error instanceof ApiError && error.status === 404) clearInterval(poll);
        });
    fetch();
    poll = setInterval(fetch, POLL_MS);
    clock = setInterval(() => this.#tick(), 15000);
    const offs = [on("serverSession", (event) => this.#set(event.session)), onReconnect(fetch)];
    this.#stop = () => {
      clearInterval(poll);
      clearInterval(clock);
      for (const off of offs) off();
    };
  }
}

export const serverSession = new SessionState();
