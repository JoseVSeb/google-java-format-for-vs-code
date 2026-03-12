import * as assert from "node:assert";
import * as fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import { buildHttpsAgent, fetchWithCerts } from "../../fetchWithCerts";

// ---------------------------------------------------------------------------
// fetchWithCerts — full coverage test suite
//
// All tests run against a local HTTPS server whose certificate is signed by a
// self-signed test CA that is intentionally absent from every system trust
// store (neither `tls.rootCertificates` nor Electron's bundled CA bundle
// includes it).  No external network calls are made.
//
// Server endpoints:
//
//   GET /                       → 200 {"status":"ok"}
//   GET /text                   → 200 "hello world" (plain text)
//   GET /invalid-json           → 200 "not_valid{{{" (malformed JSON body)
//   GET /asset                  → 200 binary bytes (partial ELF-like header)
//   GET /redirect-relative      → 301 Location: /asset  (relative redirect)
//   GET /redirect-absolute      → 301 Location: https://127.0.0.1:{port}/asset
//   GET /redirect-loop          → 301 Location: /redirect-loop  (infinite loop)
//   GET /not-found              → 404 {"error":"not found"}
//   GET /server-error           → 500 {"error":"server error"}
//   GET /error-after-headers    → 200 headers + partial body, then socket destroyed
//
// Scenario groups:
//
//   Scenario 1 – SSL/TLS validation (proxy / self-signed CA)
//   Scenario 2 – Response body methods (.json(), .text(), .arrayBuffer())
//   Scenario 3 – HTTP redirects (relative, absolute, too-many-redirects)
//   Scenario 4 – Non-2xx HTTP status codes
//   Scenario 5 – buildHttpsAgent() CA trust mechanism
//   Scenario 6 – Mid-response stream error
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "test", "fixtures");

// Minimal binary payload simulating a GJF native binary asset (partial ELF-like header).
const MOCK_BINARY = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);

// Set by suiteSetup once the server has a port; used by requestHandler for
// the absolute-URL redirect endpoint.
let serverUrl = "";

