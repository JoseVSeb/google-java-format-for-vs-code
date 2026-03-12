#!/usr/bin/env node
// @ts-check
/**
 * Regenerates the self-signed test CA and server certificates stored in
 * src/test/fixtures/.  These certificates are used by the fetchWithCerts.test.ts
 * suite to start a local HTTPS server whose CA is intentionally absent from
 * every system trust store, letting the tests confirm that:
 *
 *   1. fetchWithCerts(url, [caPem]) succeeds when the CA is explicitly supplied.
 *   2. fetchWithCerts(url) fails when the self-signed CA is NOT in the agent's
 *      trust store (proving that SSL validation is not disabled).
 *
 * Run this script whenever the test certificates are near expiry or have been
 * corrupted.  The certificates are committed to the repository so the test
 * suite works offline without needing OpenSSL at test time.
 *
 * Prerequisites: openssl must be on PATH.
 *
 * Usage:
 *   node scripts/generate-test-certs.js
 */

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FIXTURES_DIR = path.resolve(__dirname, "..", "src", "test", "fixtures");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gjf-test-certs-"));

try {
  // --- CA key + self-signed certificate -----------------------------------
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      path.join(tmpDir, "ca-key.pem"),
      "-out",
      path.join(tmpDir, "ca-cert.pem"),
      "-days",
      "3650",
      "-nodes",
      "-subj",
      "/C=US/O=TestCA/CN=Test Root CA",
    ],
    { stdio: "inherit" },
  );

  // --- Server key ---------------------------------------------------------
  execFileSync("openssl", ["genrsa", "-out", path.join(tmpDir, "server-key.pem"), "2048"], {
    stdio: "inherit",
  });

  // --- Server CSR ---------------------------------------------------------
  execFileSync(
    "openssl",
    [
      "req",
      "-new",
      "-key",
      path.join(tmpDir, "server-key.pem"),
      "-out",
      path.join(tmpDir, "server-csr.pem"),
      "-subj",
      "/C=US/O=TestServer/CN=localhost",
    ],
    { stdio: "inherit" },
  );

  // --- Extension file with Subject Alternative Names (SAN) ----------------
  const extPath = path.join(tmpDir, "server-ext.cnf");
  fs.writeFileSync(
    extPath,
    [
      "[req]",
      "req_extensions = v3_req",
      "[v3_req]",
      "subjectAltName = @alt_names",
      "[alt_names]",
      "IP.1 = 127.0.0.1",
      "DNS.1 = localhost",
    ].join("\n"),
  );

  // --- Sign server cert with the test CA ----------------------------------
  execFileSync(
    "openssl",
    [
      "x509",
      "-req",
      "-in",
      path.join(tmpDir, "server-csr.pem"),
      "-CA",
      path.join(tmpDir, "ca-cert.pem"),
      "-CAkey",
      path.join(tmpDir, "ca-key.pem"),
      "-CAcreateserial",
      "-out",
      path.join(tmpDir, "server-cert.pem"),
      "-days",
      "3650",
      "-extfile",
      extPath,
      "-extensions",
      "v3_req",
    ],
    { stdio: "inherit" },
  );

  // --- Verify the cert chain ----------------------------------------------
  execFileSync(
    "openssl",
    [
      "verify",
      "-CAfile",
      path.join(tmpDir, "ca-cert.pem"),
      path.join(tmpDir, "server-cert.pem"),
    ],
    { stdio: "inherit" },
  );

  // --- Copy to fixtures directory -----------------------------------------
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.copyFileSync(path.join(tmpDir, "ca-cert.pem"), path.join(FIXTURES_DIR, "test-ca.pem"));
  fs.copyFileSync(
    path.join(tmpDir, "server-cert.pem"),
    path.join(FIXTURES_DIR, "test-server-cert.pem"),
  );
  fs.copyFileSync(
    path.join(tmpDir, "server-key.pem"),
    path.join(FIXTURES_DIR, "test-server-key.pem"),
  );

  console.log(`\nTest certificates written to ${FIXTURES_DIR}:`);
  console.log("  test-ca.pem          — self-signed CA certificate (commit this)");
  console.log("  test-server-cert.pem — server certificate signed by test CA (commit this)");
  console.log("  test-server-key.pem  — server private key (commit this — test-only, no secrets)");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
