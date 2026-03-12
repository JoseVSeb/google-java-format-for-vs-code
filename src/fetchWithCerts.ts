import https from "node:https";
import tls from "node:tls";

/**
 * A minimal fetch-compatible response interface returned by {@link fetchWithCerts}.
 */
export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

const MAX_REDIRECTS = 10;

/**
 * Builds an `https.Agent` that trusts Node.js's built-in root CA bundle
 * (`tls.rootCertificates`) plus any caller-supplied PEM-encoded CA strings.
 *
 * Use the returned agent with `node:https` requests to ensure SSL certificate
 * validation uses the same well-known CA set as Node.js while also trusting
 * any extra CAs you provide (e.g. for corporate proxies or test fixtures).
 */
export function buildHttpsAgent(additionalCaPems?: string[]): https.Agent {
  const cas = [...tls.rootCertificates];
  if (additionalCaPems) {
    cas.push(...additionalCaPems);
  }
  return new https.Agent({ ca: cas });
}

/**
 * Fetches a URL using `node:https` rather than the global `fetch()` API.
 *
 * **Why not `global fetch()`?**
 * In VS Code / Electron, the global `fetch()` is backed by Chromium's
 * networking layer, which on some macOS runners and behind SSL-inspecting
 * proxies may bypass VS Code's own proxy/certificate patching of
 * `https.request`.  Switching to `node:https` ensures that:
 *
 * - VS Code's proxy patching (applied to `https.request` at startup) takes
 *   effect for all outgoing requests from the extension.
 * - Certificate validation uses Node.js's well-curated Mozilla NSS root store
 *   (`tls.rootCertificates`) rather than whatever the Electron/Chromium layer
 *   happens to load from the OS keychain on a given platform.
 *
 * HTTP 3xx redirects are followed automatically (needed for GitHub release
 * asset downloads that redirect to the CDN).
 *
 * @param url The URL to fetch (must use the `https:` scheme).
 * @param additionalCaPems Optional extra PEM-encoded CA certificate strings to
 *   trust in addition to the built-in root bundle.  Pass the CA PEM of a
 *   self-signed test server here, or a corporate proxy CA.
 */
export async function fetchWithCerts(
  url: string,
  additionalCaPems?: string[],
): Promise<FetchResponse> {
  const agent = buildHttpsAgent(additionalCaPems);
  return fetchInternal(url, agent, 0);
}

function fetchInternal(
  url: string,
  agent: https.Agent,
  redirectCount: number,
): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }

    const req = https.get(url, { agent }, (res) => {
      const statusCode = res.statusCode ?? 0;

      // Follow 3xx redirects automatically.
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        res.resume(); // discard the redirect response body
        const location = res.headers.location;
        // Handle both absolute and protocol-relative redirect targets.
        const nextUrl = /^https?:\/\//i.test(location) ? location : new URL(location, url).href;
        resolve(fetchInternal(nextUrl, agent, redirectCount + 1));
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          statusText: res.statusMessage ?? "",
          json() {
            try {
              return Promise.resolve(JSON.parse(body.toString("utf8")) as unknown);
            } catch (e) {
              return Promise.reject(e as Error);
            }
          },
          arrayBuffer() {
            const ab = body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer;
            return Promise.resolve(ab);
          },
          text() {
            return Promise.resolve(body.toString("utf8"));
          },
        });
      });
      res.on("error", reject);
    });

    req.on("error", reject);
  });
}
