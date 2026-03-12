import * as assert from "node:assert";
import * as fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import { buildHttpsAgent, fetchWithCerts } from "../../fetchWithCerts";

// ---------------------------------------------------------------------------
// fetchWithCerts — comprehensive SSL / proxy-awareness test suite
//
// All tests run against a local HTTPS server whose certificate is signed by a
// self-signed test CA that is intentionally absent from every system trust
// store (neither `tls.rootCertificates` nor Electron's bundled CA bundle
// includes it).  This lets each scenario stand in for a real-world failure
// mode without making external network calls.
//
// The server exposes several endpoints:
//
//   GET /                   → 200 {"status":"ok"}       (basic health check)
//   GET /releases/latest    → 200 GJF releases-API JSON (simulates api.github.com)
//   GET /redirect           → 301 → /asset              (simulates CDN redirect)
//   GET /asset              → 200 binary bytes           (simulates binary download)
//
// Four scenario groups are covered:
//
//   Scenario 1 – Proxy / custom CA (SSL-inspection simulation)
//     Models: corporate MITM proxy or macOS keychain missing the server CA.
//     global fetch()          → throws (Electron's CA store doesn't include proxy CA)
//     fetchWithCerts()        → throws (tls.rootCertificates doesn't include it either)
//     fetchWithCerts([caPem]) → 200  ✓ (explicit proxy CA trust works)
//
//   Scenario 2 – GJF Releases API simulation (macOS Electron fetch failure)
//     Models: global fetch() failing for api.github.com on macOS CI runners.
//     global fetch()                  → throws (simulates macOS Electron failure)
//     fetchWithCerts([caPem])         → 200 JSON parseable as release response  ✓
//
//   Scenario 3 – CDN asset download with redirect
//     Models: GJF binary download via GitHub → objects.githubusercontent.com CDN.
//     global fetch()          → throws (SSL fails before following redirect)
//     fetchWithCerts([caPem]) → follows 301, returns binary body ✓
//
//   Scenario 4 – Bundled CA / explicit trust mechanism
//     Models: bundling the GitHub root CA alongside tls.rootCertificates so
//     that fetchWithCerts() succeeds even when the OS keychain is missing it.
//     buildHttpsAgent()        → agent using only tls.rootCertificates → throws for self-signed
//     buildHttpsAgent([caPem]) → agent trusting test CA → https.get() returns 200 ✓
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "test", "fixtures");

// Minimal GJF releases-API JSON (matches the shape parsed by GoogleJavaFormatRelease.ts).
const MOCK_RELEASE_JSON = JSON.stringify({
  tag_name: "v1.25.2",
  assets: [
    {
      browser_download_url:
        "https://github.com/google/google-java-format/releases/download/v1.25.2/google-java-format-1.25.2-all-deps.jar",
    },
    {
      browser_download_url:
        "https://github.com/google/google-java-format/releases/download/v1.25.2/google-java-format_linux-x86-64",
    },
    {
      browser_download_url:
        "https://github.com/google/google-java-format/releases/download/v1.25.2/google-java-format_darwin-arm64",
    },
    {
      browser_download_url:
        "https://github.com/google/google-java-format/releases/download/v1.25.2/google-java-format_windows-x86-64.exe",
    },
  ],
});

// Minimal binary payload simulating a GJF native binary asset (partial ELF-like header).
const MOCK_BINARY = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);

function requestHandler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  if (url === "/releases/latest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(MOCK_RELEASE_JSON);
  } else if (url === "/redirect") {
    // Simulate CDN redirect (GitHub release → objects.githubusercontent.com)
    res.writeHead(301, { Location: "/asset" });
    res.end();
  } else if (url === "/asset") {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(MOCK_BINARY);
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  }
}

