import { ApiError, reasonOf } from "./api/client";

// The client's account and proxy messages are terse and shout; these say what happened and what to do next.
const KNOWN: Record<string, string> = {
  "Username is empty!": "Enter a username.",
  "Username is too long!": "Usernames have at most 16 characters.",
  "Account already exists!": "This account is already in the list.",
  "Token is empty!": "Enter a token.",
  "Failed to get profile": "The service did not return a Minecraft profile.",
  "A Microsoft sign-in is already in progress!": "A Microsoft sign-in is already running. Finish it first.",
  "The browser is not available, use another sign-in method":
    "The sign-in window is not available. Use the browser or email and password.",
  "Email and password are required!": "Enter an email and a password.",
  "Logging in already started!": "A login is already running.",
  "Account not found!": "This account is no longer in the list.",
  "Unknown error": "The client reported an error without details.",
  "Opened login url in browser": "The Microsoft sign-in page opened in your browser. Finish there; the account appears here.",
  "Copied login url to clipboard": "The sign-in link is on your clipboard. Open it in any browser and finish there.",
  "Opened Microsoft sign-in window": "The Microsoft sign-in window is open. Finish there; the account appears here.",
  "No host": "Enter a host.",
  "Illegal port": "Ports go from 0 to 65535.",
  "Invalid id": "This entry is no longer in the list.",
  "Invalid proxy format. Expected format: host:port:username:password or host:port":
    "The clipboard holds no proxy. Copy host:port or host:port:username:password first.",
};

export function phrase(text: string) {
  const known = KNOWN[text.trim()];
  if (known) return known;
  const calm = text.trim().replace(/!+$/, "");
  return /[.?]$/.test(calm) ? calm : `${calm}.`;
}

/** The reason of a failed request, in words; requests that never reached the client say so. */
export function failure(error: unknown) {
  if (!(error instanceof ApiError)) return "The client could not be reached.";
  const reason = reasonOf(error);
  return reason ? phrase(reason) : `The client answered with status ${error.status}.`;
}