function requestHandler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  if (url === "/text") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hello world");
  } else if (url === "/invalid-json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("not_valid{{{");
  } else if (url === "/asset") {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(MOCK_BINARY);
  } else if (url === "/redirect-relative") {
    // Relative Location header — exercises the `new URL(location, url)` branch.
    res.writeHead(301, { Location: "/asset" });
    res.end();
  } else if (url === "/redirect-absolute") {
    // Absolute Location header — exercises the `/^https?:\/\//i.test(location)` branch.
    res.writeHead(301, { Location: `${serverUrl}/asset` });
    res.end();
  } else if (url === "/redirect-loop") {
    // Redirects to itself — will eventually exceed MAX_REDIRECTS (10).
    res.writeHead(301, { Location: "/redirect-loop" });
    res.end();
  } else if (url === "/not-found") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } else if (url === "/server-error") {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server error" }));
  } else if (url === "/error-after-headers") {
    // Send headers and partial body, then destroy the socket before the body
    // is complete.  Exercises the `res.on("error", reject)` code path.
    res.writeHead(200, { "Content-Length": "1024", "Content-Type": "application/json" });
    res.write("partial");
    setImmediate(() => res.socket?.destroy());
  } else {
    // Default: GET / → 200 {"status":"ok"}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  }
}

suite("fetchWithCerts – full coverage", () => {
  let server: https.Server;
  let caPem: string;

  suiteSetup(function (this: Mocha.Context) {
    this.timeout(10_000);

    caPem = fs.readFileSync(path.join(FIXTURES_DIR, "test-ca.pem"), "utf8");
    const serverKey = fs.readFileSync(path.join(FIXTURES_DIR, "test-server-key.pem"), "utf8");
    const serverCert = fs.readFileSync(path.join(FIXTURES_DIR, "test-server-cert.pem"), "utf8");

    server = https.createServer({ key: serverKey, cert: serverCert }, requestHandler);

    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr !== null ? addr.port : 0;
        serverUrl = `https://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  suiteTeardown(function (this: Mocha.Context) {
    this.timeout(5_000);
    return new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – SSL/TLS validation (proxy / self-signed CA)
  //
  // Models a corporate SSL-inspecting proxy: the server's root CA is absent
  // from every system/Electron trust store, so both global fetch() and
  // fetchWithCerts() fail unless the CA is explicitly provided.
  // -------------------------------------------------------------------------

  test("Scenario 1a: global fetch() fails for self-signed CA server", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetch(serverUrl);
    } catch {
      threw = true;
    }

    assert.ok(threw, "global fetch() should throw for a server with an untrusted self-signed CA");
  });

  test("Scenario 1b: fetchWithCerts() without extra CA fails — SSL validation is active", async function () {
    this.timeout(10_000);

    // Exercises the SSL handshake failure path: the CA is missing from
    // tls.rootCertificates, so https.get() emits an error on the request
    // before a response is received (req.on("error") → reject).
    let threw = false;
    try {
      await fetchWithCerts(serverUrl);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "fetchWithCerts() without an explicit CA must not silently disable SSL validation",
    );
  });

  test("Scenario 1c: fetchWithCerts([caPem]) succeeds — explicit proxy/custom CA is trusted", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(serverUrl, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);
    assert.strictEqual(response.status, 200);
    // Also exercises .json() with a valid JSON body.
    const body = await response.json();
    assert.deepStrictEqual(body, { status: "ok" });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Response body methods (.json(), .text(), .arrayBuffer())
  // -------------------------------------------------------------------------

  test("Scenario 2a: .text() returns the plain-text response body as a string", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/text`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);
    const body = await response.text();
    assert.strictEqual(body, "hello world");
  });

  test("Scenario 2b: .json() rejects when response body is not valid JSON", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/invalid-json`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);

    let threw = false;
    try {
      await response.json();
    } catch {
      threw = true;
    }

    assert.ok(threw, ".json() should reject when the response body is not valid JSON");
  });

  test("Scenario 2c: .arrayBuffer() returns the binary response body", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/asset`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);
    const buf = await response.arrayBuffer();
    assert.strictEqual(
      buf.byteLength,
      MOCK_BINARY.byteLength,
      "arrayBuffer() byte length should match the mock binary",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – HTTP redirects
  // -------------------------------------------------------------------------

  test("Scenario 3a: global fetch() fails for redirect URL when CA is untrusted (SSL before redirect)", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetch(`${serverUrl}/redirect-relative`);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "global fetch() should fail at the TLS layer before it can follow any redirect",
    );
  });

  test("Scenario 3b: fetchWithCerts([caPem]) follows a relative 301 redirect and returns the asset", async function () {
    this.timeout(10_000);

    // Exercises the `new URL(location, url).href` branch (relative Location header).
    const response = await fetchWithCerts(`${serverUrl}/redirect-relative`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 after redirect but got ${response.status}`);
    assert.strictEqual(response.status, 200);
    const buffer = await response.arrayBuffer();
    assert.strictEqual(
      buffer.byteLength,
      MOCK_BINARY.byteLength,
      "Binary content after redirect should match the mock asset",
    );
  });

  test("Scenario 3c: fetchWithCerts([caPem]) follows an absolute-URL 301 redirect and returns the asset", async function () {
    this.timeout(10_000);

    // Exercises the absolute URL detection branch: when the Location header
    // starts with "https://", `fetchInternal` uses it directly instead of
    // resolving it relative to the current URL.
    const response = await fetchWithCerts(`${serverUrl}/redirect-absolute`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 after absolute redirect but got ${response.status}`);
    assert.strictEqual(response.status, 200);
    const buffer = await response.arrayBuffer();
    assert.strictEqual(
      buffer.byteLength,
      MOCK_BINARY.byteLength,
      "Binary content after absolute redirect should match the mock asset",
    );
  });

  test("Scenario 3d: fetchWithCerts() rejects with 'Too many redirects' after MAX_REDIRECTS", async function () {
    this.timeout(10_000);

    // The server's /redirect-loop endpoint redirects to itself indefinitely.
    // fetchInternal() aborts after MAX_REDIRECTS (10) hops.
    let error: unknown;
    try {
      await fetchWithCerts(`${serverUrl}/redirect-loop`, [caPem]);
    } catch (e) {
      error = e;
    }

    assert.ok(error instanceof Error, "Should reject with an Error for too many redirects");
    assert.ok(
      (error as Error).message.includes("Too many redirects"),
      `Error message should mention "Too many redirects", got: ${(error as Error).message}`,
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Non-2xx HTTP status codes
  //
  // fetchWithCerts() resolves (does not throw) for 4xx/5xx responses; callers
  // must check response.ok or response.status.
  // -------------------------------------------------------------------------

  test("Scenario 4a: HTTP 404 response resolves with ok=false and status=404", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/not-found`, [caPem]);

    assert.strictEqual(response.ok, false, "ok should be false for HTTP 404");
    assert.strictEqual(response.status, 404);
  });

  test("Scenario 4b: HTTP 500 response resolves with ok=false and status=500", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/server-error`, [caPem]);

    assert.strictEqual(response.ok, false, "ok should be false for HTTP 500");
    assert.strictEqual(response.status, 500);
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – buildHttpsAgent() CA trust mechanism
  //
  // Models bundling a specific root CA (e.g. DigiCert / GitHub's CA) alongside
  // tls.rootCertificates so that fetchWithCerts() can reach endpoints whose CA
  // is absent from the OS keychain or Electron's bundled store.
  // -------------------------------------------------------------------------

  test("Scenario 5a: buildHttpsAgent() without extra CA rejects for self-signed server", async function () {
    this.timeout(10_000);

    // tls.rootCertificates does not include our test CA — proves that
    // buildHttpsAgent() does NOT disable certificate validation.
    const agent = buildHttpsAgent();

    let threw = false;
    try {
      await new Promise<void>((resolve, reject) => {
        https
          .get(serverUrl, { agent }, (res) => {
            res.resume();
            res.on("end", resolve);
          })
          .on("error", reject);
      });
    } catch {
      threw = true;
    }

    assert.ok(threw, "buildHttpsAgent() without extra CA should fail for self-signed server");
  });

  test("Scenario 5b: buildHttpsAgent([caPem]) with bundled CA connects successfully", async function () {
    this.timeout(10_000);

    const agent = buildHttpsAgent([caPem]);

    await new Promise<void>((resolve, reject) => {
      https
        .get(serverUrl, { agent }, (res) => {
          assert.strictEqual(res.statusCode, 200, "Expected HTTP 200 with bundled CA");
          res.resume();
          res.on("end", resolve);
        })
        .on("error", reject);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6 – Mid-response stream error
  //
  // The server sends HTTP 200 headers then destroys the socket before the body
  // is complete.  This exercises the `res.on("error", reject)` code path in
  // fetchInternal(): the promise should reject rather than hang.
  // -------------------------------------------------------------------------

  test("Scenario 6a: mid-response socket destruction propagates as a rejection", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetchWithCerts(`${serverUrl}/error-after-headers`, [caPem]);
    } catch {
      threw = true;
    }

    assert.ok(threw, "A mid-response socket error should cause fetchWithCerts() to reject");
  });
});
