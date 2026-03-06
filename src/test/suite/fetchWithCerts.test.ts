/**
 * SSL Resilience E2E Test — runs inside VS Code's test-electron environment.
 *
 * Scenario
 * --------
 * This test reproduces the class of failure reported on macOS M3 (and behind
 * corporate proxies): the GitHub HTTPS server presents a certificate that is
 * signed by a CA *not present* in the system trust store.  In that situation:
 *
 *   • global fetch()           → SSL handshake error (CERT_UNKNOWN / unable to
 *                                 verify the first certificate).
 *   • node:https + custom agent → succeeds, because the agent explicitly trusts
 *                                 the CA — the exact mechanism used by
 *                                 fetchWithCerts() with the bundled GitHub CAs.
 *
 * How the test works
 * ------------------
 * A local HTTPS server is started on 127.0.0.1 using a *test-only* self-signed
 * certificate (see src/test/fixtures/README.md).  That CA is intentionally
 * absent from every system trust store, so global fetch() will always reject
 * it — perfectly simulating a GitHub CA that is missing from the OS keychain.
 *
 * We then show that constructing an https.Agent that explicitly trusts the test
 * CA (via buildHttpsAgent) allows the same request to succeed.  This is
 * identical to what fetchWithCerts() does in production with the bundled
 * DigiCert/GlobalSign CAs.
 */
import * as assert from "assert";
import https = require("node:https");
import path = require("node:path");
import fs = require("node:fs");
import { AddressInfo } from "node:net";
import { IncomingMessage } from "node:http";
import { buildHttpsAgent } from "../../fetchWithCerts";

// The compiled test file lives at  out/test/suite/fetchWithCerts.test.js.
// The fixtures live at                src/test/fixtures/
// Project root is out/test/suite/../../../  →  three levels up.
const FIXTURES_DIR = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "src",
    "test",
    "fixtures",
);

suite("fetchWithCerts — SSL resilience (test-electron e2e)", () => {
    let server: https.Server;
    let serverUrl: string;
    let testCaPem: string;

    suiteSetup(function (done) {
        const cert = fs.readFileSync(
            path.join(FIXTURES_DIR, "test-server-cert.pem"),
            "utf8",
        );
        const key = fs.readFileSync(
            path.join(FIXTURES_DIR, "test-server-key.pem"),
            "utf8",
        );
        testCaPem = fs.readFileSync(
            path.join(FIXTURES_DIR, "test-ca.pem"),
            "utf8",
        );

        // Minimal HTTPS server that always returns 200 with a JSON body.
        server = https.createServer({ cert, key }, (_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
        });

        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as AddressInfo;
            serverUrl = `https://127.0.0.1:${port}/`;
            done();
        });
    });

    suiteTeardown(function (done) {
        server.close(done);
    });

    test("global fetch() fails when the server CA is absent from the system trust store", async () => {
        // global fetch() has no knowledge of our test CA — it will throw an
        // SSL error, exactly as it does for GitHub's DigiCert CA on affected
        // macOS systems.
        let threw = false;
        try {
            await fetch(serverUrl);
        } catch {
            threw = true;
        }
        assert.ok(
            threw,
            "global fetch() must throw an SSL error for a certificate whose CA " +
                "is not in the system trust store",
        );
    });

    test("buildHttpsAgent() with bundled CA connects where global fetch() fails", async () => {
        // This is the mechanism fetchWithCerts() uses in production:
        //   create an https.Agent that explicitly trusts the required CA certs.
        // Here we inject the test CA; in production the bundled GitHub CAs are
        // injected instead — same code path, different certificate.
        const agent = buildHttpsAgent([testCaPem]);

        const statusCode = await new Promise<number>((resolve, reject) => {
            const req = https.request(serverUrl, { agent }, (res: IncomingMessage) => {
                res.resume();
                res.on("end", () => resolve(res.statusCode ?? 0));
            });
            req.on("error", reject);
            req.end();
        });

        assert.strictEqual(
            statusCode,
            200,
            "node:https with a custom https.Agent that trusts the server CA " +
                "must succeed (HTTP 200) — the same mechanism fetchWithCerts() " +
                "uses with the bundled GitHub root CAs",
        );
    });
});
