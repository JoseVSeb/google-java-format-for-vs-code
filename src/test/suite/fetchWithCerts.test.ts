import * as assert from "node:assert";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import { buildHttpsAgent, fetchWithCerts } from "../../fetchWithCerts";

// ---------------------------------------------------------------------------
// SSL / proxy-awareness e2e test suite
//
// This suite starts a local HTTPS server whose certificate is signed by a
// self-signed test CA that is intentionally absent from every system trust
// store.  It then verifies:
//
//   1. fetchWithCerts(url, [caPem]) returns HTTP 200 when the custom CA is
//      explicitly supplied → the implementation handles self-signed / extra CAs.
//
//   2. fetchWithCerts(url) (no extra CA) throws an SSL error → SSL validation
//      is active and not silently disabled.
//
//   3. global fetch() throws an SSL error against the same server → confirms
//      the failure mode that affects Electron's fetch() on some platforms
//      (notably macOS CI runners).
//
// Together these three assertions confirm that switching from global fetch()
// to fetchWithCerts() is both necessary (test 3) and sufficient (test 1),
// while proving that certificate validation is not bypassed (test 2).
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "test", "fixtures");

suite("fetchWithCerts – SSL / proxy-awareness", () => {
  let server: https.Server;
  let serverUrl: string;
  let caPem: string;

  suiteSetup(() => {
    caPem = fs.readFileSync(path.join(FIXTURES_DIR, "test-ca.pem"), "utf8");
    const serverKey = fs.readFileSync(path.join(FIXTURES_DIR, "test-server-key.pem"), "utf8");
    const serverCert = fs.readFileSync(path.join(FIXTURES_DIR, "test-server-cert.pem"), "utf8");

    server = https.createServer({ key: serverKey, cert: serverCert }, (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });

    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr !== null ? addr.port : 0;
        serverUrl = `https://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  suiteTeardown(() => {
    return new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test("fetchWithCerts() with custom CA returns HTTP 200", async function () {
    this.timeout(10_000);

    const response = await fetchWithCerts(serverUrl, [caPem]);

    assert.ok(response.ok, `Expected 200 OK but got HTTP ${response.status}`);
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.deepStrictEqual(body, { status: "ok" });
  });

  test("fetchWithCerts() without custom CA throws SSL error (validation is active)", async function () {
    this.timeout(10_000);

    let threw = false;
    try {
      await fetchWithCerts(serverUrl);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "fetchWithCerts() without the custom CA should throw — SSL validation must not be disabled",
    );
  });

  test("global fetch() throws SSL error against self-signed cert server", async function () {
    this.timeout(10_000);

    // Confirms the failure mode that affects Electron's built-in fetch() on
    // some platforms (e.g. macOS CI runners): the global fetch() does not
    // benefit from VS Code's https.request patching and has a different (and
    // sometimes incomplete) CA store, causing it to reject self-signed certs.
    let threw = false;
    try {
      await fetch(serverUrl);
    } catch {
      threw = true;
    }

    assert.ok(
      threw,
      "global fetch() should fail with an SSL error against a self-signed cert server",
    );
  });

  test("buildHttpsAgent() with custom CA connects successfully via https.get()", async function () {
    this.timeout(10_000);

    const agent = buildHttpsAgent([caPem]);

    await new Promise<void>((resolve, reject) => {
      https
        .get(serverUrl, { agent }, (res) => {
          assert.strictEqual(res.statusCode, 200, "Expected HTTP 200");
          res.resume();
          res.on("end", resolve);
        })
        .on("error", reject);
    });
  });
});