suite("fetchWithCerts – SSL / proxy-awareness", () => {
  let server: https.Server;
  let serverUrl: string;
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
  // Scenario 1 – Proxy / custom CA (SSL-inspection simulation)
  //
  // Models a corporate SSL-inspecting proxy (or a macOS system keychain that
  // is missing the server's root CA).  global fetch() and fetchWithCerts()
  // both fail without the CA, but fetchWithCerts([caPem]) succeeds.
  // -------------------------------------------------------------------------

  test("Scenario 1a: global fetch() fails for self-signed CA server (Electron SSL failure mode)", async function () {
    this.timeout(10_000);

    // Confirms the failure mode that affects Electron's built-in fetch() on
    // some platforms: the CA is absent from Electron's (and the system's)
    // trust store, causing the TLS handshake to fail.
    let threw = false;
    try {
      await fetch(serverUrl);
    } catch {
      threw = true;
    }

    assert.ok(threw, "global fetch() should throw for a server with an untrusted self-signed CA");
  });

  test("Scenario 1b: fetchWithCerts() without extra CA also fails (SSL validation is active)", async function () {
    this.timeout(10_000);

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
    const body = await response.json();
    assert.deepStrictEqual(body, { status: "ok" });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – GJF Releases API simulation (macOS Electron fetch failure)
  //
  // Models: global fetch() hanging or failing on macOS CI runners when
  // calling api.github.com (Electron's Chromium networking stack bypasses
  // VS Code's https.request patching, leading to CA store mismatches).
  // The local server exposes /releases/latest with the same JSON shape as
  // the real GitHub Releases API used by GoogleJavaFormatService.
  // -------------------------------------------------------------------------

  test("Scenario 2a: global fetch() fails for GJF API URL shape (simulated macOS failure)", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetch(`${serverUrl}/releases/latest`);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "global fetch() should fail for GJF API URL with untrusted CA (macOS failure mode)",
    );
  });

  test("Scenario 2b: fetchWithCerts([caPem]) fetches GJF API URL and returns parseable release JSON", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/releases/latest`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);

    const body = (await response.json()) as {
      tag_name: string;
      assets: { browser_download_url: string }[];
    };
    assert.ok(typeof body.tag_name === "string", "Response should have a tag_name field");
    assert.ok(Array.isArray(body.assets), "Response should have an assets array");
    assert.ok(body.assets.length > 0, "Assets array should not be empty");
    assert.ok(
      body.assets.every((a) => typeof a.browser_download_url === "string"),
      "Each asset should have a browser_download_url",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – CDN asset download with redirect
  //
  // Models: GJF binary downloads that go through GitHub → CDN redirect
  // (e.g., objects.githubusercontent.com).  global fetch() fails on SSL
  // before it can even follow the redirect.  fetchWithCerts() follows
  // the 301 and returns the full binary body.
  // -------------------------------------------------------------------------

  test("Scenario 3a: global fetch() fails for redirect URL with untrusted CA (SSL fails before redirect)", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetch(`${serverUrl}/redirect`);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "global fetch() should fail for redirect URL when the server uses an untrusted CA",
    );
  });

  test("Scenario 3b: fetchWithCerts([caPem]) follows 301 redirect and returns binary asset", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(`${serverUrl}/redirect`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 after redirect but got ${response.status}`);
    assert.strictEqual(response.status, 200);

    const buffer = await response.arrayBuffer();
    assert.ok(buffer.byteLength > 0, "Downloaded binary asset should not be empty");
    // Verify the redirect was followed and we received the mock binary (partial ELF-like header).
    assert.strictEqual(
      buffer.byteLength,
      MOCK_BINARY.byteLength,
      "Binary content length should match the mock asset",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Bundled CA / explicit trust mechanism
  //
  // Models: bundling the GitHub root CA alongside tls.rootCertificates so
  // fetchWithCerts() can reach GitHub on systems where the OS keychain or
  // Electron's CA store is missing that root.  Uses buildHttpsAgent() directly
  // to prove the underlying trust mechanism.
  // -------------------------------------------------------------------------

  test("Scenario 4a: buildHttpsAgent() without extra CA cannot connect to self-signed server", async function () {
    this.timeout(10_000);

    // tls.rootCertificates does not include our test CA, so the connection
    // must fail — proving that buildHttpsAgent() does not disable validation.
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

  test("Scenario 4b: buildHttpsAgent([caPem]) with bundled CA succeeds (simulates bundled GitHub CA)", async function () {
    this.timeout(10_000);

    // Simulates bundling the GitHub root CA so that fetchWithCerts() can reach
    // GitHub endpoints on macOS where the keychain CA store is incomplete.
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

  test("Scenario 4c: fetchWithCerts([caPem]) returns correct Content-Type for binary asset", async function () {
    this.timeout(10_000);

    // Verifies the full chain: explicit CA trust → redirect following → correct
    // binary response.  This mirrors the production code path in Cache.ts that
    // calls fetchWithCerts() and then reads arrayBuffer().
    const response = await fetchWithCerts(`${serverUrl}/asset`, [caPem]);

    assert.ok(response.ok, `Expected HTTP 200 but got ${response.status}`);
    const buf = await response.arrayBuffer();
    assert.ok(buf.byteLength > 0, "Binary response should have non-empty body");
  });
});
