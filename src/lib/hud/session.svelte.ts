// The current server and this world's statistics for the Island. TPS changes too often for events, so the server is
// polled; statistics arrive by event.
import { ApiError } from "../api/client";
import { on, onReconnect } from "../api/events";
import { player, servers } from "../api/routes";
import type { CurrentServer, PlayerStatistics } from "../api/types";

const POLL_MS = 5000;

class SessionState {
  server = $state.raw<CurrentServer>();
  statistics = $state.raw<PlayerStatistics>();
  /** Minutes since joining. */
  minutes = $state(0);
  #serverKey = "";
  #users = 0;
  #stop = () => {};

  start() {
    if (this.#users++ === 0) this.#run();
    return () => {
      if (--this.#users === 0) this.#stop();
    };
  }

  #tick() {
    const since = this.statistics?.joinedAt;
    this.minutes = since ? Math.max(0, Math.floor((Date.now() - since) / 60000)) : 0;
  }

  #setServer(next: CurrentServer | undefined) {
    const key = JSON.stringify(next ?? null);
    if (key === this.#serverKey) return;
    this.#serverKey = key;
    this.server = next;
  }

  #setStatistics(next: PlayerStatistics | undefined) {
    this.statistics = next;
    this.#tick();
  }

  #run() {
    // Clients without these routes answer 404; nothing to poll then
    const unsupported = (error: unknown) => error instanceof ApiError && error.status === 404;
    const fetchServer = () =>
      servers
        .current()
        .then((server) => this.#setServer(server))
        .catch((error) => unsupported(error) && clearInterval(poll));
    const fetchStatistics = () =>
      player
        .statistics()
        .then((statistics) => this.#setStatistics(statistics))
        .catch(() => {});

    fetchServer();
    fetchStatistics();
    const poll = setInterval(fetchServer, POLL_MS);
    const clock = setInterval(() => this.#tick(), 15000);
    const offs = [
      on("clientPlayerStatistics", (event) => this.#setStatistics(event.statistics)),
      onReconnect(() => {
        fetchServer();
        fetchStatistics();
      }),
    ];
    this.#stop = () => {
      clearInterval(poll);
      clearInterval(clock);
      for (const off of offs) off();
    };
  }
}

export const serverSession = new SessionState();
