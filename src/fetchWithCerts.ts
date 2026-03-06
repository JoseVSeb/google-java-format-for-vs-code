import https = require("node:https");
import http = require("node:http");
import tls = require("node:tls");
import path = require("node:path");
import fs = require("node:fs");
import { IncomingMessage } from "node:http";

type FetchResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
};

/** HTTP status codes that indicate a redirect. */
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

type HttpResponse = {
    statusCode: number;
    statusMessage: string;
    headers: NodeJS.Dict<string | string[]>;
    body: Buffer;
};

/**
 * Lazily-initialised HTTPS agent that merges:
 *   1. Node.js built-in root certificates (tls.rootCertificates)
 *   2. The GitHub-specific root CAs bundled with this extension (certs/github-ca.pem)
 *
 * Using node:https (instead of the global fetch API) ensures the request goes
 * through VS Code's patched https.request, which already handles system
 * certificates and proxy configuration.  Bundling the GitHub CAs provides an
 * additional safety net on systems where they might be absent from the default
 * CA store.
 */
let _httpsAgent: https.Agent | undefined;

function getHttpsAgent(): https.Agent {
    if (_httpsAgent) {
        return _httpsAgent;
    }

    const cas: string[] = [...tls.rootCertificates];

    // Merge bundled GitHub root CA certificates.
    // __dirname points to dist/ after webpack bundling, so the certs/ folder
    // lives one level up at the extension root.
    const certPath = path.join(__dirname, "..", "certs", "github-ca.pem");
    try {
        // A PEM file containing multiple certificates is valid as a single string:
        // OpenSSL/Node.js parses all PEM blocks within it.
        cas.push(fs.readFileSync(certPath, "utf8"));
    } catch {
        // Bundled certs file unavailable; proceed with tls.rootCertificates only
    }

    _httpsAgent = new https.Agent({ ca: cas });
    return _httpsAgent;
}

function doGet(url: string): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === "https:";
        const requester: typeof https = isHttps
            ? https
            : (http as unknown as typeof https);

        const options: https.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? "443" : "80"),
            path: parsedUrl.pathname + parsedUrl.search,
            method: "GET",
            headers: { "User-Agent": "google-java-format-for-vscode" },
            ...(isHttps ? { agent: getHttpsAgent() } : {}),
        };

        const req = requester.request(options, (res: IncomingMessage) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    statusMessage: res.statusMessage ?? "",
                    headers: res.headers as NodeJS.Dict<string | string[]>,
                    body: Buffer.concat(chunks),
                });
            });
            res.on("error", reject);
        });

        req.on("error", reject);
        req.end();
    });
}

async function requestWithRedirects(
    url: string,
    redirectsLeft = 10,
): Promise<HttpResponse> {
    const res = await doGet(url);

    const { statusCode, headers } = res;
    if (REDIRECT_STATUS_CODES.includes(statusCode) && headers.location) {
        if (redirectsLeft <= 0) {
            throw new Error(`Too many redirects for URL: ${url}`);
        }
        const location = Array.isArray(headers.location)
            ? headers.location[0]
            : headers.location;
        return requestWithRedirects(
            new URL(location, url).toString(),
            redirectsLeft - 1,
        );
    }

    return res;
}

/**
 * Drop-in replacement for the global fetch() API that uses Node.js's
 * node:https module (proxy-patched by VS Code) and the bundled GitHub root
 * CA certificates.  Redirects are followed automatically.
 */
export async function fetchWithCerts(url: string): Promise<FetchResponse> {
    const { statusCode, statusMessage, body } =
        await requestWithRedirects(url);

    return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        statusText: statusMessage,
        json() {
            return Promise.resolve(
                JSON.parse(body.toString("utf8")) as unknown,
            );
        },
        arrayBuffer() {
            const { buffer, byteOffset, byteLength } = body;
            return Promise.resolve(
                buffer.slice(byteOffset, byteOffset + byteLength),
            );
        },
    };
}
