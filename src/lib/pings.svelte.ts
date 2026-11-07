import { on } from "./api/events";
import type { ServerData } from "./api/types";

/**
 * Latest serverPinged result per address while the calling component lives. Loading the server list pings every
 * server and the results come in bursts, so they are merged once per frame.
 */
export function livePings() {
  let pings = $state.raw<Record<string, ServerData>>({});
  $effect(() => {
    const pending = new Map<string, ServerData>();
    let frame = 0;
    const off = on("serverPinged", ({ server }) => {
      pending.set(server.address, server);
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        const next = { ...pings };
        for (const [address, data] of pending) next[address] = data;
        pending.clear();
        pings = next;
      });
    });
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  });
  return {
    get current() {
      return pings;
    },
    clear() {
      pings = {};
    },
  };
}
