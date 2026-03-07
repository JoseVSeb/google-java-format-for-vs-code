import { get } from "node:https";
import type { IncomingMessage } from "node:http";

/**
 * Minimal response type returned by {@link httpsGet}.
 * Mirrors the subset of the WHATWG `Response` interface used by this extension.
 */
export interface SimpleResponse {
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T = unknown>(): Promise<T>;
}

const MAX_REDIRECTS = 10;

/**
 * Minimal HTTPS GET helper backed by Node's built-in `node:https` module.
 *
 * VS Code's extension host exposes a global `fetch()` that routes through
 * Electron's network stack.  On macOS CI runners this can fail for external
 * HTTPS endpoints (e.g. api.github.com) even when the same URL is reachable
 * via Node's own TLS implementation.  Using `node:https` directly avoids
 * that platform-specific failure.
 */
export function httpsGet(url: string, redirectsLeft = MAX_REDIRECTS): Promise<SimpleResponse> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error(`Too many redirects fetching ${url}`));
      return;
    }

    get(url, { headers: { "User-Agent": "vscode-google-java-format" } }, (res: IncomingMessage) => {
      const { statusCode = 0, statusMessage = "", headers } = res;

      // Follow HTTP redirects (301, 302, 307, 308)
      if (statusCode >= 300 && statusCode < 400 && typeof headers.location === "string") {
        res.resume(); // drain and discard redirect body
        httpsGet(headers.location, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      const chunks: Buffer[] = [];
      res.on("error", reject);
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          statusText: statusMessage,
          arrayBuffer() {
            const ab = new ArrayBuffer(body.length);
            new Uint8Array(ab).set(body);
            return Promise.resolve(ab);
          },
          json<T>() {
            return Promise.resolve(JSON.parse(body.toString("utf-8")) as T);
          },
        });
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}
