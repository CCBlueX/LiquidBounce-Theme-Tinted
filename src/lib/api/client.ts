// REST transport for http://127.0.0.1:<port>/api/v1/client. Auth rides on the lb_auth cookie the client sets on the
// first page load (external dev themes skip auth), so every request includes credentials.

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type QueryValue = string | number | boolean | undefined;
export type RequestOptions = { query?: Record<string, QueryValue>; body?: unknown };

/** Non-2xx answer. `body` is the parsed JSON (usually `{reason}`) or the raw text when it is not JSON. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, method: string, path: string) {
    const reason = typeof body === "object" && body !== null && "reason" in body ? String(body.reason) : String(body);
    super(`${method} ${path} -> ${status}: ${reason}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** The `reason` an ApiError carries, as sent; "" for other errors. */
export function reasonOf(error: unknown): string {
  if (error instanceof ApiError && typeof error.body === "object" && error.body !== null && "reason" in error.body) {
    return String(error.body.reason);
  }
  return "";
}

let port: number | undefined;

export function configureClient(options: { port: number }): void {
  port = options.port;
}

/** Origin of the interop server, e.g. http://127.0.0.1:15100. */
export function serverOrigin(): string {
  if (port === undefined) throw new Error("configureClient({port}) was not called");
  return `http://127.0.0.1:${port}`;
}

/** Absolute URL of a route under /api/v1/client, for fetches the page does not make itself (img src, links). */
export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${serverOrigin()}/api/v1/client${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Sends JSON, parses JSON. 204 and empty bodies give undefined; non-2xx throws ApiError. */
export async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(apiUrl(path, options.query), {
    method,
    credentials: "include",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const text = response.status === 204 ? "" : await response.text();
  const body = text === "" ? undefined : parse(text);
  if (!response.ok) throw new ApiError(response.status, body, method, path);
  return body as T;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
