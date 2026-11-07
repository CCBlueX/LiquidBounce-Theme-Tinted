import type { ServerData } from "../../lib/api/types";

export type Health = "good" | "fair" | "poor" | "down" | "waiting";
export type Status = { word: string; health: Health; ping?: number };

/**
 * Whether label, version and players come from an answer. A row can be Pinging again while still holding the last
 * answer's data, and an old error label can outlive a new ping that has not answered yet.
 */
export function hasAnswer(server: ServerData) {
  return server.status === "SUCCESSFUL" || server.status === "INCOMPATIBLE" || server.status === "UNREACHABLE" || server.players.online !== undefined;
}

/** Every state is a word; the dot next to it only repeats what the word says. */
export function statusOf(server: ServerData): Status {
  switch (server.status) {
    case "INITIAL":
      return { word: "Not pinged", health: "waiting" };
    case "PINGING":
      return { word: "Pinging", health: "waiting", ping: server.ping > 0 ? server.ping : undefined };
    case "UNREACHABLE":
      return { word: "Unreachable", health: "down" };
    case "INCOMPATIBLE":
      return { word: "Incompatible", health: "down", ping: server.ping > 0 ? server.ping : undefined };
    case "SUCCESSFUL": {
      const ping = server.ping;
      if (ping <= 60) return { word: "Excellent", health: "good", ping };
      if (ping <= 150) return { word: "Good", health: "good", ping };
      if (ping <= 300) return { word: "Fair", health: "fair", ping };
      return { word: "Poor", health: "poor", ping };
    }
  }
}

export const formatCount = (value: number) => value.toLocaleString("en-US");

/**
 * Mirrors vanilla ServerAddress.isValidAddress closely enough to catch typos before the client does: host or [IPv6]
 * with an optional port. Returns the problem as a sentence, or undefined when the address looks valid.
 */
export function addressProblem(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Enter a server address.";
  if (/\s/.test(value)) return "Addresses can't contain spaces.";
  let host: string;
  let port: string | undefined;
  let bracketed = false;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end < 0) return "Close the IPv6 address with ].";
    host = value.slice(1, end);
    bracketed = true;
    const rest = value.slice(end + 1);
    if (rest) {
      if (!rest.startsWith(":")) return "Put the port after a colon, like [::1]:25565.";
      port = rest.slice(1);
    }
  } else {
    const parts = value.split(":");
    if (parts.length > 2) return "Put IPv6 addresses in brackets, like [::1]:25565.";
    [host, port] = parts;
  }
  if (!host) return "Enter a host name before the port.";
  if (port !== undefined && !(/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)) {
    return "The port must be a number from 1 to 65535.";
  }
  if (bracketed) return /^[0-9a-f:.]+$/i.test(host) ? undefined : "That IPv6 address has characters it can't contain.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(host)) return "Host names use only letters, digits, dots and hyphens.";
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return "Check the dots in the host name.";
  return undefined;
}
